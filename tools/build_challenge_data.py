"""Buduje plik data/challenge-march-2020.json z oficjalnych danych EIA.

Uruchomienie (w głównym folderze projektu):
    python3 tools/build_challenge_data.py

Skrypt:
1. pobiera publiczną stronę EIA z dziennymi cenami spot ropy WTI (seria RWTC),
2. wybiera sesje od 3 lutego do 31 marca 2020 r.,
3. przelicza ceny w USD na umowną cenę symulacyjną w zł (28.02.2020 = 100 zł),
4. sprawdza poprawność dat i zapisuje JSON.

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
END_DATE = datetime.date(2020, 3, 31)       # ostatnia sesja wyzwania
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
    selected = [(d, v) for d, v in all_values if HISTORY_START <= d <= END_DATE]
    selected.sort()

    # Kontrola poprawności: rosnące, unikalne daty i brak weekendów
    dates = [d for d, _ in selected]
    assert dates == sorted(set(dates)), "Daty muszą być unikalne i rosnące"
    assert all(d.weekday() < 5 for d in dates), "W danych nie może być weekendów"
    assert START_DATE in dates and END_DATE in dates, "Brakuje daty startu lub końca"

    # Dni robocze bez notowania w źródle (np. święta w USA) - tylko do dokumentacji
    missing = []
    day = HISTORY_START
    while day <= END_DATE:
        if day.weekday() < 5 and day not in dates:
            missing.append(day.isoformat())
        day += datetime.timedelta(days=1)

    base_close = dict(selected)[START_DATE]
    sessions = [{
        "date": d.isoformat(),
        "close": v,
        "price": round(v / base_close * BASE_PRICE, 4),
    } for d, v in selected]

    challenge = {
        "schemaVersion": 1,
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
            "endDate": END_DATE.isoformat(),
            "note": ("Sesje do startDate włącznie są widoczne od początku. Sesje po startDate "
                     "odsłaniane są pojedynczo w trakcie wyzwania."),
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
            },
            "sessions": sessions,
        }],
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
    OUTPUT.write_text(json.dumps(challenge, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    march = [s for s in sessions if s["date"] > START_DATE.isoformat()]
    print(f"Zapisano {OUTPUT.name}: {len(sessions)} sesji, w tym {len(march)} sesji wyzwania.")
    print(f"Dni robocze bez notowania: {missing or 'brak'}")


if __name__ == "__main__":
    main()
