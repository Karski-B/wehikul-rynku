"""Buduje plik data/challenge-march-2020.json z oficjalnych danych EIA.

Uruchomienie (w głównym folderze projektu):
    python3 tools/build_challenge_data.py

Skrypt:
1. pobiera publiczną stronę EIA z dziennymi cenami spot ropy WTI (seria RWTC),
2. wybiera sesje od 3 lutego 2020 r. do najnowszej opublikowanej sesji,
3. przelicza ceny w USD na umowną cenę symulacyjną w zł (28.02.2020 = 100 zł),
4. dodaje warianty długości wyzwania i opisy ważnych wydarzeń rynkowych,
5. sprawdza poprawność dat i zapisuje JSON.

Nie wymaga kluczy API ani dodatkowych pakietów.
"""

import datetime
import html
import json
import re
import urllib.request
from pathlib import Path

SOURCE_URL = "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RWTC&f=D"
HISTORY_START = datetime.date(2020, 2, 3)   # pierwsza sesja widoczna na starcie
START_DATE = datetime.date(2020, 2, 28)     # ostatnia sesja znana przed wyzwaniem
# Warianty długości wyzwania: (id, nazwa, ostatni dzień). None = najnowsze dane EIA.
HORIZONS = [
    ("march-2020", "Marzec 2020", datetime.date(2020, 3, 31)),
    ("q2-2020", "Do końca czerwca 2020", datetime.date(2020, 6, 30)),
    ("year-2020", "Cały rok 2020", datetime.date(2020, 12, 31)),
    ("all", "Bez limitu — do najnowszych danych", None),
]
DEFAULT_HORIZON = "march-2020"
# Wydarzenia pokazywane w grze dopiero, gdy gracz dojdzie do danej sesji.
# Opisy: opracowanie własne autorów aplikacji (fakty powszechnie znane), nie pochodzą z EIA.
MARKET_EVENTS = [
    ("2020-03-06", "OPEC+ bez porozumienia",
     "Rozmowy państw OPEC i Rosji (OPEC+) w Wiedniu zakończyły się bez zgody na dalsze ograniczenie wydobycia ropy."),
    ("2020-03-09", "Początek wojny cenowej",
     "W weekend Arabia Saudyjska zapowiedziała obniżki cen i zwiększenie wydobycia. Na otwarciu tygodnia ceny ropy gwałtownie spadają."),
    ("2020-03-11", "WHO ogłasza pandemię",
     "Światowa Organizacja Zdrowia uznała COVID-19 za pandemię. Ograniczenia podróży i działalności gospodarczej zmniejszają popyt na paliwa."),
    ("2020-04-13", "Rekordowe cięcia OPEC+",
     "12 kwietnia państwa OPEC+ uzgodniły rekordowe ograniczenie wydobycia — ok. 9,7 mln baryłek dziennie od maja."),
    ("2020-04-20", "Cena ropy poniżej zera",
     "Cena ropy WTI spadła poniżej zera. Dzień przed wygaśnięciem majowego kontraktu terminowego magazyny w Cushing "
     "były prawie pełne, więc posiadacze tych kontraktów płacili, żeby nie musieć odebrać ropy. Przy kontraktach "
     "terminowych można stracić więcej, niż się wpłaciło. W grze cena symulacyjna też jest ujemna — posiadane "
     "jednostki obniżają wartość portfela, a kupno jest niemożliwe."),
    ("2020-11-09", "Wiadomość o szczepionce",
     "Pfizer i BioNTech ogłosili wysoką skuteczność szczepionki na COVID-19. Rynki zareagowały optymizmem co do powrotu popytu."),
    ("2022-02-24", "Inwazja Rosji na Ukrainę",
     "Rosja rozpoczęła pełnoskalową inwazję na Ukrainę. Rośnie niepewność co do dostaw surowców energetycznych."),
    ("2022-03-08", "USA zakazują importu rosyjskiej ropy",
     "Prezydent USA ogłosił zakaz importu rosyjskiej ropy do Stanów Zjednoczonych."),
    ("2022-03-31", "USA uwalniają rezerwy ropy",
     "USA zapowiedziały uwalnianie ok. 1 mln baryłek ropy dziennie z rezerw strategicznych przez pół roku, żeby obniżyć ceny paliw."),
    ("2022-10-05", "OPEC+ tnie wydobycie o 2 mln baryłek",
     "Państwa OPEC+ uzgodniły obniżenie docelowego wydobycia o 2 mln baryłek dziennie od listopada 2022 r."),
    ("2023-04-03", "Niespodziewane cięcia OPEC+",
     "W niedzielę Arabia Saudyjska i kilka innych państw OPEC+ zapowiedziały dobrowolne ograniczenie wydobycia, "
     "łącznie o ok. 1,2 mln baryłek dziennie."),
    ("2023-06-05", "Dodatkowe cięcie Arabii Saudyjskiej",
     "Arabia Saudyjska zapowiedziała w weekend dodatkowe dobrowolne ograniczenie wydobycia o 1 mln baryłek dziennie od lipca. "
     "Tym razem cena zmieniła się niewiele — nie każda ważna wiadomość mocno porusza rynkiem."),
    ("2024-06-03", "OPEC+ zapowiada wycofywanie cięć",
     "OPEC+ przedłużył ograniczenia wydobycia na 2025 r., ale zapowiedział stopniowe wycofywanie części dobrowolnych cięć "
     "od jesieni 2024 r."),
    ("2025-04-03", "Cła w USA i decyzja OPEC+",
     "Po ogłoszeniu przez USA szerokich ceł importowych rynek obawiał się spowolnienia gospodarki. Tego samego dnia "
     "część państw OPEC+ zapowiedziała szybsze zwiększanie wydobycia."),
    ("2025-06-13", "Atak Izraela na Iran",
     "Izrael przeprowadził ataki na cele w Iranie. Rynek obawiał się zakłóceń dostaw ropy z Bliskiego Wschodu."),
    ("2025-06-23", "Ograniczony odwet Iranu",
     "W weekend USA zaatakowały irańskie obiekty jądrowe. Iran odpowiedział w ograniczony sposób, "
     "a wieczorem ogłoszono rozejm między Izraelem a Iranem. "
     "Rynek uznał, że ryzyko przerw w dostawach maleje."),
]
BASE_PRICE = 100.0                          # cena symulacyjna w dniu START_DATE
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "challenge-march-2020.json"
MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def download_page():
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_daily_values(page):
    """Zwraca listę (data, cena USD). Puste komórki (brak notowania) są pomijane."""
    values = []
    for row in re.findall(r"(?s)<tr>(.*?)</tr>", page):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).replace("\xa0", " ").strip()
                 for c in re.findall(r"(?s)<td[^>]*>(.*?)</td>", row)]
        # Wiersz tygodnia wygląda tak: "2020 Feb-24 to Feb-28", pon, wt, śr, czw, pt
        match = re.match(r"(\d{4}) (\w{3})-\s*(\d{1,2}) to", cells[0]) if cells else None
        if not match:
            continue
        monday = datetime.date(int(match[1]), MONTHS[match[2]], int(match[3]))
        for offset, cell in enumerate(cells[1:6]):
            if cell:
                values.append((monday + datetime.timedelta(days=offset), float(cell)))
    return values


