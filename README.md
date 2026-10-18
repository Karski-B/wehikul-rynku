# Wehikuł Rynku — nauka inwestowania przez wyzwania historyczne

Edukacyjna symulacja: masz **10 000 wirtualnych zł**, przechodzisz przez marzec 2020 r. sesja po
sesji i podejmujesz decyzje na prawdziwych (przeliczonych) cenach ropy WTI. XP dostajesz **za
proces** — plan, stop loss, wielkość pozycji i dyscyplinę — a nie za zysk.

> Symulacja edukacyjna. To nie jest porada inwestycyjna. Wszystkie środki są wirtualne.
> Aplikacja nie łączy się z brokerami i nie pozwala składać prawdziwych zleceń.

Stan projektu: **MVP gotowe do publikacji na GitHub Pages** po uzupełnieniu polityki prywatności —
instrukcja w [DEPLOY.md](DEPLOY.md). Formularz zapisu e-mail jest na razie wyłączony, bo GitHub Pages
nie uruchamia funkcji serwerowych.

## Uruchomienie na komputerze

Potrzebny jest tylko Python 3 (na macOS jest wbudowany). W folderze projektu:

```bash
python3 -m http.server 8000
```

Otwórz w przeglądarce:

| Adres | Co pokazuje |
|---|---|
| <http://localhost:8000> | aplikacja |
| <http://localhost:8000/?debug> | aplikacja + podgląd zdarzeń analityki (tryb testowy) |
| <http://localhost:8000/tests/> | testy automatyczne obliczeń (powinno być „31 z 31”) |
| <http://localhost:8000/tests/data-preview.html> | podgląd danych z JSON-u |

Zatrzymanie serwera: `Ctrl + C`. Nie otwieraj `index.html` podwójnym kliknięciem — moduły JS
i wczytywanie danych działają tylko przez serwer.

Na telefonie w tej samej sieci Wi-Fi: uruchom serwer poleceniem
`python3 -m http.server 8000 --bind 0.0.0.0` i wejdź na `http://<adres-IP-komputera>:8000`.

## Jak działa gra

1. **Plan przed startem:** maksymalna wielkość pozycji, poziom stop loss, pytanie o dywersyfikację.
2. **Sesja po sesji:** widzisz tylko notowania do „dziś”. Zlecenie złożone dziś **wykonuje się po cenie
   z następnej sesji** — nie da się handlować po znanej ani przyszłej cenie.
3. **Stop loss** sprzedaje całą pozycję, gdy cena zamknięcia spadnie poniżej poziomu. Na danych dziennych
   sprzedaż może nastąpić dużo niżej (luka cenowa) — gra to wyjaśnia.
4. **Limit straty:** gdy portfel spadnie poniżej 9 000 zł, wyzwanie kończy się od razu.
5. **Wynik:** wartość portfela, zysk/strata, XP w 5 kategoriach z uzasadnieniem każdej decyzji.

Wartość portfela = gotówka + liczba jednostek × cena symulacyjna bieżącej sesji.

## Struktura plików

