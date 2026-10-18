# DEPLOY.md — publikacja na GitHub Pages

Wybrany hosting: **GitHub Pages** — darmowy dla publicznego repozytorium, wystarczy konto GitHub
(od 13 lat). GitHub Pages udostępnia tylko pliki statyczne (HTML, CSS, JS), dlatego **formularz e-mail
jest wyłączony** (`signupEnabled: false` w `js/config.js`). Cała gra, wykres, XP, przycisk kursu
i statystyki Umami działają bez serwera.

## Status (18.10.2026): gotowe technicznie, czeka na politykę prywatności

| # | Warunek | Stan |
|---|---|---|
| 1 | Pola `[DO UZUPEŁNIENIA]` w `privacy.html` i `PRIVACY.md` (administrator, kontakt, okresy przechowywania) | ⬜ do zrobienia przez Ciebie — **bez tego nie udostępniaj strony ludziom** |
| 2 | Zasady GitHub Pages | ✅ zob. niżej |
| 3 | Licencja danych EIA | ✅ dla wersji edukacyjnej; przed sprzedażą kursu zalecane potwierdzenie od EIA (`DATA_SOURCE.md`) |
| 4 | Brak sekretów w repozytorium | ✅ w kodzie nie ma kluczy; `.env` jest w `.gitignore` |

### Zasady GitHub Pages — co wolno

