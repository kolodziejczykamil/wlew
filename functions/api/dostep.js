// GET  /api/dostep → {platnosci, pelny, powod, wazneDo, kupUrl, cena}
// POST /api/dostep {akcja: "aktywuj"|"odswiez"|"dezaktywuj", kod, aktywacja, urzadzenie}
import { ciasteczkoDostepu, platnosciWlaczone, stanDostepu, usunDostep } from "../../lib/dostep.js";
import { aktywuj, dezaktywuj, sprawdz } from "../../lib/polar.js";
import { json, zPanelu } from "../../lib/sesja.js";

const info = (env) => ({ kupUrl: env.POLAR_CHECKOUT_URL || "", cena: env.CENA || "49 zł za rok", proba: env.PROBA_DNI || "14" });

export async function onRequestGet({ request, env }) {
  const s = await stanDostepu(request, env);
  return json({ platnosci: platnosciWlaczone(env), ...s, ...info(env) });
}

export async function onRequestPost({ request, env }) {
  if (!zPanelu(request)) return json({ blad: "Niedozwolone zapytanie." }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ blad: "Nieprawidłowe dane." }, 400); }
  const kod = String(d.kod || "").trim();
  const aktywacja = String(d.aktywacja || "").trim();
  if (!platnosciWlaczone(env)) return json({ blad: "Płatności nie są jeszcze włączone – aplikacja działa bez kodu." }, 400);
  if (!env.POLAR_ORG_ID) return json({ blad: "Brak konfiguracji płatności (POLAR_ORG_ID)." }, 500);
  if (!kod || kod.length > 200) return json({ blad: "Wpisz kod dostępu z maila." }, 400);

  if (d.akcja === "aktywuj") {
    const urzadzenie = String(d.urzadzenie || "Telefon").slice(0, 60);
    const w = await aktywuj(env, kod, urzadzenie);
    if (w.blad) return json({ blad: w.blad }, 400);
    return json({ ok: true, aktywacja: w.aktywacja }, 200, { "Set-Cookie": await ciasteczkoDostepu(env, w.aktywacja) });
  }
  if (d.akcja === "odswiez") {
    if (!aktywacja) return json({ blad: "Brak aktywacji." }, 400);
    const w = await sprawdz(env, kod, aktywacja);
    if (w.ok) return json({ ok: true }, 200, { "Set-Cookie": await ciasteczkoDostepu(env, aktywacja) });
    // Przy problemie z siecią nie odbieramy dostępu – ciasteczko wygaśnie samo po 7 dniach.
    return json({ ok: false, blad: w.blad, odebrany: !!w.odebrany }, w.siec ? 503 : 403, w.odebrany ? { "Set-Cookie": usunDostep() } : {});
  }
  if (d.akcja === "dezaktywuj") {
    if (aktywacja) await dezaktywuj(env, kod, aktywacja);
    return json({ ok: true }, 200, { "Set-Cookie": usunDostep() });
  }
  return json({ blad: "Nieznana akcja." }, 400);
}
