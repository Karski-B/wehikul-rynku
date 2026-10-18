# DATA_SOURCE.md — pochodzenie i licencja danych

Dotyczy pliku: [`data/challenge-march-2020.json`](data/challenge-march-2020.json)
Data sprawdzenia warunków: **18 października 2026 r.**
Plik wygenerowano skryptem [`tools/build_challenge_data.py`](tools/build_challenge_data.py)
(można go uruchomić ponownie: `python3 tools/build_challenge_data.py`).

## Podsumowanie

| | |
|---|---|
| Instrument | Ropa naftowa WTI, cena spot, Cushing (Oklahoma) |
| Zakres | 3.02.2020–31.03.2020: 19 sesji historii + 22 sesje wyzwania (marzec) |
| Wydawca danych | U.S. Energy Information Administration (EIA), agencja rządu USA |
| Status prawny | Domena publiczna według oficjalnych warunków EIA (szczegóły i ryzyko poniżej) |
| Użycie komercyjne | Według warunków EIA dozwolone; zalecane pisemne potwierdzenie przed sprzedażą kursu |
| Druga seria aktywów | **Brak** — aplikacja nie symuluje dywersyfikacji między aktywami |

## Źródło danych

- **Seria:** RWTC — *Cushing, OK WTI Spot Price FOB (Dollars per Barrel)*, dane dzienne.
- **Bezpośredni link do danych:**
  <https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RWTC&f=D>
- **Definicje i źródło pierwotne:**
  <https://www.eia.gov/dnav/pet/TblDefs/pet_pri_spt_tbldef2.asp>
  (w sekcji *Sources* EIA podaje: „Refinitiv, an LSEG business”).
