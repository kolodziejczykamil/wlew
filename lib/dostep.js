// Kto widzi pełne karty: wszyscy, gdy płatności są wyłączone; zalogowani do panelu; osoby z ważnym kodem.
// Pełny dostęp potwierdza podpisane ciasteczko „wlew_dostep” (ważne do 3 dni, nie dłużej niż sam kod;
// aplikacja odświeża je raz na dobę, więc wyłączony kod przestaje działać najpóźniej po 3 dniach).
import { odczytajCiasteczko, podpisaneCiasteczko, usunCiasteczko, uzytkownik } from "./sesja.js";

const COOKIE = "wlew_dostep";
const DNI = 3;

export const platnosciWlaczone = (env) => env.PLATNOSCI === "on";

/** dane: {k: id osoby} dla kodów z panelu albo {a: id aktywacji} dla Polar; koniec – timestamp końca dostępu (opcjonalnie). */
export function ciasteczkoDostepu(env, dane, koniec = null) {
  const max = DNI * 86400;
  const sekundy = koniec ? Math.max(60, Math.min(max, Math.floor((koniec - Date.now()) / 1000))) : max;
  return podpisaneCiasteczko(env, COOKIE, "dostep", dane, sekundy);
}
export const usunDostep = () => usunCiasteczko(COOKIE);

/** {pelny, powod, wazneDo} */
export async function stanDostepu(request, env) {
  if (!platnosciWlaczone(env)) return { pelny: true, powod: "bez-platnosci" };
  if (await uzytkownik(request, env)) return { pelny: true, powod: "panel" };
  const d = await odczytajCiasteczko(request, env, COOKIE, "dostep");
  if (d) return { pelny: true, powod: "kod", wazneDo: d.e };
  return { pelny: false, powod: "brak" };
}

/** Wersja bez płatnej treści: zostaje wszystko, co pomaga bezpiecznie (ostrzeżenia krytyczne, statusy, źródło). */
export function wersjaDarmowa(dane) {
  return {
    ...dane,
    leki: dane.leki.map((k) => {
      const tresc = (k.plyny?.length || k.przygotowanie?.length || k.tempo?.length || k.praktyka?.length || (k.uwagi || []).some((u) => !u.wazne)) > 0;
      return {
        ...k,
        plyny: [],
        przygotowanie: [],
        tempo: [],
        praktyka: [],
        uwagi: (k.uwagi || []).filter((u) => u.wazne),
        uwagaAdmin: "",
        zablokowana: tresc,
      };
    }),
  };
}

/** GET /data/leki.json – pełna albo darmowa wersja, zależnie od dostępu. */
export async function daneLekow(request, env) {
  const plik = await env.ASSETS.fetch(request);
  if (!plik.ok) return plik;
  const { pelny } = await stanDostepu(request, env);
  const dane = await plik.json();
  return new Response(JSON.stringify(pelny ? dane : wersjaDarmowa(dane)), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Wlew-Dostep": pelny ? "pelny" : "darmowy" },
  });
}
