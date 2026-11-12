// GET /api/me → zalogowany użytkownik albo 401
import { json, uzytkownik } from "../../lib/sesja.js";

export async function onRequestGet({ request, env }) {
  const u = await uzytkownik(request, env);
  return u ? json(u) : json({ blad: "Niezalogowany." }, 401);
}
