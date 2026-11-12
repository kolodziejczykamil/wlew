// Lokalny serwer do testów: pliki z app/ + funkcje z functions/api (jak na Cloudflare Pages),
// a zamiast prawdziwego GitHuba – kopia app/data/leki.json w .cache/dev-repo/ (prawdziwe repo nie jest ruszane).
//
//   node tools/dev-server.mjs            → http://localhost:8788  (panel: /admin.html)
//
// Konta: z tools/.konta.json (tools/konta.py), a gdy go nie ma – konto testowe test / test-haslo-123.
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
if (existsSync(plikKont)) USERS = readFileSync(plikKont, "utf-8");
else {
  const sol = randomBytes(16);
  const h = pbkdf2Sync("test-haslo-123", sol, 100000, 32, "sha256");
  USERS = JSON.stringify([{ login: "test", imie: "Konto Testowe", haslo: `pbkdf2$100000$${sol.toString("base64")}$${h.toString("base64")}` }]);
  console.log("Konto testowe: login „test”, hasło „test-haslo-123”");
}
const env = { USERS, SESSION_SECRET: randomBytes(32).toString("hex"), GITHUB_TOKEN: "dev", GITHUB_REPO: "dev/wlew", GITHUB_BRANCH: "main" };

// ---------- udawany GitHub ----------
const REPO = join(ROOT, ".cache/dev-repo/leki.json");
mkdirSync(dirname(REPO), { recursive: true });
if (!existsSync(REPO) || process.argv.includes("--reset")) writeFileSync(REPO, readFileSync(join(ROOT, "app/data/leki.json")));
const sha = (b) => createHash("sha1").update(b).digest("hex");
const prawdziwyFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  if (!String(url).startsWith("https://api.github.com/")) return prawdziwyFetch(url, opt);
  const tresc = readFileSync(REPO);
  if ((opt.method || "GET") === "GET") return Response.json({ sha: sha(tresc), content: tresc.toString("base64") });
  const body = JSON.parse(opt.body);
  if (body.sha !== sha(tresc)) return Response.json({ message: "conflict" }, { status: 409 });
  const nowa = Buffer.from(body.content, "base64");
  writeFileSync(REPO, nowa);
  console.log(`[repo] commit: ${body.message}  (autor: ${body.author?.name})`);
  return Response.json({ content: { sha: sha(nowa) } });
};

// ---------- serwer ----------
createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const nazwa = url.pathname.slice(5).replace(/[^a-z]/g, "");
      const plik = join(ROOT, "functions/api", nazwa + ".js");
      if (!existsSync(plik)) { res.writeHead(404).end(); return; }
      const mod = await import(pathToFileURL(plik).href);
      const fn = mod["onRequest" + req.method[0] + req.method.slice(1).toLowerCase()] || mod.onRequest;
      if (!fn) { res.writeHead(405).end(); return; }
      const chunks = []; for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const odp = await fn({ request, env });
      res.writeHead(odp.status, Object.fromEntries(odp.headers));
      res.end(Buffer.from(await odp.arrayBuffer()));
      return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p.endsWith("/")) p += "index.html";
    const plik = join(ROOT, "app", p);
    if (!plik.startsWith(join(ROOT, "app")) || !existsSync(plik)) { res.writeHead(404).end("404"); return; }
    res.writeHead(200, { "Content-Type": TYPY[extname(plik)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(readFileSync(plik));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, () => console.log(`Wlew (dev): http://localhost:${PORT}  ·  panel: http://localhost:${PORT}/admin.html`));
