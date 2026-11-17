// Cloudflare Worker: pliki z app/ obsługuje Cloudflare sam (assets). Tutaj trafia /api/* oraz /data/leki.json
// (run_worker_first w wrangler.jsonc), żeby bez dostępu wydawać darmową wersję kart.
// Handlery są w functions/api/*.js (ten sam kod działa też w tools/dev-server.mjs).
import { daneLekow } from "./lib/dostep.js";
import * as dostep from "./functions/api/dostep.js";
import * as leki from "./functions/api/leki.js";
import * as login from "./functions/api/login.js";
import * as logout from "./functions/api/logout.js";
import * as me from "./functions/api/me.js";

const TRASY = { "/api/dostep": dostep, "/api/leki": leki, "/api/login": login, "/api/logout": logout, "/api/me": me };

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/data/leki.json" && request.method === "GET") return await daneLekow(request, env);
      const mod = TRASY[pathname];
      if (!mod) {
        if (pathname.startsWith("/api/")) return new Response("Nie ma takiego adresu.", { status: 404 });
        return env.ASSETS.fetch(request);
      }
      const m = request.method;
      const fn = mod["onRequest" + m[0] + m.slice(1).toLowerCase()] || mod.onRequest;
      if (!fn) return new Response("Metoda niedozwolona.", { status: 405 });
      return await fn({ request, env });
    } catch (e) {
      return Response.json({ blad: e.message || "Błąd serwera." }, { status: 500 });
    }
  },
};