- **Data publikacji danych przez EIA:** 15.10.2026 (*Release Date* na stronie serii).
- **Kontrola krzyżowa:** te same wartości w serii FRED `DCOILWTICO`
  (<https://fred.stlouisfed.org/series/DCOILWTICO>). Wszystkie 41 wartości są identyczne.
  FRED oznacza tę serię tagiem **„Public Domain: Citation Requested”**.

## Licencja — właściwy fragment warunków

Strona **Copyrights and Reuse** EIA: <https://www.eia.gov/about/copyrights_reuse.php>

> U.S. government publications are in the public domain and are not subject to copyright
> protection. You may use and/or distribute any of our data, files, databases, reports,
> graphs, charts, and other information products that are on our website (...)
> However, if you use or reproduce any of our information products, you should use an
> acknowledgment, which includes the publication date, such as: "Source: U.S. Energy
> Information Administration (Oct 2008)."

Ta sama strona zawiera też zastrzeżenie *Protected materials*. Materiały „przekazane lub
licencjonowane” przez prywatne firmy mogą być chronione prawem autorskim. Cytowany tekst
pochodzi od rządu USA i jest w domenie publicznej, więc można go cytować.

## Dlaczego wolno nam z tych danych korzystać

Potrzebujemy trzech rzeczy:

1. **Zapis w publicznym repozytorium** — warunki EIA pozwalają rozpowszechniać („distribute”)
   dowolne dane z jej strony.
2. **Wyświetlanie na publicznej stronie** — j.w.; domena publiczna nie ogranicza sposobu
   prezentacji.
3. **Projekt, który może promować płatny kurs** — domena publiczna nie rozróżnia użycia
   prywatnego i komercyjnego; warunki EIA nie zawierają ograniczenia do celów
   niekomercyjnych.

Jedyny obowiązek to oznaczenie źródła z datą publikacji (sekcja niżej).

## Pozostałe ryzyko — zgłaszam jawnie

EIA podaje, że ceny spot pochodzą od **Refinitiv (LSEG)**, czyli firmy prywatnej. Zastrzeżenie
*Protected materials* mogłoby teoretycznie objąć takie dane. Za tym, że dane są swobodnie
dostępne, przemawiają:

- ogólna zgoda EIA obejmuje „any of our data (...) on our website”, a seria jest publikowana
  przez EIA bez żadnego dodatkowego zastrzeżenia praw;
- FRED (który usuwa lub oznacza serie z ograniczeniami licencyjnymi) oznacza tę serię jako
  domenę publiczną.

**Ocena:** użycie jest zgodne z opublikowanymi warunkami EIA. Ryzyko jest niskie, ale nie
zerowe. **Przed uruchomieniem sprzedaży kursu** zalecam napisać do EIA przez stronę
kontaktową (link „Contact Us” na stronie *Copyrights and Reuse*) z pytaniem o serię RWTC
w projekcie komercyjnym i zachować odpowiedź. Do tego czasu traktuj tę kwestię jako otwartą
w PLAN.md (punkt kontrolny A).

## Wymagane oznaczenie źródła

W aplikacji (pod wykresem) i w README:

> Źródło: U.S. Energy Information Administration (Oct 2026). Seria RWTC (WTI Cushing, cena spot).
> Ceny przeliczone przez autorów aplikacji na umowne zł symulacyjne.

Druga linia mówi, kto wykonał przeliczenie — EIA prosi o wskazanie, co jest treścią EIA,
a co nie. Nie używamy logo EIA (jest zastrzeżonym znakiem towarowym).

## Przeliczenia i jednostki

- **Waluta źródłowa:** USD. **Jednostka źródłowa:** USD za baryłkę, cena zamknięcia spot z dnia.
- **Cena w grze:** „zł symulacyjne za 1 jednostkę”, liczona tak:
  `price = close / 44.83 * 100`, gdzie 44,83 USD to cena z 28.02.2020 (start wyzwania = 100 zł).
- To jest **cena symulacyjna, która zachowuje historyczne zmiany procentowe**, a nie
  rzeczywista cena transakcyjna. Zaokrąglenie: 4 miejsca po przecinku.
- **Nie uwzględniamy kursu USD/PLN** ani kosztów transakcyjnych.
- Plik zawiera obie wartości: oryginalną (`close`, USD) i symulacyjną (`price`, zł).

## Ograniczenia danych

- Dane są **dzienne** (jedna cena na dzień). Nie wiadomo, jak cena zmieniała się w ciągu dnia,
  więc stop loss i zlecenia w grze są wykonywane w uproszczeniu.
- Cena spot fizycznej ropy w Cushing nie jest instrumentem, który zwykły inwestor kupuje
  bezpośrednio. W grze to „aktywo edukacyjne”, a nie odwzorowanie konkretnego produktu.
- **17.02.2020** nie ma notowania (dzień wolny na rynku w USA). Nie dopisaliśmy tej sesji.
- EIA może korygować dane historyczne. Wartości odpowiadają publikacji z 15.10.2026.
- Plik JSON jest publiczny, więc dociekliwy użytkownik może podejrzeć przyszłe ceny
  w narzędziach przeglądarki. Interfejs ich nie pokazuje.

## Druga seria aktywów (dywersyfikacja)

Format danych jest przygotowany na kilka aktywów: tablica `assets` plus wspólny kalendarz
`calendar`. **Nie dodałem drugiej serii**, bo nie potwierdziłem dla żadnej warunków
równie jasnych jak w przypadku EIA:

- **API NBP (kursy walut, np. USD/PLN)** — strona api.nbp.pl nie podaje warunków ponownego
  wykorzystania; wymaga osobnego sprawdzenia na nbp.pl lub pytania do NBP.
- **Indeksy giełdowe (np. S&P 500, WIG20)** — nie weryfikowałem; dostawcy indeksów zwykle
  licencjonują dane i nazwy indeksów, więc nie zakładam, że wolno je publikować.

Dlatego wyzwanie zawiera jedno aktywo (ropa WTI) i gotówkę. Aplikacja **nie udaje**
dywersyfikacji między aktywami.

## Legalna alternatywa, gdyby dane EIA okazały się niedostępne

1. Wybrać inną serię wydawaną przez instytucję publiczną z jasną licencją i ponownie przejść
   punkt kontrolny A.
2. Albo użyć scenariusza **ilustracyjnego** (wygenerowanego), wyraźnie oznaczonego w interfejsie
   jako „dane przykładowe, nie historyczne”. Takich danych nie wolno przedstawiać jako
   prawdziwych.
