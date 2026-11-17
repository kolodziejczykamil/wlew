// Odczyt i zapis plików JSON w prywatnym repozytorium – klucz GitHuba zna tylko serwer (zmienna GITHUB_TOKEN).
// app/data/leki.json – karty leków (publikowane w aplikacji), data/dostepy.json – kody dostępu (NIE są publiczne).
const API = "https://api.github.com";
const cfg = (env) => ({ repo: env.GITHUB_REPO || "kolodziejczykamil/wlew", galaz: env.GITHUB_BRANCH || "main" });
const naglowki = (env) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${env.GITHUB_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "wlew-panel",
});

function zBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function doBase64(tekst) {
  const b = new TextEncoder().encode(tekst);
  let bin = "";
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}

function bladGithuba(status) {
  if (status === 401) return "Klucz GitHuba na serwerze jest nieprawidłowy albo wygasł (GITHUB_TOKEN).";
  if (status === 403 || status === 404) return "Serwer nie ma dostępu do repozytorium (sprawdź uprawnienia GITHUB_TOKEN).";
  return `GitHub odpowiedział błędem ${status}.`;
}

/** {sha, dane} albo null, gdy pliku jeszcze nie ma. */
export async function pobierzPlik(env, plik) {
  const { repo, galaz } = cfg(env);
  const r = await fetch(`${API}/repos/${repo}/contents/${plik}?ref=${galaz}`, { headers: naglowki(env) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(bladGithuba(r.status));
  const d = await r.json();
  return { sha: d.sha, dane: JSON.parse(zBase64(d.content)) };
}

/** Zwraca {sha} albo {konflikt:true}, gdy plik zmienił się od wersji `sha` (sha=null tworzy nowy plik). */
export async function zapiszPlik(env, plik, dane, sha, wiadomosc, autor) {
  const { repo, galaz } = cfg(env);
  const tresc = JSON.stringify(dane, null, 1) + "\n";
  const r = await fetch(`${API}/repos/${repo}/contents/${plik}`, {
    method: "PUT",
    headers: { ...naglowki(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: wiadomosc,
      content: doBase64(tresc),
      ...(sha ? { sha } : {}),
      branch: galaz,
      author: { name: autor, email: "wlew-panel@users.noreply.github.com" },
    }),
  });
  if (r.status === 409 || r.status === 422) return { konflikt: true };
  if (!r.ok) throw new Error(bladGithuba(r.status));
  return { sha: (await r.json()).content.sha };
}

const LEKI = "app/data/leki.json";
export async function pobierzLeki(env) {
  const p = await pobierzPlik(env, LEKI);
  if (!p) throw new Error(bladGithuba(404));
  return p;
}
export const zapiszLeki = (env, dane, sha, wiadomosc, autor) => zapiszPlik(env, LEKI, dane, sha, wiadomosc, autor);