```
index.html                 aplikacja (3 ekrany: plan, gra, wynik)
privacy.html               informacja o prywatności (wersja robocza z polami do uzupełnienia)
zapis-potwierdzony.html    strona po potwierdzeniu zapisu (na później, gdy włączysz formularz)
css/style.css              wszystkie style
js/main.js                 łączy wszystko i obsługuje kliknięcia
js/simulation.js           stan gry i obliczenia (bez HTML)
js/scoring.js              ocena procesu i XP (bez HTML) — tu są wszystkie reguły punktacji
js/render.js               rysowanie stanu na ekranie
js/chart.js                wykres (Chart.js 4.5.0 z CDN, wersja przypięta + SRI)
js/data.js                 wczytywanie i sprawdzanie danych
js/analytics.js            adapter analityki (tryb testowy albo Umami)
js/signup.js               formularz zapisu (wyłączony: signupEnabled: false w config.js)
js/config.js               publiczna konfiguracja — bez sekretów
js/storage.js, format.js   zapis w sessionStorage, formatowanie liczb i dat
api/subscribe.js           funkcja serwerowa (Vercel) do zapisu w Brevo — nieaktywna na GitHub Pages
data/challenge-march-2020.json   dane wyzwania
tools/build_challenge_data.py    skrypt, który pobiera dane z EIA i tworzy JSON
tests/                     testy w przeglądarce + podgląd danych
DATA_SOURCE.md             pochodzenie i licencja danych
PRIVACY.md                 szablon polityki prywatności + lista rzeczy do uzupełnienia
DEPLOY.md                  publikacja na GitHub Pages i diagnoza błędów
.env.example               wzór zmiennych dla formularza na Vercel (na później)
.nojekyll                  GitHub Pages publikuje pliki bez przetwarzania Jekyll
CLAUDE.md, PLAN.md         zasady projektu i plan pracy
.claude/launch.json        konfiguracja podglądu dla Claude Code
```

## Dane

Ceny: **ropa naftowa WTI (cena spot, Cushing), dane dzienne, seria RWTC.**

> Źródło: U.S. Energy Information Administration (Oct 2026). Ceny przeliczone przez autorów aplikacji
> na umowne zł symulacyjne (28.02.2020 = 100 zł), zachowujące historyczne zmiany procentowe.

Licencja, ograniczenia i pozostałe ryzyko: [DATA_SOURCE.md](DATA_SOURCE.md).
Odświeżenie danych: `python3 tools/build_challenge_data.py`.

## Konfiguracja

- **Analityka:** `js/config.js` → `analytics.provider` (`'test'` albo `'umami'`) i `umamiWebsiteId`.
  Website ID z Umami nie jest sekretem.
- **Zapis e-mail:** wyłączony (`signupEnabled: false` w `js/config.js`), bo GitHub Pages nie uruchamia
  `api/subscribe.js`. Jak go włączyć: [DEPLOY.md](DEPLOY.md), sekcja „Na później”. Klucz API nigdy nie
  trafia do plików w `js/` ani do repozytorium.

## Typowe problemy

| Objaw | Przyczyna i rozwiązanie |
|---|---|
| „Nie udało się uruchomić wyzwania” | Strona otwarta z pliku. Uruchom `python3 -m http.server 8000`. |
| `Address already in use` | Port 8000 jest zajęty. Użyj innego: `python3 -m http.server 8080`. |
| Zamiast wykresu komunikat o bibliotece | Brak internetu lub zablokowany cdnjs. Dane są w tabeli „Dane wykresu w tabeli”. |
| Po zmianach w kodzie widać starą wersję | Twarde odświeżenie: `Cmd + Shift + R` (macOS) / `Ctrl + F5`. |
| Gra zaczyna się od nowa | Stan jest w `sessionStorage` i znika po zamknięciu karty — tak ma być. |
| Na ekranie wyniku nie ma formularza e-mail | Celowo wyłączony (`signupEnabled: false`) — GitHub Pages nie obsługuje funkcji serwerowych. |
| Opublikowana strona: błąd 404 lub brak stylów | Zob. tabelę diagnozy w [DEPLOY.md](DEPLOY.md). |
| Testy nie pokazują „31 z 31” | Otwórz konsolę przeglądarki (`Cmd + Option + J`) i sprawdź, który test i dlaczego nie przeszedł. |

## Prawa autorskie

© 2026 Karski-B. Wszelkie prawa zastrzeżone. Kod nie jest objęty licencją open source —
bez pisemnej zgody autora nie wolno go kopiować, rozpowszechniać ani przerabiać.

Nie dotyczy to elementów pochodzących od innych:

- **Dane cenowe** — U.S. Energy Information Administration, domena publiczna (zob. [DATA_SOURCE.md](DATA_SOURCE.md)).
- **Chart.js** — licencja MIT, ładowany z cdnjs; nie jest częścią tego repozytorium.
