import { CONFIG } from "./config.js";
import { ic } from "./ikony.js";
import { dataPL, esc, kropki, norm, renderKarta, STATUSY, widoczna } from "./karta.js";

const $ = (id) => document.getElementById(id);
const pamiec = {
  get(k, d) { try { const v = localStorage.getItem("wlew." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("wlew." + k, JSON.stringify(v)); } catch { /* tryb prywatny */ } },
};

let LEKI = [];
let stanBazy = "";
let zakladka = "szukaj";
const ulubione = new Set(pamiec.get("ulubione", []));

// ---------- ikony w HTML ----------
document.querySelectorAll("[data-ic]").forEach((el) => (el.outerHTML = ic(el.dataset.ic)));
$("ikonaSzukaj").outerHTML = ic("szukaj");
$("wsteczBtn").innerHTML = ic("wstecz") + "<span>Wróć</span>";
$("ulubBtn").innerHTML = ic("gwiazdka");
$("listaZasad").innerHTML = [
  "Dla personelu medycznego i studentów kierunków medycznych.",
  "Pomoc informacyjna. Nie zastępuje ChPL, zlecenia lekarskiego ani procedur oddziału.",
  "Niczego nie przelicza dla pacjenta i nie dobiera dawek.",
  "Przy każdym leku jest źródło i link do oryginalnej ChPL.",
  "Nie zbiera żadnych danych o Tobie ani o pacjentach.",
].map((t) => `<li>${ic("ok")}<span>${t}</span></li>`).join("");

// ---------- dane ----------
async function wczytaj() {
  const d = await (await fetch("data/leki.json", { cache: "no-cache" })).json();
  stanBazy = d.stanBazy;
  LEKI = d.leki.filter((k) => !k.ukryty);
  for (const k of LEKI) {
    k._s = norm([k.substancja, k.nazwa, k.aliasy, ...(k.zamienniki || [])].join(" "));
    k._a = norm(k.substancja);
    k._b = norm(k.nazwa);
  }
  LEKI.sort((a, b) => a.substancja.localeCompare(b.substancja, "pl"));
  $("stanBazy").textContent = "Baza " + dataPL(stanBazy);
  $("infoBaza").textContent = `Stan Rejestru Produktów Leczniczych: ${dataPL(stanBazy)}. Liczba leków: ${LEKI.length}.`;
  const dni = (Date.now() - new Date(stanBazy).getTime()) / 864e5;
  if (dni > CONFIG.ostrzezenieDni) {
    $("ostrzezenie").hidden = false;
    $("ostrzezenie").innerHTML = `${ic("uwaga")}<div>Baza ma ${Math.floor(dni)} dni. Zaktualizuj aplikację, a do tego czasu sprawdzaj dane w ChPL.</div>`;
  }
}

// ---------- ekrany ----------
const EKRANY = ["ekranZgody", "ekranLista", "ekranKarta", "ekranInfo"];
function pokaz(id) {
  EKRANY.forEach((e) => ($(e).hidden = e !== id));
  $("tabbar").hidden = id === "ekranZgody";
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-current", t.dataset.tab === zakladka ? "page" : "false"));
  window.scrollTo(0, 0);
}

function wyniki() {
  const t = norm($("szukaj").value.trim());
  let lista = LEKI;
  if (zakladka === "ulubione") lista = lista.filter((k) => ulubione.has(k.id));
  if (zakladka === "plyny") lista = lista.filter((k) => k.typ === "plyn");
  if (!t) return { lista, grupuj: zakladka === "szukaj" };
  const slowa = t.split(/\s+/);
  const ocena = (k) => (k._a.startsWith(t) || k._b.startsWith(t) ? 0 : k._a.includes(t) || k._b.includes(t) ? 1 : 2);
  return { lista: lista.filter((k) => slowa.every((s) => k._s.includes(s))).sort((a, b) => ocena(a) - ocena(b)), grupuj: false };
}

const wiersz = (k) => {
  const st = k.status !== "zweryfikowany" ? STATUSY[k.status] : null;
  return `<button class="row" data-id="${esc(k.id)}" type="button">
    <span class="row-main"><span class="row-title">${esc(k.substancja)}</span><span class="row-sub">${esc(k.nazwa)}${k.moc ? " · " + esc(k.moc) : ""}</span></span>
    <span class="row-aside">${widoczna(k) ? kropki(k) : ""}${st ? `<span class="tag ${st.klasa}">${st.etykieta}</span>` : ""}${ic("dalej", "chev")}</span>
  </button>`;
};

function renderLista() {
  const { lista, grupuj } = wyniki();
  if (!lista.length) {
    const pusto = {
      ulubione: ["Brak ulubionych", "Otwórz kartę leku i stuknij gwiazdkę, żeby mieć ją pod ręką."],
      plyny: ["Brak wyników", "Spróbuj innej nazwy płynu."],
      szukaj: ["Nie znaleziono leku", "Spróbuj nazwy substancji, np. „metamizol”, albo nazwy handlowej."],
    }[zakladka];
    $("wyniki").innerHTML = `<div class="empty"><b>${pusto[0]}</b>${pusto[1]}</div>`;
    return;
  }
  if (!grupuj) { $("wyniki").innerHTML = `<div class="list">${lista.map(wiersz).join("")}</div>`; return; }
  const grupy = new Map();
  for (const k of lista) {
    const l = k.substancja[0].toLocaleUpperCase("pl");
    if (!grupy.has(l)) grupy.set(l, []);
    grupy.get(l).push(k);
  }
  $("wyniki").innerHTML = [...grupy].map(([l, ks]) => `<div class="letter">${esc(l)}</div><div class="list">${ks.map(wiersz).join("")}</div>`).join("");
}

function ekranListy(tab) {
  zakladka = tab;
  $("tytulListy").innerHTML = { szukaj: 'Wl<span>e</span>w', ulubione: "Ulubione", plyny: "Płyny infuzyjne" }[tab];
  $("szukaj").placeholder = tab === "plyny" ? "Szukaj płynu" : "Lek lub substancja";
  pokaz("ekranLista");
  renderLista();
}

function ekranKarty(id) {
  const k = LEKI.find((x) => x.id === id);
  if (!k) return ekranListy(zakladka);
  $("tytulKarty").textContent = k.substancja;
  $("karta").innerHTML = renderKarta(k) + `
    <section class="group"><h3 class="group-title">Widzisz błąd?</h3>
      <p class="small">Napisz na adres poniżej. Podaj nazwę leku (${esc(k.substancja)}) i co jest nie tak.</p>
      <div class="copy">${esc(CONFIG.emailBledow)}</div></section>`;
  ustawGwiazdke(k.id);
  pokaz("ekranKarta");
}

function ustawGwiazdke(id) {
  const on = ulubione.has(id);
  const b = $("ulubBtn");
  b.dataset.id = id;
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", on ? "Usuń z ulubionych" : "Dodaj do ulubionych");
}

// ---------- trasy: #szukaj #ulubione #plyny #info #lek-<id> ----------
function trasa() {
  if (pamiec.get("zgoda", 0) < CONFIG.wersjaZgody) return pokaz("ekranZgody");
  const h = location.hash.slice(1);
  if (h.startsWith("lek-")) return ekranKarty(h.slice(4));
  if (h === "info") { zakladka = "info"; return pokaz("ekranInfo"); }
  ekranListy(["ulubione", "plyny"].includes(h) ? h : "szukaj");
}

// ---------- zdarzenia ----------
$("zgodaCheck").addEventListener("change", (e) => ($("zgodaBtn").disabled = !e.target.checked));
$("zgodaBtn").addEventListener("click", () => { pamiec.set("zgoda", CONFIG.wersjaZgody); location.hash = "szukaj"; trasa(); });
$("szukaj").addEventListener("input", renderLista);
$("szukaj").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const r = $("wyniki").querySelector(".row"); if (r) { $("szukaj").blur(); location.hash = "lek-" + r.dataset.id; } }
});
$("wyniki").addEventListener("click", (e) => { const r = e.target.closest(".row"); if (r) location.hash = "lek-" + r.dataset.id; });
$("tabbar").addEventListener("click", (e) => {
  const t = e.target.closest(".tab");
  if (!t) return;
  if (t.dataset.tab === zakladka && location.hash === "#" + zakladka && zakladka === "szukaj") { $("szukaj").focus(); return; }
  location.hash = t.dataset.tab;
});
$("wsteczBtn").addEventListener("click", () => (history.length > 1 ? history.back() : (location.hash = zakladka)));
$("ulubBtn").addEventListener("click", (e) => {
  const id = e.currentTarget.dataset.id;
  ulubione.has(id) ? ulubione.delete(id) : ulubione.add(id);
  pamiec.set("ulubione", [...ulubione]);
  ustawGwiazdke(id);
});
$("emailBledow").textContent = CONFIG.emailBledow;
$("kopiujEmail").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText(CONFIG.emailBledow); e.target.textContent = "Skopiowano"; }
  catch { getSelection().selectAllChildren($("emailBledow")); }
});
const pasek = $("gornyPasek");
window.addEventListener("scroll", () => pasek.classList.toggle("scrolled", scrollY > 4), { passive: true });
window.addEventListener("hashchange", trasa);

await wczytaj();
trasa();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
