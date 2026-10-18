# CLAUDE.md — stałe zasady projektu

Ten plik czyta Claude Code na początku każdej sesji. Zasady obowiązują w każdym kroku.
Kolejność pracy jest w [PLAN.md](PLAN.md).

## O projekcie

Edukacyjna aplikacja webowa (MVP) do nauki inwestowania przez interaktywne wyzwania
historyczne. Użytkownik dostaje wirtualny kapitał, przechodzi przez prawdziwy okres
z przeszłości krok po kroku i podejmuje decyzje. Aplikacja uczy procesu: planowania,
zarządzania ryzykiem i uzasadniania decyzji.

Autor jest uczniem technikum informatycznego (podstawy HTML, CSS, JS). Kod i wyjaśnienia
muszą być zrozumiałe dla początkującego programisty.

## Technologia

- HTML5, CSS3 i zwykły JavaScript. **Bez frameworków** (React, Vue, Angular, Svelte,
  jQuery, Bootstrap, Tailwind itp.).
- Bez npm, bundlerów i kroku budowania. Projekt to statyczne pliki.
- JavaScript jako moduły ES (`<script type="module">`). Dlatego stronę otwieramy przez
  lokalny serwer HTTP, a nie podwójnym kliknięciem pliku.
- Wykres: **Chart.js z CDN, wersja przypięta** razem z hashem SRI:

  ```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.0/chart.umd.min.js"
          integrity="sha512-Y51n9mtKTVBh3Jbx5pZSJNDDMyY+yGe77DGtBPzRlgsf/YLCh13kSZ3JmfHGzYFCmOndraf0sQgfM654b7dJ3w=="
          crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  ```

  Nigdy `latest` ani adres bez numeru wersji. Zmiana wersji to osobny krok z nowym hashem.
- Każda nowa biblioteka wymaga uzasadnienia i zgody autora projektu.

### Struktura plików

```
index.html, privacy.html, zapis-potwierdzony.html   strony
css/style.css          wszystkie style
js/main.js             punkt wejścia; js/render.js — rysowanie ekranu
js/simulation.js       stan gry i obliczenia finansowe (bez DOM)
js/scoring.js          ocena procesu i XP (bez DOM)
js/*.js                pozostałe moduły (dane, wykres, analityka, formularz, konfiguracja)
api/subscribe.js       jedyna funkcja serwerowa (Vercel) — zapis e-mail do Brevo
data/*.json            dane historyczne; tools/ — skrypt, który je tworzy
tests/                 testy w przeglądarce (tests/index.html)
```

Pełny opis: README.md. Nowe foldery tworzymy dopiero, gdy są potrzebne.

## Zasady produktu (nienaruszalne)

1. **Pieniądze są wyłącznie wirtualne.** Brak połączeń z brokerami, brak API giełd do
   składania zleceń, brak możliwości złożenia prawdziwego zlecenia. W interfejsie piszemy
   „wirtualne zł”.
2. **Brak linków do brokerów** i platform inwestycyjnych, brak kodów polecających
   i afiliacji. **Brak rekomendacji zakupu konkretnych instrumentów.** Scenariusze
   opisują, co działo się w przeszłości; nigdy nie mówią „kup X”.
3. **XP za proces, nie za zysk.** XP przyznajemy np. za: plan przed startem, ustalony
   i przestrzegany limit ryzyka, uzasadnienie decyzji, rozsądną wielkość pozycji,
   dywersyfikację, refleksję po wyzwaniu. Nie dajemy XP za wysoki zysk, liczbę transakcji
   ani „wszystko na jedną kartę”. Test: dwie rozgrywki z takim samym procesem i innym
   wynikiem finansowym dostają tyle samo XP.
4. **Dane historyczne mają udokumentowane pochodzenie.** Każdy plik w `data/` ma wpis
   w `DATA_SOURCE.md`: źródło (URL), data sprawdzenia, licencja lub warunki ponownego
   wykorzystania, wymagane oznaczenie źródła, opis przeliczeń i ograniczeń. Bez jasnej
   licencji — nie używamy danych. Ceny przeliczone oznaczamy jako „symulacyjne”.
5. **Sekrety nigdy w kodzie przeglądarki ani w publicznym repozytorium.** Żadnych kluczy
   API, tokenów ani haseł w `.html`, `.css`, `js/`, `.json`. Repozytorium jest publiczne
   (GitHub Pages). Jeśli kiedyś potrzebny będzie klucz, trafia tylko do zmiennych środowiskowych
   hostingu z funkcjami serwerowymi i czyta go tylko `api/`. Plik `.env` jest w `.gitignore`.
