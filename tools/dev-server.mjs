// Lokalny serwer do testów: pliki z app/ + funkcje z functions/api (jak na Cloudflare Pages),
// a zamiast prawdziwego GitHuba – kopia app/data/leki.json w .cache/dev-repo/ (prawdziwe repo nie jest ruszane).
//
//   node tools/dev-server.mjs [--reset] [--konto-testowe] [--platnosci]   → http://localhost:8788  (panel: /admin)
//
// Konta: z tools/.konta.json (tools/konta.py), a gdy go nie ma albo jest flaga --konto-testowe – konto test / test-haslo-123.
import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.env.PORT || 8788);
const TYPY = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

// ---------- konta ----------
let USERS;
const plikKont = join(ROOT, "tools/.konta.json");
if (existsSync(plikKont) && !process.argv.includes("--konto-testowe")) USERS = readFileSync(plikKont, "utf-8");
else {
  const sol = randomBytes(16);
  const h = pbkdf2Sync("test-haslo-123", sol, 100000, 32, "sha256");
  USERS = JSON.stringify([{ login: "test", imie: "Konto Testowe", haslo: `pbkdf2$100000$${sol.toString("base64")}$${h.toString("base64")}` }]);
  console.log("Konto testowe: login „test”, hasło „test-haslo-123”");
}
const env = { USERS, SESSION_SECRET: randomBytes(32).toString("hex"), GITHUB_TOKEN: "dev", GITHUB_REPO: "dev/wlew", GITHUB_BRANCH: "main" };
// --platnosci: włącza dostęp płatny (kody z panelu). --polar: dodatkowo udawany Polar z kodami WLEW-TEST-OK, WLEW-TEST-ODEBRANY.
if (process.argv.includes("--platnosci")) {
  Object.assign(env, { PLATNOSCI: "on", KONTAKT_DOSTEP: "Napisz do Marcina: tel. 600 000 000, zapłacisz BLIK-iem" });
  if (process.argv.includes("--polar")) Object.assign(env, { POLAR_ORG_ID: "org_test", POLAR_BENEFIT_ID: "ben_test", POLAR_API: "https://polar.mock", POLAR_CHECKOUT_URL: "https://polar.mock/checkout" });
  console.log("Dostęp płatny: WŁĄCZONY (kody wydawane w panelu → Dostępy)");
}
const polarKlucze = {
  "WLEW-TEST-OK": { status: "granted", limit: 2, aktywacje: new Map() },
  "WLEW-TEST-ODEBRANY": { status: "revoked", limit: 2, aktywacje: new Map() },
};
async function udawanyPolar(url, opt) {
  const akcja = url.split("/").pop();
  const b = JSON.parse(opt.body || "{}");
  const k = polarKlucze[b.key];
  if (!k || b.organization_id !== "org_test") return Response.json({ detail: "License key not found" }, { status: 404 });
  const klucz = { status: k.status, benefit_id: "ben_test", key: b.key, limit_activations: k.limit, expires_at: null };
  if (akcja === "activate") {
    if (k.aktywacje.size >= k.limit) return Response.json({ detail: "License key activation limit reached" }, { status: 403 });
    const id = "act_" + randomBytes(4).toString("hex");
    k.aktywacje.set(id, b.label);
    console.log(`[polar] aktywacja ${b.key} → ${id} (${b.label})`);
    return Response.json({ id, label: b.label, license_key: klucz });
  }
  if (akcja === "validate") {
    if (b.activation_id && !k.aktywacje.has(b.activation_id)) return Response.json({ detail: "Activation not found" }, { status: 404 });
    return Response.json({ ...klucz, activation: { id: b.activation_id } });
  }
  if (akcja === "deactivate") { k.aktywacje.delete(b.activation_id); console.log(`[polar] dezaktywacja ${b.activation_id}`); return new Response(null, { status: 204 }); }
  return Response.json({ detail: "?" }, { status: 400 });
}

// ---------- udawany GitHub ----------
const REPO_DIR = join(ROOT, ".cache/dev-repo");
const plikRepo = (sciezka) => join(REPO_DIR, sciezka.replace(/\//g, "__"));
mkdirSync(REPO_DIR, { recursive: true });
if (!existsSync(plikRepo("app/data/leki.json")) || process.argv.includes("--reset")) {
  writeFileSync(plikRepo("app/data/leki.json"), readFileSync(join(ROOT, "app/data/leki.json")));
  if (existsSync(plikRepo("data/dostepy.json"))) writeFileSync(plikRepo("data/dostepy.json"), JSON.stringify({ osoby: [] }));
}
const sha = (b) => createHash("sha1").update(b).digest("hex");
const prawdziwyFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  if (String(url).startsWith("https://polar.mock/")) return udawanyPolar(String(url), opt);
  if (!String(url).startsWith("https://api.github.com/")) return prawdziwyFetch(url, opt);
  const sciezka = decodeURIComponent(new URL(url).pathname.split("/contents/")[1] || "");
  const plik = plikRepo(sciezka);
  const jest = existsSync(plik);
  const tresc = jest ? readFileSync(plik) : null;
  if ((opt.method || "GET") === "GET") {
    if (!jest) return Response.json({ message: "Not Found" }, { status: 404 });
    return Response.json({ sha: sha(tresc), content: tresc.toString("base64") });
  }
  const body = JSON.parse(opt.body);
  if ((jest ? sha(tresc) : undefined) !== body.sha) return Response.json({ message: "conflict" }, { status: 409 });
  const nowa = Buffer.from(body.content, "base64");
  writeFileSync(plik, nowa);
  console.log(`[repo] ${sciezka}: ${body.message}  (autor: ${body.author?.name})`);
  return Response.json({ content: { sha: sha(nowa) } });
};

// ---------- serwer: ten sam worker.js co na Cloudflare, ASSETS = pliki z app/ ----------
const worker = (await import(pathToFileURL(join(ROOT, "worker.js")).href)).default;
env.ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p.endsWith("/")) p += "index.html";
    let plik = join(ROOT, "app", p);
    if (!extname(plik) && existsSync(plik + ".html")) plik += ".html"; // jak Cloudflare: /admin → admin.html
    if (!plik.startsWith(join(ROOT, "app")) || !existsSync(plik)) return new Response("404", { status: 404 });
    return new Response(readFileSync(plik), { headers: { "Content-Type": TYPY[extname(plik)] || "application/octet-stream", "Cache-Control": "no-cache" } });
  },
};
createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const odp = await worker.fetch(request, env);
    res.writeHead(odp.status, Object.fromEntries(odp.headers));
    res.end(Buffer.from(await odp.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, () => console.log(`Wlew (dev): http://localhost:${PORT}  ·  panel: http://localhost:${PORT}/admin.html`));
