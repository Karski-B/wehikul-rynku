# PLAN.md — plan i stan MVP

Zasady obowiązujące w każdym kroku są w [CLAUDE.md](CLAUDE.md).
Legenda: ✅ zrobione · ⚠️ zrobione z zastrzeżeniem · ⬜ do zrobienia · 🔒 punkt kontrolny

Stan na 18.10.2026: **MVP działa lokalnie i przechodzi testy (31/31). Hosting: GitHub Pages.**
Przed publikacją trzeba uzupełnić politykę prywatności — zob. [DEPLOY.md](DEPLOY.md).

## Etapy

| Etap | Zakres | Stan |
|---|---|---|
| 0. Inicjalizacja | CLAUDE.md, PLAN.md, strona techniczna | ✅ |
| 1. Dane historyczne 🔒A | `data/challenge-march-2020.json`, `DATA_SOURCE.md`, skrypt `tools/`, podgląd `tests/data-preview.html` | ⚠️ dane z EIA (domena publiczna); zalecane potwierdzenie EIA przed sprzedażą kursu; brak legalnie potwierdzonej drugiej serii |
| 2. Interfejs | 3 ekrany, wykres Chart.js 4.5.0 (SRI), odsłanianie dzień po dniu, stały pasek „edukacja, nie porada” | ✅ |
| 3. Mechanika gry | `js/simulation.js`: kupno/sprzedaż, stop loss, limit 10%, dziennik, reset, `sessionStorage` | ✅ |
| 4. Ocena procesu | `js/scoring.js`: 5 kategorii, 100 XP, ekran wyników z wyjaśnieniami | ✅ |
| 5. Zapis e-mail 🔒B | formularz, `api/subscribe.js` (Brevo, double opt-in), `PRIVACY.md`, `privacy.html` | ⏸ wyłączony (`signupEnabled: false`) — GitHub Pages nie uruchamia funkcji serwerowych; kod i testy zostają na później |
| 6. Analityka i kurs 🔒C | adapter (tryb testowy / Umami), 3 zdarzenia, przycisk kursu z oknem bez płatności | ⚠️ działa w trybie testowym; wymaga konta Umami |
| 7. Kontrola jakości i publikacja 🔒D | audyt, README, DEPLOY, `.nojekyll`, wersja pod GitHub Pages | ⚠️ gotowe technicznie; czeka na uzupełnienie polityki prywatności |

## Reguła wykonania zleceń (ważne dla przyszłych zmian)

Zlecenie złożone po poznaniu ceny sesji *t* wykonuje się po cenie sesji *t+1*. Kolejność przy
nowej sesji: odsłonięcie ceny → stop loss → oczekujące zlecenie → wycena portfela → limit straty.

## Kryteria ukończenia MVP

- [x] Wyzwanie startuje z wirtualnym kapitałem 10 000 zł.
- [x] Dane wczytywane z lokalnego JSON-u; przyszłe sesje niewidoczne (wykres, tabela, oś Y).
- [x] Transakcje wyłącznie wirtualne; brak linków do brokerów i rekomendacji.
- [x] Wartość portfela i dziennik są zgodne (test automatyczny).
- [x] Limit straty 10% kończy wyzwanie; ekran wyniku działa także po porażce.
- [x] XP zależy od procesu, nie od zysku (testy: ten sam proces z innym zyskiem = to samo XP).
- [x] Ekran końcowy wyjaśnia dobre i złe decyzje, odwołując się do konkretnych dat i kwot.
- [x] Formularz bez konfiguracji nie udaje zapisu; e-mail nie trafia do pamięci przeglądarki (obecnie formularz wyłączony).
- [x] Przycisk kursu nie prowadzi do płatności; kliknięcie = jedno zdarzenie.
- [x] 360 / 390 / 768 / 1440 px bez poziomego przewijania; obsługa klawiaturą; kontrast ≥ 4,5:1.
- [ ] Ograniczenie animacji sprawdzone ręcznie z włączonym ustawieniem systemowym (reguła CSS jest).
- [ ] Polityka prywatności uzupełniona (🔒B).
- [x] Hosting zgodny z warunkami: GitHub Pages dla wersji edukacyjnej bez sprzedaży (🔒D).
- [ ] Publikacja i test na publicznym adresie.

## Punkty kontrolne

### 🔒 A — Licencja danych

- [x] Źródło: EIA, seria RWTC; warunki „Copyrights and Reuse” pozwalają używać i rozpowszechniać dane.
- [x] Opis w `DATA_SOURCE.md` (link, fragment warunków, oznaczenie źródła, przeliczenia, ograniczenia).
- [x] Oznaczenie źródła widoczne pod wykresem i w stopce.
- [ ] Pisemne potwierdzenie od EIA dla użycia komercyjnego (ceny pochodzą od Refinitiv/LSEG).
- [ ] Druga seria aktywów — tylko po sprawdzeniu licencji (np. NBP).

### 🔒 B — RODO i prywatność

- [x] Brak kont; stan gry tylko w `sessionStorage`; formularz e-mail wyłączony.
- [x] Polityka opisuje GitHub Pages (logi IP), cdnjs i opcjonalnie Umami.
- [ ] Uzupełnić pola `[DO UZUPEŁNIENIA]` i `[SPRAWDŹ]` w `PRIVACY.md` i `privacy.html`.
- [ ] Po włączeniu formularza: dodać sekcje z dodatku w `PRIVACY.md` (Brevo i Umami wymagają 18 lat).

### 🔒 C — Statystyki

- [x] Wybrano Umami Cloud Hobby (bezpłatny, własne zdarzenia, bez cookies). Vercel Web Analytics
      odrzucony: własne zdarzenia nie są dostępne na planie Hobby.
- [x] Tylko 3 nazwy zdarzeń, bez danych dodatkowych; ochrona przed podwójnym wysłaniem.
- [ ] Konto Umami i Website ID w `js/config.js`.

### 🔒 D — Publikacja

- [x] Vercel Hobby odrzucony: tylko niekomercyjnie, a reklama sprzedaży produktu = komercyjne.
- [x] Wybrano GitHub Pages: darmowe dla publicznego repozytorium; zakaz stron głównie sprzedażowych.
- [x] Formularz e-mail wyłączony, dodano `.nojekyll`, ścieżki względne.
- [ ] Wdrożenie według DEPLOY.md i test publicznego adresu.
- [ ] Przed sprzedażą kursu: zmiana hostingu i potwierdzenie licencji od EIA.

## Poza zakresem MVP

Logowanie i konta, baza danych, płatności i koszyk, rankingi, notowania na żywo, frameworki,
npm, dźwignia i krótka sprzedaż, połączenia z brokerami.
