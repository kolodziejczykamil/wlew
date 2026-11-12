# Wlew

Ściąga z ChPL dla SOR: czym i w ile rozcieńczyć lek dożylny. Aplikacja webowa (PWA), działa offline, bez serwera i bez kont.

## Struktura

```
app/                  ← to wrzucamy na hosting (GitHub Pages / Cloudflare Pages)
  index.html, app.js  ← aplikacja dla użytkowników
  admin.html/.js      ← panel admina: lista leków, dodawanie z rejestru, edycja i zatwierdzanie kart
  karta.js, ikony.js  ← wspólny widok karty i ikony (aplikacja + panel)
  config.js           ← ustawienia: pokazywanie szkiców, e-mail do zgłoszeń
  sw.js               ← działanie offline
  data/leki.json      ← karty leków – źródło listy i treści (edytowane w panelu)
  data/zrodla.json    ← wycięte punkty ChPL dla panelu
  data/rejestr-iv.json← indeks produktów dożylnych z rejestru (wyszukiwarka „Dodaj lek”)
tools/
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
- **Publikuj** – przycisk „Opublikuj”, imię i nazwisko sprawdzającego, połączenie z GitHubem, kopia zapasowa pliku.

Zmiany zapisują się w przeglądarce jako kopia robocza, dopóki nie klikniesz „Opublikuj”. Każda zmiana w zatwierdzonej karcie cofa ją do szkicu. Ukryty lek nie pokazuje się w aplikacji, usunięty znika z listy.

## Jak działa publikacja (bez własnego serwera)

```
Panel → „Opublikuj” → GitHub API zapisuje app/data/leki.json (commit z podpisem)
      → GitHub Actions (.github/workflows/dane.yml) dociąga ChPL dla nowych leków i odświeża metadane
      → Cloudflare Pages publikuje nową wersję → aplikacja pobiera ją przy następnym otwarciu
```

- Jeśli dwie osoby publikują w tym samym czasie, panel scala zmiany karta po karcie (karty zmienione u Ciebie wygrywają, reszta bierze wersję z repo).
- Co poniedziałek Actions pobiera rejestr i wszystkie ChPL od nowa. Karty, których ChPL się zmieniła, dostają status „Zmiana ChPL”.
- Historia zmian: zakładka Commits w repozytorium (każda publikacja ma opis i podpis).

### Dostęp do panelu dla nowej osoby

1. Repozytorium → Settings → Collaborators → dodaj jej konto GitHub.
2. Ta osoba tworzy klucz: github.com/settings/personal-access-tokens/new → Repository access: *Only select repositories* → `wlew` → Permissions → *Contents: Read and write* → Expiration np. 90 dni.
3. W panelu: Publikuj → wkleja klucz → Połącz. Klucz zostaje tylko w jej przeglądarce.

### Podłączenie Cloudflare Pages (jednorazowo)

1. dash.cloudflare.com → Workers & Pages → Create → Pages → **Connect to Git** → wybierz `kolodziejczykamil/wlew` (zezwól aplikacji Cloudflare na dostęp do tego repo).
2. Production branch: `main` · Framework preset: *None* · Build command: puste · **Build output directory: `app`**.
3. Save and Deploy. Adres: `<nazwa-projektu>.pages.dev`, panel pod `/admin.html`.

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