Według [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
GitHub Pages nie może służyć jako darmowy hosting dla biznesu online, sklepu ani strony
„primarily directed at either facilitating commercial transactions or providing commercial software
as a service”. Wehikuł Rynku jest przede wszystkim grą edukacyjną, a przycisk „Pełny kurs – 19 zł”
niczego nie sprzedaje — to mieści się w tych zasadach według mojej interpretacji (nie jest to gwarancja).
**Gdy zaczniesz sprzedawać kurs** (płatności, sklep, strona głównie sprzedażowa), przenieś projekt
na hosting dopuszczający użycie komercyjne.

Limity: jedna strona do 1 GB, transfer ok. 100 GB miesięcznie (miękki limit). Cały projekt
zajmuje ok. 0,2 MB.

---

## Krok po kroku

### 1. Konto i repozytorium na GitHubie

1. Załóż konto na github.com (jeśli go nie masz). Zapamiętaj swój **login**.
2. **New repository** → nazwa np. `wehikul-rynku` → **Public** (GitHub Pages w darmowym planie
   działa tylko dla publicznych repozytoriów) → nie zaznaczaj „Add a README” → **Create repository**.

### 2. Wysłanie plików (Terminal, w folderze projektu)

Każde polecenie wpisz osobno. W miejscu `TWOJ-LOGIN` wpisz swój login z GitHuba.

```bash
git init
```

```bash
git add .
```

Sprawdź, że nie dodajesz sekretów (polecenie **nie powinno nic wypisać**):

```bash
git diff --cached --name-only | grep -E '(^|/)\.env$'
```

```bash
git commit -m "Wehikuł Rynku – MVP"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/TWOJ-LOGIN/wehikul-rynku.git
```

```bash
git push -u origin main
```

Przy `git push` GitHub poprosi o zalogowanie — zaloguj się w oknie przeglądarki, które się otworzy.
Hasła do GitHuba nie wpisuj w terminal; jeśli o nie poprosi, użyj tokenu (Settings → Developer
settings → Personal access tokens) albo aplikacji GitHub Desktop.

### 3. Włączenie GitHub Pages

1. W repozytorium: **Settings → Pages**.
2. **Build and deployment → Source:** `Deploy from a branch`.
3. **Branch:** `main`, folder `/ (root)` → **Save**.
4. Poczekaj 1–3 minuty (postęp w zakładce **Actions** → „pages build and deployment”).
5. Adres strony: `https://TWOJ-LOGIN.github.io/wehikul-rynku/`.

Plik `.nojekyll` wyłącza przetwarzanie Jekyll — GitHub publikuje pliki dokładnie tak, jak są.

### 4. Sprawdzenie po publikacji

- [ ] Strona otwiera się pod adresem `https://…github.io/…`, na górze widać informację edukacyjną.
- [ ] Pełna rozgrywka: plan → kilka decyzji → wynik; wykres pokazuje tylko przeszłe sesje.
- [ ] Przycisk kursu otwiera okno „Pełny kurs nie jest jeszcze gotowy…”, bez żadnej płatności.
- [ ] Na ekranie wyniku **nie ma** formularza e-mail.
- [ ] Link „Prywatność” w stopce działa, a polityka nie ma już żółtych pól.
- [ ] Widok na telefonie (360–390 px) bez przewijania w bok.
- [ ] Testy: `https://…github.io/wehikul-rynku/tests/` pokazują „31 z 31”.

### 5. Aktualizacje

Po każdej zmianie w plikach:

```bash
git add .
```

```bash
git commit -m "Opis zmiany"
```

```bash
git push
```

GitHub Pages opublikuje nową wersję automatycznie po 1–3 minutach.

### 6. Statystyki Umami (opcjonalne; konto wymaga ukończonych 18 lat)

Umami Cloud Hobby jest bezpłatny (do 100 tys. zdarzeń miesięcznie, 1 strona, dane przez 6 miesięcy),
obsługuje własne zdarzenia i nie używa cookies (stan na 18.10.2026). Jeśli nie masz 18 lat, konto
zakłada osoba dorosła albo zostawiasz statystyki wyłączone.

1. cloud.umami.is → **Add website** → domena: `TWOJ-LOGIN.github.io` → skopiuj **Website ID**.
2. W `js/config.js` ustaw:
   ```js
   provider: 'umami',
   umamiWebsiteId: 'tu-wklej-website-id',
   umamiDomains: 'TWOJ-LOGIN.github.io',
   ```
3. Wyślij zmianę (krok 5).
4. **Wyniki:** cloud.umami.is → Twoja strona → zakładka **Events**: `challenge_started`,
   `challenge_completed`, `course_cta_clicked`. To liczba **zdarzeń, a nie ludzi**; osoby
   z „Do Not Track” lub blokerem reklam nie są liczone.

---

## Diagnoza typowych błędów

| Objaw | Prawdopodobna przyczyna | Rozwiązanie |
|---|---|---|
| Błąd 404 zaraz po włączeniu Pages | Publikacja jeszcze trwa | Poczekaj kilka minut; sprawdź zakładkę Actions |
| Błąd 404 na stałe | Zła gałąź/folder w Settings → Pages albo repozytorium prywatne | Ustaw `main` + `/ (root)`; repozytorium musi być Public |
| Strona bez wyglądu (brak stylów) | Brak folderu `css/` w repozytorium albo zła wielkość liter w nazwie | GitHub rozróżnia wielkie i małe litery — nazwy plików muszą się zgadzać dokładnie |
| „Nie udało się uruchomić wyzwania” | Brak pliku `data/challenge-march-2020.json` w repozytorium | Sprawdź na github.com, czy folder `data/` został wysłany |
| Zamiast wykresu komunikat o bibliotece | cdnjs niedostępny lub zmieniony plik (SRI) | Sprawdź konsolę przeglądarki; dane są też w tabeli |
| Widać starą wersję | Publikacja trwa albo pamięć podręczna przeglądarki | Poczekaj; odśwież `Cmd + Shift + R` |
| `git push` odrzucony (`rejected`) | Repozytorium na GitHubie ma pliki, których nie masz lokalnie (np. README dodane przy tworzeniu) | Utwórz repozytorium bez README albo najpierw wykonaj `git pull --rebase origin main` |
| Brak zdarzeń w Umami | `provider` nadal `'test'`, zły Website ID, `umamiDomains` nie pasuje, włączone „Do Not Track” lub bloker | Popraw `js/config.js`; testuj w oknie bez blokera |

---

## Na później: formularz zapisu e-mail

GitHub Pages nie uruchamia `api/subscribe.js` (plik zostaje w repozytorium na przyszłość; nie zawiera
sekretów). Są dwie drogi włączenia zapisu:

1. **Gotowy formularz Brevo** — Brevo sam przyjmuje adres i wysyła link potwierdzający (double opt-in),
   bez serwera i bez klucza API. Wymaga zmiany kodu formularza (osobny krok) i konta Brevo
   (od 18 lat).
2. **Hosting z funkcjami serwerowymi, np. Vercel** — wtedy działa obecne `api/subscribe.js`. Uwaga:
   plan Vercel Hobby jest tylko do użytku niekomercyjnego, a według
   [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines) „Advertising the sale of a
   product or service” to użycie komercyjne — przy przycisku kursu potrzebny jest plan Pro. Konfiguracja:
   konto Brevo, lista, szablon double opt-in z `{{ params.DOIurl }}`
   ([instrukcja Brevo](https://help.brevo.com/hc/en-us/articles/27353832123026)), zmienne z
   [`.env.example`](.env.example) w Vercel → Settings → Environment Variables, potem Redeploy.

W obu przypadkach: ustaw `signupEnabled: true` w `js/config.js` i dodaj do polityki prywatności sekcje
z dodatku w `PRIVACY.md`.
