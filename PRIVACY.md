# PRIVACY.md — szablon informacji o prywatności

> **To jest szablon, a nie gotowa polityka ani porada prawna.** Pola oznaczone
> **[DO UZUPEŁNIENIA]** musisz wypełnić prawdziwymi danymi. Punkty **[SPRAWDŹ]** wymagają
> weryfikacji w aktualnych dokumentach dostawców. Publiczna wersja tego tekstu jest w
> [`privacy.html`](privacy.html) — po zmianach zaktualizuj **oba** pliki.
>
> Wersja dotyczy hostingu na **GitHub Pages z wyłączonym formularzem e-mail**.
> Gdy włączysz formularz, dodaj sekcje z [dodatku na końcu](#dodatek-gdy-włączysz-formularz-e-mail-brevo).
>
> Sama polityka prywatności **nie oznacza**, że aplikacja jest zgodna z RODO. Liczy się to,
> jak faktycznie przetwarzasz dane.

## Co trzeba uzupełnić i sprawdzić przed publicznym uruchomieniem

- [ ] **Administrator danych:** imię i nazwisko lub nazwa, adres, e-mail kontaktowy.
      Jeśli autor projektu jest niepełnoletni, skonsultuj z rodzicem, opiekunem lub nauczycielem,
      kto powinien pełnić tę rolę.
- [ ] **GitHub Pages:** GitHub zapisuje adres IP każdego odwiedzającego w celach bezpieczeństwa
      (dokumentacja „What is GitHub Pages?”, sekcja *Data collection*). Sprawdź w GitHub Privacy
      Statement, jak długo przechowuje te dane i na jakiej podstawie przekazuje je do USA.
- [ ] **cdnjs (Cloudflare):** przeglądarka pobiera stamtąd Chart.js, więc Cloudflare widzi adres IP.
- [ ] **Umami** — tylko jeśli włączysz statystyki: region danych, co zbiera skrypt, umowa
      powierzenia (DPA), okres przechowywania (plan Hobby: 6 miesięcy wg cennika z 18.10.2026).
      Jeśli statystyki są wyłączone, usuń ich opis z `privacy.html`.
- [ ] Czy statystyki bez cookies wymagają zgody, czy wystarczy informacja — sprawdź aktualne
      stanowisko UODO i przepisy Prawa komunikacji elektronicznej.
- [ ] Data ostatniej aktualizacji polityki.

---

## Informacja o prywatności — Wehikuł Rynku

Ostatnia aktualizacja: **[DO UZUPEŁNIENIA: data]**

### 1. Kto jest administratorem danych

Administratorem danych osobowych jest **[DO UZUPEŁNIENIA: imię i nazwisko lub nazwa]**,
**[DO UZUPEŁNIENIA: adres]**. Kontakt w sprawach danych osobowych:
**[DO UZUPEŁNIENIA: adres e-mail]**.

### 2. Jakie dane są przetwarzane i po co

| Sytuacja | Dane | Cel | Podstawa prawna |
|---|---|---|---|
| Otwarcie strony | adres IP i dane techniczne w logach GitHub Pages i sieci CDN (cdnjs) | dostarczenie strony, bezpieczeństwo | prawnie uzasadniony interes — art. 6 ust. 1 lit. f RODO |
| Statystyki (tylko jeśli są włączone) | liczba zdarzeń: rozpoczęcie wyzwania, ukończenie wyzwania, kliknięcie przycisku kursu; dane techniczne przetwarzane przez Umami **[SPRAWDŹ w dokumentacji Umami]** | ocena, czy narzędzie edukacyjne jest używane | prawnie uzasadniony interes — art. 6 ust. 1 lit. f RODO **[SPRAWDŹ, czy potrzebna zgoda]** |

**Nie zbieramy adresów e-mail** ani innych danych kontaktowych — formularz zapisu jest wyłączony.

**Gra nie wysyła danych.** Stan rozgrywki zapisuje się tylko w pamięci karty przeglądarki
(sessionStorage) i znika po jej zamknięciu.

Statystyki nie używają cookies. Skrypt Umami dołącza jednak dane techniczne (adres i tytuł strony, referrer, rozdzielczość ekranu, język), a serwer Umami widzi adres IP — dlatego nie piszemy „bez danych osobowych”. Liczymy zdarzenia,
a nie osoby.

### 3. Odbiorcy danych

- **GitHub, Inc.** (USA) — hosting strony (GitHub Pages). GitHub zapisuje adresy IP odwiedzających
  w celach bezpieczeństwa.
- **Cloudflare (cdnjs)** — dostarcza bibliotekę wykresów Chart.js.
- **Umami** — statystyki (tylko jeśli są włączone). Według FAQ Umami serwery znajdują się w USA
  i UE **[SPRAWDŹ region swojego konta]**.

### 4. Przekazywanie danych poza Europejski Obszar Gospodarczy

GitHub, Cloudflare i Umami mogą przetwarzać dane w USA. Podstawa przekazania:
**[SPRAWDŹ w dokumentach każdego dostawcy, np. EU-U.S. Data Privacy Framework lub standardowe klauzule umowne]**.

### 5. Jak długo dane są przechowywane

- Logi GitHub Pages: **[SPRAWDŹ w GitHub Privacy Statement]**.
- Statystyki: **[SPRAWDŹ — plan Hobby Umami przechowuje dane 6 miesięcy]**.
- Stan gry: do zamknięcia karty przeglądarki (tylko na Twoim urządzeniu).

### 6. Twoje prawa

Masz prawo do: dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania
oraz sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie. Kontakt:
**[DO UZUPEŁNIENIA: adres e-mail]**.

Możesz złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa,
uodo.gov.pl).

### 7. Zautomatyzowane decyzje

Nie podejmujemy decyzji wyłącznie w sposób zautomatyzowany i nie profilujemy użytkowników.
Punkty XP w grze są liczone w przeglądarce i nie są nigdzie zapisywane.

---

## Dodatek: gdy włączysz formularz e-mail (Brevo)

Formularz wymaga hostingu z funkcjami serwerowymi (np. Vercel — zob. DEPLOY.md) albo gotowego
formularza Brevo. Wtedy dodaj do polityki:

- **Dane i cel:** adres e-mail oraz informacja o zgodzie i jej potwierdzeniu (double opt-in) —
  wysyłka wiadomości o nowych wyzwaniach i materiałach edukacyjnych, w tym o płatnym kursie.
  Podstawa: zgoda (art. 6 ust. 1 lit. a RODO). Dowód zgody: art. 6 ust. 1 lit. c i f RODO **[SPRAWDŹ]**.
- **Odbiorca:** Brevo **[DO UZUPEŁNIENIA: pełna nazwa spółki i adres z DPA Brevo]**.
- **Okres przechowywania:** do wycofania zgody; zapisy niepotwierdzone — **[DO UZUPEŁNIENIA]**.
- **Wycofanie zgody:** w każdej chwili, linkiem „wypisz się” w każdej wiadomości albo e-mailem do
  administratora; wycofanie nie wpływa na zgodność z prawem wcześniejszego przetwarzania.
- **Prawo do przenoszenia danych** (dotyczy danych przetwarzanych na podstawie zgody).
- **Dobrowolność i wiek:** podanie e-maila jest dobrowolne; zapis dla osób, które ukończyły 16 lat **[SPRAWDŹ]**.
- **Zgoda na informację handlową** drogą elektroniczną (e-maile o płatnym kursie) — sprawdź wymogi
  przepisów o komunikacji elektronicznej.
- Brevo i Umami wymagają ukończonych 18 lat do założenia konta.
