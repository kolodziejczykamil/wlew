// GET /api/leki → aktualna wersja kart z repozytorium {sha, dane}
// PUT /api/leki {dane, sha, opis} → zapis z podpisem zalogowanej osoby {sha} albo 409 przy konflikcie
import { pobierzLeki, zapiszLeki } from "../../lib/repo.js";
import { json, uzytkownik, zPanelu } from "../../lib/sesja.js";

export async function onRequestGet({ request, env }) {
  if (!(await uzytkownik(request, env))) return json({ blad: "Zaloguj się ponownie." }, 401);
  try { return json(await pobierzLeki(env)); }
  catch (e) { return json({ blad: e.message }, 502); }
}

export async function onRequestPut({ request, env }) {
  const u = await uzytkownik(request, env);
  if (!u) return json({ blad: "Sesja wygasła. Zaloguj się ponownie – zmiany są zachowane." }, 401);
  if (!zPanelu(request)) return json({ blad: "Niedozwolone zapytanie." }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ blad: "Nieprawidłowe dane." }, 400); }
  if (!d?.dane || !Array.isArray(d.dane.leki) || typeof d.sha !== "string") return json({ blad: "Nieprawidłowy plik z lekami." }, 400);
  if (d.dane.leki.some((k) => !k || typeof k.id !== "string" || typeof k.substancja !== "string")) return json({ blad: "Uszkodzona karta w pliku." }, 400);
  const opis = String(d.opis || "zmiany").slice(0, 300);
  try {
    const w = await zapiszLeki(env, d.dane, d.sha, `Panel: ${opis} (${u.imie})`, u.imie);
    return w.konflikt ? json({ konflikt: true }, 409) : json({ sha: w.sha });
  } catch (e) {
    return json({ blad: e.message }, 502);
  }
}
