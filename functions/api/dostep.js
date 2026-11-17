// GET  /api/dostep → {platnosci, pelny, powod, kontakt, cena, kupUrl, proba}
// POST /api/dostep {akcja: "aktywuj"|"odswiez"|"dezaktywuj", kod, aktywacja?, urzadzenie?}
// Najpierw sprawdzane są kody wydane w panelu (data/dostepy.json); opcjonalnie kody z Polar.sh, gdy jest POLAR_ORG_ID.
import { ciasteczkoDostepu, platnosciWlaczone, stanDostepu, usunDostep } from "../../lib/dostep.js";
import { sprawdzKod } from "../../lib/kody.js";
import { aktywuj as aktywujPolar, dezaktywuj as dezaktywujPolar, sprawdz as sprawdzPolar } from "../../lib/polar.js";
import { json, zPanelu } from "../../lib/sesja.js";

const info = (env) => ({
  kontakt: env.KONTAKT_DOSTEP || "",
  cena: env.CENA || "49 zł za rok",
  kupUrl: env.POLAR_CHECKOUT_URL || "",
  proba: env.PROBA_DNI || "14",
});
const koniecDnia = (d) => new Date(String(d).slice(0, 10) + "T23:59:59Z").getTime();
const NIE_MA = "Nie znaleziono takiego kodu. Sprawdź, czy został wpisany dokładnie tak jak w wiadomości.";

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
  if (d.akcja === "dezaktywuj") {
    if (aktywacja && env.POLAR_ORG_ID) await dezaktywujPolar(env, kod, aktywacja);
    return json({ ok: true }, 200, { "Set-Cookie": usunDostep() });
  }
  if (!platnosciWlaczone(env)) return json({ blad: "Dostęp płatny nie jest jeszcze włączony – aplikacja działa bez kodu." }, 400);
  if (!kod || kod.length > 200) return json({ blad: "Wpisz kod dostępu." }, 400);
  if (!["aktywuj", "odswiez"].includes(d.akcja)) return json({ blad: "Nieznana akcja." }, 400);

  // 1) kody wydane w panelu
  const lokalny = await sprawdzKod(env, kod);
  if (lokalny.osoba) {
    const koniec = koniecDnia(lokalny.osoba.wazneDo);
    return json({ ok: true, typ: "kod", wazneDo: lokalny.osoba.wazneDo }, 200, {
      "Set-Cookie": await ciasteczkoDostepu(env, { k: lokalny.osoba.id }, koniec),
    });
  }
  if (lokalny.blad) {
    return json({ ok: false, blad: lokalny.blad, odebrany: true }, 403, { "Set-Cookie": usunDostep() });
  }

  // 2) kody z Polar.sh (tylko gdy skonfigurowane)
  if (!env.POLAR_ORG_ID) {
    await new Promise((r) => setTimeout(r, 600)); // spowalnia zgadywanie kodów
    return json({ ok: false, blad: NIE_MA, odebrany: d.akcja === "odswiez" }, d.akcja === "odswiez" ? 403 : 400,
      d.akcja === "odswiez" ? { "Set-Cookie": usunDostep() } : {});
  }
  if (d.akcja === "aktywuj") {
    const w = await aktywujPolar(env, kod, String(d.urzadzenie || "Telefon").slice(0, 60));
    if (w.blad) return json({ blad: w.blad }, 400);
    return json({ ok: true, typ: "polar", aktywacja: w.aktywacja }, 200, { "Set-Cookie": await ciasteczkoDostepu(env, { a: w.aktywacja }) });
  }
  if (!aktywacja) return json({ ok: false, blad: NIE_MA, odebrany: true }, 403, { "Set-Cookie": usunDostep() });
  const w = await sprawdzPolar(env, kod, aktywacja);
  if (w.ok) return json({ ok: true, typ: "polar" }, 200, { "Set-Cookie": await ciasteczkoDostepu(env, { a: aktywacja }) });
  return json({ ok: false, blad: w.blad, odebrany: !!w.odebrany }, w.siec ? 503 : 403, w.odebrany ? { "Set-Cookie": usunDostep() } : {});
}
