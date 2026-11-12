// POST /api/logout → usuwa ciasteczko sesji
import { ciasteczkoWyloguj, json } from "../../lib/sesja.js";

export const onRequestPost = () => json({ ok: true }, 200, { "Set-Cookie": ciasteczkoWyloguj() });
