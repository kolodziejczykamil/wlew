// POST /api/login {login, haslo} → ustawia ciasteczko sesji
import { ciasteczkoSesji, json, konta, sprawdzHaslo, zPanelu } from "../../lib/sesja.js";

export async function onRequestPost({ request, env }) {
  if (!zPanelu(request)) return json({ blad: "Niedozwolone zapytanie." }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ blad: "Nieprawidłowe dane." }, 400); }
  const login = String(d.login || "").trim().toLowerCase();
  const konto = konta(env).find((u) => u.login === login);
  const ok = konto ? await sprawdzHaslo(String(d.haslo || ""), konto.haslo) : false;
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700)); // spowalnia zgadywanie haseł
    return json({ blad: "Nieprawidłowy login lub hasło." }, 401);
  }
  return json({ login: konto.login, imie: konto.imie || konto.login }, 200, { "Set-Cookie": await ciasteczkoSesji(env, konto.login) });
}
