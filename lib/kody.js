// Kody dostępu wydawane ręcznie w panelu (np. po wpłacie BLIK-iem).
// Zapis: data/dostepy.json w prywatnym repo (poza app/, więc nie jest publiczny). Przechowujemy tylko skrót kodu
// (SHA-256) i 4 ostatnie znaki – samego kodu nie da się odczytać z pliku.
import { pobierzPlik, zapiszPlik } from "./repo.js";

export const PLIK_DOSTEPOW = "data/dostepy.json";
const ZNAKI = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bez 0/O i 1/I/L, żeby nie mylić przy przepisywaniu

export const normalizujKod = (kod) => String(kod || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function skrotKodu(kod) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("wlew:" + normalizujKod(kod))));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function nowyKod() {
  const b = crypto.getRandomValues(new Uint8Array(10));
  const s = [...b].map((x) => ZNAKI[x % ZNAKI.length]).join("");
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

// krótka pamięć w obrębie jednej instancji workera, żeby nie pytać GitHuba przy każdym zapytaniu
let pamiec = { t: 0, wynik: null };

export async function wczytajDostepy(env, { swieze = false } = {}) {
  if (!swieze && pamiec.wynik && Date.now() - pamiec.t < 30_000) return pamiec.wynik;
  const p = await pobierzPlik(env, PLIK_DOSTEPOW);
  const wynik = p || { sha: null, dane: { osoby: [] } };
  if (!Array.isArray(wynik.dane.osoby)) wynik.dane.osoby = [];
  pamiec = { t: Date.now(), wynik };
  return wynik;
}

export async function zapiszDostepy(env, dane, sha, wiadomosc, autor) {
  const w = await zapiszPlik(env, PLIK_DOSTEPOW, dane, sha, wiadomosc, autor);
  pamiec = { t: 0, wynik: null };
  return w;
}

const koniecDnia = (d) => new Date(String(d).slice(0, 10) + "T23:59:59Z").getTime();
export const aktywnaOsoba = (o) => o && o.aktywny !== false && koniecDnia(o.wazneDo) >= Date.now();

/** Sprawdza kod z aplikacji → {osoba} albo {blad}. */
export async function sprawdzKod(env, kod) {
  if (normalizujKod(kod).length < 8) return { brak: true };
  const skrot = await skrotKodu(kod);
  const { dane } = await wczytajDostepy(env);
  const o = dane.osoby.find((x) => x.skrot === skrot);
  if (!o) return { brak: true };
  if (o.aktywny === false) return { blad: "Ten kod został wyłączony. Skontaktuj się z osobą, od której go dostałeś(-aś)." };
  if (!aktywnaOsoba(o)) return { blad: `Ten kod wygasł ${String(o.wazneDo).slice(0, 10).split("-").reverse().join(".")}. Przedłuż dostęp, żeby korzystać z pełnych kart.` };
  return { osoba: o };
}
