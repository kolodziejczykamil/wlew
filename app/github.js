// Publikacja z panelu: odczyt i zapis app/data/leki.json w repozytorium przez GitHub API.
// Klucz (fine-grained token z uprawnieniem Contents: read/write tylko do tego repo) zostaje w tej przeglądarce.
import { CONFIG } from "./config.js";

const API = "https://api.github.com";
const G = CONFIG.github;
const LS_TOKEN = "wlew.admin.token";

export const token = {
  get: () => { try { return localStorage.getItem(LS_TOKEN) || ""; } catch { return ""; } },
  set: (v) => { try { v ? localStorage.setItem(LS_TOKEN, v) : localStorage.removeItem(LS_TOKEN); } catch { /* */ } },
};
export const linkAkcji = `https://github.com/${G.repo}/actions`;
export const linkHistorii = `https://github.com/${G.repo}/commits/${G.galaz}/${G.plik}`;

const naglowki = (t) => ({ Accept: "application/vnd.github+json", Authorization: `Bearer ${t}`, "X-GitHub-Api-Version": "2022-11-28" });

function zBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}
function doBase64(tekst) {
  const b = new TextEncoder().encode(tekst);
  let bin = "";
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function blad(r) {
  if (r.status === 401) return new Error("Klucz jest nieprawidłowy albo wygasł. Wygeneruj nowy.");
  if (r.status === 403) return new Error("Klucz nie ma uprawnienia do zapisu (Contents: Read and write).");
  if (r.status === 404) return new Error("Brak dostępu do repozytorium. Sprawdź, czy klucz obejmuje repo " + G.repo + ".");
  let m = ""; try { m = (await r.json()).message; } catch { /* */ }
  return new Error(`GitHub odpowiedział błędem ${r.status}${m ? ": " + m : ""}.`);
}

/** Sprawdza klucz: dostęp do repo i prawo zapisu. */
export async function sprawdz(t) {
  const r = await fetch(`${API}/repos/${G.repo}`, { headers: naglowki(t) });
  if (!r.ok) throw await blad(r);
  const d = await r.json();
  if (d.permissions && !d.permissions.push) throw new Error("Klucz pozwala tylko czytać. Potrzebne jest Contents: Read and write.");
  return { repo: d.full_name };
}

/** Aktualna wersja pliku z kartami w repozytorium. */
export async function pobierz(t) {
  const r = await fetch(`${API}/repos/${G.repo}/contents/${G.plik}?ref=${G.galaz}`, { headers: naglowki(t), cache: "no-store" });
  if (!r.ok) throw await blad(r);
  const d = await r.json();
  return { sha: d.sha, dane: zBase64(d.content) };
}

/** Zapis pliku. Rzuca {konflikt:true}, gdy ktoś opublikował w międzyczasie. */
export async function zapisz(t, dane, sha, wiadomosc) {
  const tresc = JSON.stringify(dane, (k, v) => (k.startsWith("_") ? undefined : v), 1) + "\n";
  const r = await fetch(`${API}/repos/${G.repo}/contents/${G.plik}`, {
    method: "PUT",
    headers: { ...naglowki(t), "Content-Type": "application/json" },
    body: JSON.stringify({ message: wiadomosc, content: doBase64(tresc), sha, branch: G.galaz }),
  });
  if (r.status === 409 || r.status === 422) { const e = new Error("konflikt"); e.konflikt = true; throw e; }
  if (!r.ok) throw await blad(r);
  return (await r.json()).content.sha;
}

const rowne = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mapa = (d) => new Map((d?.leki || []).map((k) => [k.id, k]));

/**
 * Scalanie na poziomie kart (baza = wersja, od której zaczęła się edycja).
 * Karty niezmienione lokalnie biorą wersję z repo; zmienione lokalnie wygrywają.
 * Zwraca też listę kart, które w międzyczasie zmienił ktoś inny (i zostały nadpisane).
 */
export function scal(baza, lokalna, zdalna) {
  const B = mapa(baza), L = mapa(lokalna), Z = mapa(zdalna);
  const wynik = [], nadpisane = [];
  for (const [id, z] of Z) {
    const b = B.get(id), l = L.get(id);
    if (!l) { if (!b) wynik.push(z); continue; }           // usunięta lokalnie / nowa w repo
    if (b && rowne(l, b)) { wynik.push(z); continue; }      // bez lokalnych zmian
    wynik.push(l);
    if (b && !rowne(z, b)) nadpisane.push(l.substancja);
  }
  for (const [id, l] of L) {
    if (Z.has(id)) continue;
    const b = B.get(id);
    if (!b || !rowne(l, b)) wynik.push(l);                  // nowa lokalnie albo edytowana po usunięciu w repo
  }
  return { wynik: { ...zdalna, leki: wynik }, nadpisane };
}

/** Krótki opis zmian do historii w repozytorium. */
export function podsumuj(baza, nowa) {
  const B = mapa(baza), N = mapa(nowa);
  const dodane = [...N.keys()].filter((id) => !B.has(id)).map((id) => N.get(id).substancja);
  const usuniete = [...B.keys()].filter((id) => !N.has(id)).map((id) => B.get(id).substancja);
  const zmienione = [...N.keys()].filter((id) => B.has(id) && !rowne(N.get(id), B.get(id))).map((id) => N.get(id).substancja);
  const cz = [];
  if (dodane.length) cz.push("dodano " + dodane.join(", "));
  if (zmienione.length) cz.push("zmieniono " + (zmienione.length > 4 ? zmienione.length + " kart" : zmienione.join(", ")));
  if (usuniete.length) cz.push("usunięto " + usuniete.join(", "));
  return { tekst: cz.join("; ") || "bez zmian w kartach", ile: dodane.length + usuniete.length + zmienione.length };
}