def main():
    page = download_page()
    release = re.search(r"Release Date:\s*(\d{1,2}/\d{1,2}/\d{4})", html.unescape(re.sub(r"<[^>]+>", " ", page)))
    assert release, "Nie znaleziono daty publikacji (Release Date) na stronie EIA"
    release_date = datetime.datetime.strptime(release[1], "%m/%d/%Y").date()
    all_values = parse_daily_values(page)
    selected = sorted((d, v) for d, v in all_values if d >= HISTORY_START)
    end_date = selected[-1][0]

    # Kontrola poprawności: rosnące, unikalne daty i brak weekendów
    dates = [d for d, _ in selected]
    assert dates == sorted(set(dates)), "Daty muszą być unikalne i rosnące"
    assert all(d.weekday() < 5 for d in dates), "W danych nie może być weekendów"
    assert START_DATE in dates, "Brakuje daty startu"
    assert all(date in {d.isoformat() for d in dates} for date, _, _ in MARKET_EVENTS), "Wydarzenie poza sesją"

    # Dni robocze bez notowania w źródle (np. święta w USA) - tylko do dokumentacji
    missing = []
    day = HISTORY_START
    while day <= end_date:
        if day.weekday() < 5 and day not in dates:
            missing.append(day.isoformat())
        day += datetime.timedelta(days=1)

    horizons = []
    for horizon_id, label, target in HORIZONS:
        last = max(d for d in dates if d <= (target or end_date))
        horizons.append({
            "id": horizon_id,
            "label": label,
            "endDate": last.isoformat(),
            "sessions": sum(1 for d in dates if START_DATE < d <= last),
        })

    base_close = dict(selected)[START_DATE]
    sessions = [{
        "date": d.isoformat(),
        "close": v,
        "price": round(v / base_close * BASE_PRICE, 4),
    } for d, v in selected]

    challenge = {
        "schemaVersion": 2,
        "id": "march-2020",
        "title": "Marzec 2020: Przetrwaj krach",
        "goal": "Masz 10 000 zł wirtualnych. Przetrwaj krach i nie strać więcej niż 10% kapitału początkowego.",
        "intro": ("Jest 28 lutego 2020 r. Na świecie rozprzestrzenia się COVID-19, a w ostatnim tygodniu "
                  "cena ropy wyraźnie spadła. Nie wiesz, co będzie dalej — widzisz tylko dane do dziś."),
        "rules": {
            "initialCapital": 10000,
            "currency": "PLN",
            "currencyNote": "Wszystkie kwoty w grze to wirtualne złote. Nie są to prawdziwe pieniądze.",
            "maxLossPercent": 10,
            "minPortfolioValue": 9000,
        },
        "timeline": {
            "historyStart": HISTORY_START.isoformat(),
            "startDate": START_DATE.isoformat(),
            "endDate": end_date.isoformat(),
            "note": ("Sesje do startDate włącznie są widoczne od początku. Sesje po startDate "
                     "odsłaniane są pojedynczo w trakcie wyzwania. Gracz wybiera długość wyzwania "
                     "(horizons) i może ją później przedłużyć — najdalej do endDate."),
            "defaultHorizon": DEFAULT_HORIZON,
            "horizons": horizons,
            "missingWeekdays": [{
                "date": d,
                "reason": "Brak notowania w źródle EIA (dzień wolny na rynku USA).",
            } for d in missing],
        },
        "calendar": [s["date"] for s in sessions],
        "assets": [{
            "id": "wti",
            "name": "Ropa naftowa WTI (cena spot, Cushing, Oklahoma)",
            "shortName": "Ropa WTI",
            "type": "surowiec",
            "sourceId": "eia-rwtc",
            "sourceSeries": "RWTC - Cushing, OK WTI Spot Price FOB (Dollars per Barrel)",
            "sourceCurrency": "USD",
            "sourceUnit": "USD za baryłkę (cena zamknięcia spot z danego dnia)",
            "priceUnit": "zł symulacyjne za 1 jednostkę",
            "priceIsSimulated": True,
            "conversion": {
                "method": ("Cena symulacyjna zachowuje historyczne zmiany procentowe ceny w USD. "
                           "Nie jest rzeczywistą ceną transakcyjną."),
                "formula": f"price = close / {base_close} * {BASE_PRICE:g}",
                "baseDate": START_DATE.isoformat(),
                "baseClose": base_close,
                "basePrice": BASE_PRICE,
                "rounding": "price zaokrąglone do 4 miejsc po przecinku",
                "fxIncluded": False,
                "fxNote": ("Przeliczenie nie uwzględnia kursu USD/PLN ani kosztów transakcyjnych. "
                           "Polski inwestor miałby dodatkowo zysk lub stratę na walucie."),
                "negativePrices": [s for s in [{"date": d.isoformat(), "close": v} for d, v in selected] if s["close"] <= 0],
                "negativePriceNote": ("Ujemne ceny są prawdziwymi wartościami ze źródła i nie zostały zmienione. "
                                      "W grze nie można kupić po cenie zerowej lub ujemnej."),
            },
            "sessions": sessions,
        }],
        "marketEvents": [{"date": d, "title": title, "text": text} for d, title, text in MARKET_EVENTS],
        "marketEventsSource": ("Opisy wydarzeń: opracowanie własne autorów aplikacji na podstawie powszechnie "
                               "znanych faktów. Nie są częścią danych EIA."),
        "diversification": {
            "multiAssetAvailable": False,
            "note": ("W tym wyzwaniu jest tylko jedno aktywo (ropa WTI) oraz gotówka. Aplikacja nie "
                     "symuluje dywersyfikacji między aktywami. Format danych pozwala dodać kolejne "
                     "aktywo w tablicy assets (z sesjami zgodnymi z tablicą calendar)."),
        },
        "sources": [{
            "id": "eia-rwtc",
            "publisher": "U.S. Energy Information Administration (EIA)",
            "originalDataProvider": "Refinitiv, an LSEG business (wg strony Definitions, Sources and Explanatory Notes EIA)",
            "url": SOURCE_URL,
            "termsUrl": "https://www.eia.gov/about/copyrights_reuse.php",
            "license": "Domena publiczna (publikacja rządu USA) - wg strony Copyrights and Reuse EIA",
            # EIA prosi o oznaczenie źródła z datą publikacji, np. "(Oct 2008)"
            "attribution": f"Źródło: U.S. Energy Information Administration ({release_date.strftime('%b %Y')})",
            "sourceReleaseDate": release_date.isoformat(),
            "retrievedOn": datetime.date.today().isoformat(),
            "details": "DATA_SOURCE.md",
        }],
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(to_readable_json(challenge), encoding="utf-8")
    print(f"Zapisano {OUTPUT.name}: {len(sessions)} sesji ({HISTORY_START} – {end_date}).")
    for h in horizons:
        print(f"  {h['label']}: {h['sessions']} sesji, do {h['endDate']}")
    print(f"Dni robocze bez notowania: {len(missing)}")
    print(f"Ceny ujemne: {[(d.isoformat(), v) for d, v in selected if v <= 0] or 'brak'}")


def to_readable_json(challenge):
    """JSON z wcięciami, ale z jedną sesją na linię (plik jest wtedy krótszy i czytelny)."""
    sessions = challenge["assets"][0]["sessions"]
    placeholder = {**challenge, "calendar": "@CALENDAR@",
                   "assets": [{**challenge["assets"][0], "sessions": "@SESSIONS@"}]}
    text = json.dumps(placeholder, ensure_ascii=False, indent=2)
    calendar = "[\n" + ",\n".join(f'    "{d}"' for d in challenge["calendar"]) + "\n  ]"
    rows = "[\n" + ",\n".join("        " + json.dumps(s, ensure_ascii=False) for s in sessions) + "\n      ]"
    text = text.replace('"@CALENDAR@"', calendar).replace('"@SESSIONS@"', rows)
    json.loads(text)  # kontrola: wynik nadal jest poprawnym JSON-em
    return text + "\n"


if __name__ == "__main__":
    main()
