// Kto widzi pełne karty: wszyscy, gdy płatności są wyłączone; zalogowani do panelu; osoby z ważnym kodem.
// Pełny dostęp potwierdza podpisane ciasteczko „wlew_dostep” (ważne 7 dni, aplikacja odświeża je codziennie).
import { odczytajCiasteczko, podpisaneCiasteczko, usunCiasteczko, uzytkownik } from "./sesja.js";

const COOKIE = "wlew_dostep";
const DNI = 7;

export const platnosciWlaczone = (env) => env.PLATNOSCI === "on";

export const ciasteczkoDostepu = (env, aktywacja) => podpisaneCiasteczko(env, COOKIE, "dostep", { a: aktywacja }, DNI * 86400);
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
