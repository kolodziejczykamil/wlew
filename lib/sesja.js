// Logowanie do panelu (Cloudflare Pages Functions, Web Crypto).
// Konta są w zmiennej środowiskowej USERS (JSON), hasła jako PBKDF2 – tworzy je tools/haslo.py.
// Sesja = podpisane ciasteczko HttpOnly (HMAC-SHA256 kluczem SESSION_SECRET).

const COOKIE = "wlew_sesja";
const DNI_SESJI = 30;
const enc = new TextEncoder();

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const zB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const zB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function rowneBajty(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

export function konta(env) {
  try { return JSON.parse(env.USERS || "[]"); } catch { return []; }
}

/** Format hasha: pbkdf2$<iteracje>$<sól base64>$<hash base64> */
export async function sprawdzHaslo(haslo, zapis) {
  const [alg, iter, sol, hash] = String(zapis || "").split("$");
  if (alg !== "pbkdf2" || !iter || !sol || !hash) return false;
  const klucz = await crypto.subtle.importKey("raw", enc.encode(haslo), "PBKDF2", false, ["deriveBits"]);
  const bity = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: zB64(sol), iterations: +iter }, klucz, 256);
  return rowneBajty(new Uint8Array(bity), zB64(hash));
}

async function hmac(env, tekst) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("Brak SESSION_SECRET (min. 32 znaki) w ustawieniach Cloudflare.");
  const k = await crypto.subtle.importKey("raw", enc.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(tekst)));
}

export async function ciasteczkoSesji(env, login) {
  const tresc = b64url(enc.encode(JSON.stringify({ l: login, e: Date.now() + DNI_SESJI * 864e5 })));
  const podpis = b64url(await hmac(env, tresc));
  return `${COOKIE}=${tresc}.${podpis}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DNI_SESJI * 86400}`;
}
export const ciasteczkoWyloguj = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/** Zalogowany użytkownik {login, imie} albo null. Konto usunięte z USERS traci dostęp od razu. */
export async function uzytkownik(request, env) {
  const c = (request.headers.get("Cookie") || "").split(/;\s*/).find((x) => x.startsWith(COOKIE + "="));
  if (!c) return null;
  const [tresc, podpis] = c.slice(COOKIE.length + 1).split(".");
  if (!tresc || !podpis) return null;
  if (!rowneBajty(await hmac(env, tresc), zB64url(podpis))) return null;
  let d;
  try { d = JSON.parse(new TextDecoder().decode(zB64url(tresc))); } catch { return null; }
  if (!d.e || d.e < Date.now()) return null;
  const konto = konta(env).find((u) => u.login === d.l);
  return konto ? { login: konto.login, imie: konto.imie || konto.login } : null;
}

export const json = (dane, status = 200, naglowki = {}) =>
  new Response(JSON.stringify(dane), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...naglowki } });

/** Ochrona przed CSRF: zapytania zmieniające dane muszą mieć nagłówek X-Wlew (przeglądarka nie doda go z obcej strony bez CORS). */
export const zPanelu = (request) => request.headers.get("X-Wlew") === "1";
