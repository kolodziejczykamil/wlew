// Komunikacja panelu z serwerem (Cloudflare Pages Functions w /functions/api).
// Logowanie loginem i hasłem; klucz do GitHuba zna tylko serwer.

async function zapytanie(sciezka, { metoda = "GET", dane } = {}) {
  let r;
  try {
    r = await fetch(sciezka, {
      method: metoda,
      credentials: "same-origin",
      headers: { "X-Wlew": "1", ...(dane ? { "Content-Type": "application/json" } : {}) },
      body: dane ? JSON.stringify(dane) : undefined,
      cache: "no-store",
    });
  } catch {
    const e = new Error("Brak połączenia z internetem. Zmiany są zapisane w tej przeglądarce.");
    e.siec = true; throw e;
  }
  let d = null;
  try { d = await r.json(); } catch { /* np. 404 ze zwykłego serwera plików */ }
  if (!r.ok) {
    const e = new Error(d?.blad || `Błąd serwera (${r.status}).`);
    e.status = r.status; e.konflikt = !!d?.konflikt; e.brakSerwera = r.status === 404 || r.status === 405 || (!d && r.status >= 400);
    throw e;
  }
  return d;
}

/** Zalogowany użytkownik, null gdy niezalogowany, {brakSerwera:true} gdy panel działa bez backendu. */
export async function ja() {
  try { return await zapytanie("api/me"); }
  catch (e) { if (e.status === 401) return null; if (e.brakSerwera || e.siec) return { brakSerwera: true, siec: !!e.siec }; throw e; }
}
export const zaloguj = (login, haslo) => zapytanie("api/login", { metoda: "POST", dane: { login, haslo } });
export const wyloguj = () => zapytanie("api/logout", { metoda: "POST", dane: {} });
export const pobierz = () => zapytanie("api/leki");
/** Zapis. Rzuca błąd z .konflikt, gdy ktoś opublikował w międzyczasie. */
export const zapisz = async (dane, sha, opis) =>
  (await zapytanie("api/leki", { metoda: "PUT", dane: { dane: JSON.parse(JSON.stringify(dane, (k, v) => (k.startsWith("_") ? undefined : v))), sha, opis } })).sha;

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
