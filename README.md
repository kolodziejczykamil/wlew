# Wlew

Ściąga z ChPL dla SOR: czym i w ile rozcieńczyć lek dożylny. Aplikacja webowa (PWA), działa offline, bez serwera i bez kont.

## Struktura

```
app/                  ← to wrzucamy na hosting (GitHub Pages / Cloudflare Pages)
  index.html, app.js  ← aplikacja dla użytkowników
  admin.html/.js      ← panel admina (logowanie): lista leków, dodawanie z rejestru, edycja, publikacja
  api.js              ← komunikacja panelu z backendem + scalanie zmian
  karta.js, ikony.js  ← wspólny widok karty i ikony (aplikacja + panel)
  config.js           ← ustawienia: pokazywanie szkiców, e-mail do zgłoszeń
  sw.js               ← działanie offline
  data/leki.json      ← karty leków – źródło listy i treści (edytowane w panelu)
  data/zrodla.json    ← wycięte punkty ChPL dla panelu
  data/rejestr-iv.json← indeks produktów dożylnych z rejestru (wyszukiwarka „Dodaj lek”)
worker.js, wrangler.jsonc ← Cloudflare Worker: pliki z app/ + backend /api/*
functions/api/       ← handlery backendu: login, logout, me, leki
lib/                 ← sesje/hasła i zapis do repo dla funkcji
tools/
  konta.py            ← konta do panelu (hasła PBKDF2 → zmienna USERS w Cloudflare)
  dev-server.mjs      ← lokalny serwer z backendem do testów
  lista.py            ← początkowa lista Marcina (używana tylko, gdy nie ma jeszcze leki.json)
  pobierz.py          ← pobiera rejestr + ChPL, wycina pkt 4.2/6.2/6.3/6.6, aktualizuje leki.json
  szkice.py           ← szkice kart przygotowane z ChPL (niesprawdzone)
  podglad.py          ← podgląd kluczowych fragmentów ChPL w terminalu
```

## Uruchomienie lokalne

```bash
python3 -m venv .venv && .venv/bin/pip install pypdf
.venv/bin/python tools/pobierz.py
python3 -m http.server 8765 --directory app
```

Aplikacja: http://localhost:8765 · panel: http://localhost:8765/admin.html

## Panel admina (telefon lub komputer)

- **Leki** – lista z filtrami (szkice, sprawdzone, do uwagi, ukryte). Karta: formularz, fragmenty ChPL z podświetleniem i podgląd w aplikacji.
- **Dodaj** – wyszukiwarka w rejestrze (ok. 1300 produktów dożylnych z ChPL) albo lek spoza rejestru.
- **Publikuj** – przycisk „Opublikuj”, konto (wyloguj), kopia zapasowa pliku.

Zmiany zapisują się w przeglądarce jako kopia robocza, dopóki nie klikniesz „Opublikuj”. Każda zmiana w zatwierdzonej karcie cofa ją do szkicu. Ukryty lek nie pokazuje się w aplikacji, usunięty znika z listy.

## Jak działa publikacja (bez własnego serwera)

```
Panel (login + hasło) → „Opublikuj” → /api/leki (Cloudflare Worker, worker.js)
      → serwer zapisuje app/data/leki.json w repo przez GitHub API (commit z imieniem osoby)
      → GitHub Actions (.github/workflows/dane.yml) dociąga ChPL dla nowych leków i odświeża metadane
      → Cloudflare wdraża nową wersję → aplikacja pobiera ją przy następnym otwarciu
```

- Osoby z panelu (np. Marcin) nie potrzebują konta na GitHubie. Klucz do GitHuba zna tylko serwer.
- Jeśli dwie osoby publikują w tym samym czasie, panel scala zmiany karta po karcie (karty zmienione u Ciebie wygrywają, reszta bierze wersję z repo).
- Co poniedziałek Actions pobiera rejestr i wszystkie ChPL od nowa. Karty, których ChPL się zmieniła, dostają status „Zmiana ChPL”.
- Historia zmian: zakładka Commits w repozytorium (każda publikacja ma opis i imię osoby).

### Konfiguracja Cloudflare Workers (jednorazowo)

Projekt ma `wrangler.jsonc`: pliki z `app/` serwuje Cloudflare, a `/api/*` obsługuje `worker.js` (handlery w `functions/api/`).

1. dash.cloudflare.com → Workers & Pages → Create → Import a repository → `kolodziejczykamil/wlew`.
2. Project name `wlew`, Build command puste, Deploy command `npx wrangler deploy` (domyślne) → Deploy.
3. Projekt → Settings → Variables and Secrets → dodaj jako **Secret**:
   - `GITHUB_TOKEN` – klucz z github.com/settings/personal-access-tokens/new: Repository access *Only select* → `wlew`, Permissions → *Contents: Read and write*. Ustaw długą ważność i wpisz w kalendarz datę odnowienia.
   - `SESSION_SECRET` – wynik `python3 tools/konta.py sekret`
   - `USERS` – wynik `python3 tools/konta.py dodaj …` (niżej)
4. Sekrety działają od razu. Każdy push na `main` wdraża nową wersję automatycznie.

### Konta do panelu

```bash
python3 tools/konta.py dodaj marcin "Marcin Nowak"   # pyta o hasło (min. 10 znaków)
python3 tools/konta.py dodaj kamil "Kamil Kołodziejczyk"
python3 tools/konta.py usun marcin                    # odebranie dostępu
```

Skrypt wypisuje nową wartość `USERS` – wklej ją w Cloudflare (punkt 3, edytuj istniejący sekret USERS). Lista kont leży lokalnie w `tools/.konta.json` (nie trafia do repo). Hasło przekaż osobiście albo SMS-em, nie w tym samym kanale co login.

### Test lokalny (panel + backend + udawany GitHub)

```bash
node tools/dev-server.mjs --reset   # http://localhost:8788/admin.html, konto testowe: test / test-haslo-123
```

Publikacje trafiają do `.cache/dev-repo/leki.json`, prawdziwe repo nie jest ruszane.

## Ręczna aktualizacja danych (lokalnie)

```bash
.venv/bin/python tools/pobierz.py --odswiez
```

Treść kart zostaje. Jeśli PDF z ChPL się zmienił od zatwierdzenia, karta dostaje status „Zmiana ChPL” i wymaga ponownego sprawdzenia.

## Zasady (granica „ściąga, nie wyrób medyczny”)

- Tylko informacje z ChPL, takie same dla każdego pacjenta. Żadnych pól na wagę/wiek i żadnego przeliczania dawek.
- Przy każdej karcie: produkt, punkt ChPL, nr pozwolenia, data rejestru, link do oryginału.
- Przed publicznym wydaniem: `pokazSzkice: false` i prawdziwy adres w `emailBledow` (config.js).

## Ustalenia z dopasowania listy

- Brak zarejestrowanej postaci iv / brak w RPL: Augmentin iv, Brevibloc, Anexate, Rivotril amp., Zofran amp., Perfalgan – wybrano zamienniki (opis w `tools/lista.py`).
- Bez polskiej ChPL (prawdopodobnie import docelowy): labetalol (Trandate), petydyna (Dolcontral).
- Wg RPL bez drogi dożylnej: Haloperidol WZF (domięśniowo), Papaverinum hydrochloricum WZF (domięśniowo, podskórnie).
- Metalyse jest zarejestrowany centralnie – ChPL pobierana z EMA.
