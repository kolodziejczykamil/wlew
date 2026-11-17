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
// Dostęp płatny (Polar.sh przez /api/dostep). Bez serwera (np. lokalny podgląd plików) wszystko jest dostępne.
let DOSTEP = { platnosci: false, pelny: true, kupUrl: "", cena: "", proba: "14" };

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
  const d = await (await fetch("data/leki.json", { cache: "no-store", credentials: "same-origin" })).json();
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
  $("karta").innerHTML = renderKarta(k, { paywall: htmlPaywall() }) + `
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
  if (h === "info" || h === "dostep") {
    zakladka = "info"; pokaz("ekranInfo");
    if (h === "dostep") $("dostep").scrollIntoView({ block: "start" });
    return;
  }
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
// ---------- instalacja na ekranie głównym ----------
const ua = navigator.userAgent;
const zainstalowana = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const iOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
const wbudowana = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|WhatsApp|GSA\//.test(ua);
let monitInstalacji = null;
function instrukcjaInstalacji() {
  if (zainstalowana) return "<p>Wlew jest już zainstalowany na tym urządzeniu.</p>";
  if (wbudowana) return `<p><b>Otwórz ten adres w ${iOS ? "Safari" : "Chrome"}.</b> Przeglądarka wbudowana w komunikator lub aplikację społecznościową nie pozwala dodać strony do ekranu głównego. W menu (⋯ lub ⋮) wybierz „Otwórz w ${iOS ? "Safari" : "przeglądarce"}”.</p>`;
  if (iOS) return `<p>W <b>Safari</b> stuknij <b>Udostępnij</b> (kwadrat ze strzałką w górę), przewiń w dół i wybierz <b>„Do ekranu początkowego”</b>.</p><p class="small">Nie widać tej opcji? Na dole listy stuknij „Edytuj czynności” i dodaj ją.</p>`;
  return `${monitInstalacji ? `<button class="btn btn-primary btn-block" type="button" id="instalujBtn">${ic("pobierz")}Zainstaluj Wlew</button>` : ""}
    <p>W <b>Chrome</b> stuknij <b>⋮</b> w prawym górnym rogu i wybierz <b>„Dodaj do ekranu głównego”</b> albo <b>„Zainstaluj aplikację”</b>.</p>`;
}
function odswiezInstalacje() {
  $("instrukcjaInstalacji").innerHTML = instrukcjaInstalacji() + `<p class="small">Po instalacji Wlew działa jak zwykła aplikacja, także bez internetu.</p>`;
  $("instalujBtn")?.addEventListener("click", async () => {
    monitInstalacji.prompt();
    await monitInstalacji.userChoice.catch(() => null);
    monitInstalacji = null; odswiezInstalacje();
  });
  const pokazBaner = !zainstalowana && !pamiec.get("banerInstalacjiZamkniety", false);
  $("banerInstalacji").hidden = !pokazBaner;
  if (pokazBaner) {
    $("banerInstalacji").innerHTML = `${ic("pobierz")}<div style="flex:1">Dodaj Wlew do ekranu głównego – działa wtedy bez internetu. <a href="#info">Jak to zrobić</a></div>
      <button class="icon-btn" type="button" id="zamknijBaner" aria-label="Zamknij" style="height:24px;min-width:24px;padding:0;color:inherit">${ic("x")}</button>`;
    $("zamknijBaner").addEventListener("click", () => { pamiec.set("banerInstalacjiZamkniety", true); $("banerInstalacji").hidden = true; });
  }
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); monitInstalacji = e; odswiezInstalacje(); });
window.addEventListener("appinstalled", () => { pamiec.set("banerInstalacjiZamkniety", true); odswiezInstalacje(); });
odswiezInstalacje();

const pasek = $("gornyPasek");
window.addEventListener("scroll", () => pasek.classList.toggle("scrolled", scrollY > 4), { passive: true });
window.addEventListener("hashchange", trasa);

// ---------- dostęp ----------
const zapisanyKod = () => pamiec.get("kod", null); // {kod, aktywacja, sprawdzono}
async function api(metoda, dane) {
  const r = await fetch("api/dostep", {
    method: metoda, credentials: "same-origin", cache: "no-store",
    headers: dane ? { "Content-Type": "application/json", "X-Wlew": "1" } : {},
    body: dane ? JSON.stringify(dane) : undefined,
  });
  let d = null; try { d = await r.json(); } catch { /* brak serwera */ }
  return { ok: r.ok, status: r.status, d };
}
async function pobierzDostep() {
  try { const { ok, d } = await api("GET"); if (ok && d) DOSTEP = d; } catch { /* offline albo brak serwera */ }
}
function nazwaUrzadzenia() {
  const ua = navigator.userAgent;
  const typ = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Urządzenie";
  return `${typ} · ${new Date().toLocaleDateString("pl-PL")}`;
}
function htmlPaywall() {
  return `<section class="paywall">
    <div class="lock">${ic("klodka")}<div><b>Pełna karta w wersji z dostępem</b><p class="small" style="margin-top:2px">Czym i w ile rozcieńczyć, jak szybko podać, uwagi i praktyka oddziału.</p></div></div>
    <div class="ghost-lines" aria-hidden="true"><i style="width:70%"></i><i style="width:90%"></i><i style="width:55%"></i></div>
    ${DOSTEP.kupUrl ? `<a class="btn btn-primary btn-block" href="${esc(DOSTEP.kupUrl)}" target="_blank" rel="noopener">Wypróbuj ${esc(DOSTEP.proba)} dni za darmo</a>
      <p class="small" style="text-align:center">Potem ${esc(DOSTEP.cena)}. Anulujesz w każdej chwili.</p>` : ""}
    <a class="btn btn-secondary btn-block" href="#dostep">Mam kod dostępu</a>
  </section>`;
}
function renderDostep(komunikat = "", blad = false) {
  const sek = $("dostep");
  sek.hidden = !DOSTEP.platnosci;
  if (!DOSTEP.platnosci) return;
  const z = zapisanyKod();
  const info = komunikat ? `<div class="notice ${blad ? "n-danger" : "n-ok"}">${ic(blad ? "uwaga" : "ok")}<div>${esc(komunikat)}</div></div>` : "";
  if (DOSTEP.pelny) {
    const skad = DOSTEP.powod === "panel" ? "Masz pełny dostęp jako osoba z zespołu (zalogowana w panelu)." : "Masz pełny dostęp na tym urządzeniu.";
    $("dostepTresc").innerHTML = `${info}<p class="access-ok">${ic("ok")} ${skad}</p>
      ${z ? `<p class="small">Kod: ${esc(z.kod.slice(0, 4))}…${esc(z.kod.slice(-4))}. Możesz go używać na kilku urządzeniach – jeśli zabraknie miejsca, usuń go stąd.</p>
      <button class="btn btn-ghost btn-block" type="button" id="usunKod">Usuń dostęp z tego urządzenia</button>` : ""}`;
    $("usunKod")?.addEventListener("click", usunKod);
    return;
  }
  $("dostepTresc").innerHTML = `${info}
    <p class="small">Bez dostępu widzisz listę leków, ostrzeżenia krytyczne i link do ChPL. Pełne karty odblokowuje kod z zakupu.</p>
    ${DOSTEP.kupUrl ? `<a class="btn btn-primary btn-block" href="${esc(DOSTEP.kupUrl)}" target="_blank" rel="noopener">Wypróbuj ${esc(DOSTEP.proba)} dni za darmo</a>
      <p class="small">Potem ${esc(DOSTEP.cena)}. Kod dostępu przyjdzie mailem po zakupie.</p>` : ""}
    <form id="formKod" class="stack" style="gap:8px" novalidate>
      <label class="field"><span class="label">Kod dostępu</span>
        <input class="input" id="poleKod" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="np. 1A2B3C4D-…" value="${esc(z?.kod || "")}"></label>
      <button class="btn btn-secondary btn-block" type="submit" id="aktywujBtn">Aktywuj na tym urządzeniu</button>
    </form>`;
  $("formKod").addEventListener("submit", async (e) => {
    e.preventDefault();
    const kod = $("poleKod").value.trim();
    if (!kod) return;
    $("aktywujBtn").disabled = true; $("aktywujBtn").textContent = "Sprawdzam…";
    const { ok, d } = await api("POST", { akcja: "aktywuj", kod, urzadzenie: nazwaUrzadzenia() }).catch(() => ({ ok: false, d: { blad: "Brak połączenia z internetem." } }));
    if (!ok) return renderDostep(d?.blad || "Nie udało się aktywować kodu.", true);
    pamiec.set("kod", { kod, aktywacja: d.aktywacja, sprawdzono: Date.now() });
    await pobierzDostep(); await wczytaj();
    renderDostep("Gotowe – pełne karty są odblokowane na tym urządzeniu.");
  });
}
async function usunKod() {
  const z = zapisanyKod();
  if (z) await api("POST", { akcja: "dezaktywuj", kod: z.kod, aktywacja: z.aktywacja }).catch(() => null);
  pamiec.set("kod", null);
  await pobierzDostep(); await wczytaj();
  renderDostep("Usunięto dostęp z tego urządzenia.");
}
/** Raz na dobę (gdy jest internet) potwierdza kod i odnawia dostęp. Bez internetu działa ostatnia pobrana wersja kart. */
async function odswiezKod() {
  const z = zapisanyKod();
  if (!DOSTEP.platnosci || !z || !navigator.onLine) return false;
  if (DOSTEP.pelny && Date.now() - (z.sprawdzono || 0) < 864e5) return false;
  const { ok, status, d } = await api("POST", { akcja: "odswiez", kod: z.kod, aktywacja: z.aktywacja }).catch(() => ({ ok: false, status: 0 }));
  if (ok) { pamiec.set("kod", { ...z, sprawdzono: Date.now() }); return true; }
  if (status === 403 && d?.odebrany) { pamiec.set("kod", { kod: z.kod }); return true; } // zostaw kod w polu, żeby łatwo aktywować ponownie
  return false;
}

await pobierzDostep();
if (await odswiezKod()) await pobierzDostep();
renderDostep();
await wczytaj();
trasa();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