6. **Informacja „edukacja, nie porada”** jest stale widoczna (przyklejony pasek u góry)
   na każdej stronie. Standardowy tekst:

   > Symulacja edukacyjna. To nie jest porada inwestycyjna. Wszystkie środki są wirtualne.

7. **Bez kont, logowania, bazy danych i płatności.** Stan gry tylko w `sessionStorage`.
   Formularz e-mail jest wyłączony (`signupEnabled: false`). Po włączeniu adres trafia
   wyłącznie do Brevo (z potwierdzeniem double opt-in) i nigdy nie jest zapisywany
   w przeglądarce ani w logach.
8. **Analityka:** tylko trzy zdarzenia (`challenge_started`, `challenge_completed`,
   `course_cta_clicked`), bez dodatkowych danych, bez cookies i odcisku przeglądarki.
   Liczby to zdarzenia, a nie osoby.
9. **Przycisk kursu nie prowadzi do płatności.** Nie dodajemy koszyka ani bramki płatniczej.
10. **Hosting: GitHub Pages** (tylko pliki statyczne, bez funkcji serwerowych). Nie wolno
    go używać do strony nastawionej głównie na sprzedaż — gdy ruszy sprzedaż kursu, zmieniamy
    hosting (zob. DEPLOY.md). Ścieżki do plików zawsze względne, z poprawną wielkością liter.

## Dostępność i responsywność

- Działa od **360 px** szerokości, bez poziomego przewijania. Podejście mobile-first.
  Sprawdzamy szerokości 360, 768 i 1280 px.
- **Obsługa klawiaturą:** natywne `<button>`, `<a>`, `<input>` z `<label>`; widoczny
  `:focus-visible`; logiczna kolejność klawisza Tab; nie usuwamy obramowania fokusu bez
  zamiennika.
- Semantyczny HTML: `lang="pl"`, `<header>`, `<main>`, `<footer>`, nagłówki po kolei.
  Atrybuty `aria-*` tylko tam, gdzie zwykły HTML nie wystarcza. Zmieniające się komunikaty
  ogłaszamy przez `aria-live`.
- Wykres ma alternatywę tekstową (opis lub tabelę). Informacja nie może być przekazana
  wyłącznie kolorem.
- Kontrast tekstu co najmniej WCAG AA (4,5:1).
- **Ograniczenie animacji:** przy `prefers-reduced-motion: reduce` wyłączamy animacje CSS
  oraz animacje Chart.js (`animation: false`).
- Przyciski i pola mają co najmniej ok. 44 × 44 px na ekranach dotykowych.

## Styl kodu

- Nazwy zmiennych i funkcji po angielsku, komentarze i teksty interfejsu po polsku.
- Wcięcia 2 spacje, kodowanie UTF-8.
- `const` i `let`, bez `var`; porównania przez `===`.
- Bez `onclick` w HTML — zdarzenia przez `addEventListener`.
- Małe funkcje z jednym zadaniem. Obliczenia w osobnych modułach, bez dostępu do DOM,
  żeby dało się je łatwo sprawdzić.
- Kwoty i procenty formatujemy przez `Intl.NumberFormat('pl-PL', …)`.
- Każdy odczyt i zapis `sessionStorage`/`localStorage` w `try/catch`; aplikacja działa także bez zapisu.
- Kolory i odstępy jako zmienne CSS w `:root`.

## Sposób pracy

- **Robimy tylko bieżący krok z PLAN.md.** Nie implementujemy kolejnych kroków
  z wyprzedzeniem.
- Zmiany są małe i zrozumiałe. Przed większą zmianą — krótki plan.
- Nie usuwamy istniejących plików bez uzasadnienia.
- Nie instalujemy frameworków ani pakietów; nie dodajemy logowania, bazy danych ani
  płatności.
- Po każdym kroku: uruchom stronę lokalnie, sprawdź konsolę (zero błędów), szerokość
  360 px i obsługę klawiaturą; oznacz krok jako zrobiony w PLAN.md.
- Na koniec kroku wyjaśnij prostym językiem: co zrobiono, które pliki zmieniono, jak
  sprawdzić efekt i co będzie w następnym kroku.

## Uruchamianie lokalne

W folderze projektu:

```bash
python3 -m http.server 8000
```

Następnie otwórz <http://localhost:8000>. Zatrzymanie serwera: `Ctrl + C`.

Testy obliczeń: <http://localhost:8000/tests/> — po każdej zmianie w `js/simulation.js`,
`js/scoring.js` lub `api/subscribe.js` wszystkie testy muszą przechodzić.
