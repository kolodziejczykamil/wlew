// Service worker: aplikacja działa bez internetu.
// Wszystko: najpierw sieć, bez sieci ostatnia zapisana wersja (aktualizacje docierają same).
const WERSJA = "wlew-v3";
const POWLOKA = ["./", "index.html", "style.css", "app.js", "karta.js", "ikony.js", "config.js", "manifest.webmanifest", "ikona.svg", "ikona-192.png", "ikona-512.png", "data/leki.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(WERSJA).then((c) => c.addAll(POWLOKA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((klucze) => Promise.all(klucze.filter((k) => k !== WERSJA).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Najpierw sieć (max 3 s – słaby zasięg na SOR), potem ostatnia zapisana kopia.
function zSieci(req) {
  return new Promise((ok, nie) => {
    const t = setTimeout(() => nie(new Error("timeout")), 3000);
    fetch(req).then((r) => { clearTimeout(t); r.ok ? ok(r) : nie(new Error(r.status)); }, (err) => { clearTimeout(t); nie(err); });
  });
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // np. PDF z rejestru – zawsze z sieci
  const klucz = new Request(url.origin + url.pathname); // bez ?parametrów
  e.respondWith(
    zSieci(e.request)
      .then((r) => { const kopia = r.clone(); caches.open(WERSJA).then((c) => c.put(klucz, kopia)); return r; })
      .catch(() => caches.match(klucz).then((r) => r || caches.match("index.html"))),
  );
});
