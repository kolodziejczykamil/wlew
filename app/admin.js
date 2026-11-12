// Panel admina: zarządzanie listą leków i kartami.
// Zmiany trzymane są w przeglądarce jako kopia robocza, a „Opublikuj” zapisuje je w repozytorium na GitHubie
// (GitHub Actions dociąga ChPL, Cloudflare Pages publikuje nową wersję aplikacji).
import * as gh from "./github.js";
import { ic } from "./ikony.js";
import { dataPL, esc, maTresc, norm, renderKarta, STATUSY } from "./karta.js";

const $ = (s, el = document) => el.querySelector(s);
let APP = $("#app");
// Każdy ekran dostaje świeży element – bez dublowania nasłuchów zdarzeń.
function nowyEkran(klasa) {
  const nowy = APP.cloneNode(false);
  APP.replaceWith(nowy);
  APP = nowy;
  APP.className = klasa;
}
const LS = { baza: "wlew.admin.baza", base: "wlew.admin.base", baseSha: "wlew.admin.baseSha", kto: "wlew.admin.kto" };
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* pełna pamięć */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* */ } },
};
const PLYNY_SZYBKIE = ["NaCl 0,9%", "Glukoza 5%", "Glukoza 10%", "Ringer", "Ringer z mleczanami", "PWE", "Woda do wstrzykiwań"];
const SEKCJE = ["4.2", "6.2", "6.3", "6.6"];
const CHPL_URL = (r) => `https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/${r}/characteristic`;

let BAZA, ZRODLA = {}, REJESTR = null;
let brudne = false;
let filtr = "wszystkie";
let widok = "karta";       // edycja: karta | chpl | podglad
let sekcja = "6.6";
let wybranyProdukt = null; // ekran dodawania
let potwierdzUsun = false;
let potwierdzOdrzuc = false;
let BASE = null, baseSha = null;   // wersja, od której zaczęła się edycja (do scalania przy publikacji)
let publikacja = { trwa: false, komunikat: null, blad: null };
let polaczenie = { ok: false, blad: null };

// ---------- dane ----------
// Najświeższa wersja: z repozytorium (gdy jest klucz), inaczej z opublikowanej strony.
let zSerwera = null;
if (gh.token.get()) {
  try { const r = await gh.pobierz(gh.token.get()); zSerwera = r.dane; baseSha = r.sha; polaczenie.ok = true; }
  catch (e) { polaczenie.blad = e.message; }
}
if (!zSerwera) zSerwera = await (await fetch("data/leki.json", { cache: "no-cache" })).json();
try { ZRODLA = await (await fetch("data/zrodla.json", { cache: "no-cache" })).json(); } catch { /* brak pliku */ }
BAZA = structuredClone(zSerwera);
BASE = zSerwera;
const kopia = ls.get(LS.baza);
if (kopia) {
  try {
    const k = JSON.parse(kopia);
    if (Array.isArray(k.leki)) {
      BAZA = k; brudne = true;
      const b = ls.get(LS.base);
      BASE = b ? JSON.parse(b) : zSerwera;
      baseSha = ls.get(LS.baseSha) || null;
    }
  } catch { /* */ }
}

async function rejestr() {
  if (!REJESTR) REJESTR = await (await fetch("data/rejestr-iv.json")).json();
  return REJESTR;
}
const karta = (id) => BAZA.leki.find((k) => k.id === id);
const dzis = () => new Date().toISOString().slice(0, 10);
const kto = () => (ls.get(LS.kto) || "").trim();

function zapiszKopie() {
  if (!brudne) { ls.set(LS.base, JSON.stringify(BASE)); baseSha ? ls.set(LS.baseSha, baseSha) : ls.del(LS.baseSha); }
  brudne = true;
  ls.set(LS.baza, JSON.stringify(BAZA));
}
function wyczyscKopie() {
  [LS.baza, LS.base, LS.baseSha].forEach(ls.del);
  brudne = false;
}
function zmiana(k) {
  // każda zmiana w sprawdzonej karcie wymaga ponownego zatwierdzenia
  if (k && (k.status === "zweryfikowany" || k.status === "do-ponownej-weryfikacji")) {
    k.status = "szkic"; k.weryfikacja = null;
    toast("Karta wróciła do szkicu – zatwierdź ją ponownie");
    zapiszKopie(); return true;
  }
  zapiszKopie(); return false;
}
let toastT;
function toast(t) {
  const el = $("#toast"); el.textContent = t; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 2600);
}
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lek";
function noweId(s) { let id = slug(s), i = 2; while (karta(id)) id = `${slug(s)}-${i++}`; return id; }

// ---------- wspólne kawałki ----------
const tag = (k) => {
  if (k.ukryty) return `<span class="tag t-ukryty">Ukryty</span>`;
  const s = STATUSY[k.status];
  return s ? `<span class="tag ${s.klasa}">${s.etykieta}</span>` : "";
};
const pasek = (tytul, { wstecz = null, prawa = "" } = {}) => `
  <div class="topbar pad">
    <div class="topbar-row">
      ${wstecz ? `<a class="icon-btn" href="${wstecz}" aria-label="Wróć">${ic("wstecz")}</a>` : ""}
      <span class="${wstecz ? "bar-title" : "brand"}">${tytul}</span>
      ${prawa || (wstecz ? '<span style="width:40px"></span>' : "")}
    </div>
  </div>`;
const zakladki = (akt) => document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-current", t.dataset.tab === akt ? "page" : "false"));
document.querySelectorAll("[data-ic]").forEach((el) => (el.outerHTML = ic(el.dataset.ic)));

// ---------- ekran: lista ----------
const FILTRY = {
  wszystkie: ["Wszystkie", (k) => !k.ukryty],
  szkic: ["Szkice", (k) => !k.ukryty && k.status === "szkic"],
  ok: ["Sprawdzone", (k) => !k.ukryty && k.status === "zweryfikowany"],
  uwaga: ["Do uwagi", (k) => !k.ukryty && ["do-ponownej-weryfikacji", "nie-iv", "brak-chpl"].includes(k.status)],
  ukryte: ["Ukryte", (k) => k.ukryty],
};

function ekranLista() {
  zakladki("lista");
  nowyEkran("shell");
  const L = BAZA.leki;
  const ile = (f) => L.filter(FILTRY[f][1]).length;
  APP.innerHTML = `
    ${pasek("Panel <span style='color:var(--ink-3);font-weight:500'>· Wlew</span>", { prawa: `<a class="icon-btn" href="index.html" target="_blank" rel="noopener" aria-label="Otwórz aplikację">${ic("oko")}</a>` })}
    <div class="pad stack">
      ${brudne ? `<div class="notice n-warn">${ic("uwaga")}<div>Masz nieopublikowane zmiany (${gh.podsumuj(BASE, BAZA).ile}). <a href="#plik">Opublikuj</a></div></div>` : ""}
      ${polaczenie.blad ? `<div class="notice n-danger">${ic("uwaga")}<div>Nie udało się połączyć z GitHubem: ${esc(polaczenie.blad)} <a href="#plik">Ustawienia</a></div></div>` : ""}
      <div class="stat-row">
        <div class="stat"><b>${ile("ok")}</b><span>sprawdzone</span></div>
        <div class="stat"><b>${ile("szkic")}</b><span>szkice</span></div>
        <div class="stat"><b>${ile("uwaga")}</b><span>do uwagi</span></div>
      </div>
      <div class="search">${ic("szukaj")}<input id="q" type="search" placeholder="Szukaj na liście" autocomplete="off" aria-label="Szukaj na liście"></div>
      <div class="chips-scroll">${Object.entries(FILTRY).map(([k, [n]]) => `<button class="chip-f" data-f="${k}" aria-pressed="${k === filtr}">${n} · ${ile(k)}</button>`).join("")}</div>
      <div id="lista"></div>
    </div>
    <a class="btn btn-primary fab" href="#dodaj">${ic("plus")}Dodaj lek</a>`;
  const rysuj = () => {
    const t = norm($("#q").value.trim());
    const lista = L.filter(FILTRY[filtr][1]).filter((k) => !t || norm(`${k.substancja} ${k.nazwa} ${k.aliasy}`).includes(t))
      .sort((a, b) => a.substancja.localeCompare(b.substancja, "pl"));
    $("#lista").innerHTML = lista.length
      ? `<div class="list">${lista.map((k) => `<a class="row${k.ukryty ? " dim" : ""}" href="#lek-${esc(k.id)}" style="text-decoration:none;color:inherit">
          <span class="row-main"><span class="row-title">${esc(k.substancja)}</span><span class="row-sub">${esc(k.nazwa)}${k.moc ? " · " + esc(k.moc) : ""}</span></span>
          <span class="row-aside">${tag(k)}${ic("dalej", "chev")}</span></a>`).join("")}</div>`
      : `<div class="empty"><b>Brak leków</b>Zmień filtr albo dodaj nowy lek.</div>`;
  };
  $("#q").addEventListener("input", rysuj);
  APP.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filtr = b.dataset.f; ekranLista(); }));
  rysuj();
}

// ---------- ekran: edycja karty ----------
function ekranLek(id) {
  const k = karta(id);
  if (!k) { location.hash = "lista"; return; }
  zakladki("lista");
  nowyEkran("shell wide has-actionbar");
  const z = ZRODLA[k.id];
  const seg = (opcje, akt, attr) => `<div class="segmented">${opcje.map(([v, n]) => `<button type="button" ${attr}="${v}" aria-pressed="${v === akt}">${n}</button>`).join("")}</div>`;
  APP.innerHTML = `
    ${pasek(esc(k.substancja), { wstecz: "#lista", prawa: `<span style="min-width:40px;display:flex;justify-content:flex-end">${tag(k)}</span>` })}
    <div class="pad only-narrow" style="padding-bottom:10px">${seg([["karta", "Karta"], ["chpl", "ChPL"], ["podglad", "Podgląd"]], widok, "data-widok")}</div>
    <div class="pad split">
      <div class="stack ${widok !== "karta" ? "hide-narrow" : ""}" id="formularz">${formularz(k)}</div>
      <div class="stack side ${widok === "karta" ? "hide-narrow" : ""}">
        <div class="only-wide">${seg([["chpl", "ChPL"], ["podglad", "Podgląd w aplikacji"]], widok === "podglad" ? "podglad" : "chpl", "data-widok")}</div>
        <div id="bok">${widok === "podglad" ? `<div class="stack">${renderKarta(k, { podglad: true })}</div>` : chpl(k, z)}</div>
      </div>
    </div>
    <div class="actionbar pad">${akcje(k)}</div>`;
  podepnijFormularz(k);
}

function formularz(k) {
  const lista = (pole, ph) => `<textarea class="textarea" data-linie="${pole}" placeholder="${ph}">${esc((k[pole] || []).join("\n"))}</textarea>`;
  return `
    ${k.uwagaAdmin ? `<div class="notice n-info">${ic("info")}<div>${esc(k.uwagaAdmin)}</div></div>` : ""}
    <section class="group">
      <h3 class="group-title">Lek</h3>
      <label class="field"><span class="label">Nazwa substancji (po polsku, tak jak szukają ludzie)</span><input class="input" data-pole="substancja" value="${esc(k.substancja)}"></label>
      <label class="field"><span class="label">Inne nazwy do wyszukiwarki</span><input class="input" data-pole="aliasy" value="${esc(k.aliasy)}" placeholder="np. pyralgina, potoczne skróty"></label>
      <div class="field"><span class="label">Rodzaj</span>
        <div class="segmented">${[["lek", "Lek"], ["plyn", "Płyn infuzyjny"]].map(([v, n]) => `<button type="button" data-typ="${v}" aria-pressed="${k.typ === v}">${n}</button>`).join("")}</div></div>
      <label class="field"><span class="label">Status</span>
        <select class="select" data-pole="status">
          ${["szkic", "nie-iv", "brak-chpl"].map((s) => `<option value="${s}" ${k.status === s ? "selected" : ""}>${STATUSY[s].etykieta}</option>`).join("")}
          ${["zweryfikowany", "do-ponownej-weryfikacji"].includes(k.status) ? `<option selected disabled>${STATUSY[k.status].etykieta}</option>` : ""}
        </select></label>
    </section>

    <section class="group">
      <h3 class="group-title">Produkt z rejestru</h3>
      <div class="product"><b>${esc(k.nazwa)}</b><span>${esc([k.moc, k.postac].filter(Boolean).join(" · ") || "—")}</span>
        <span>${k.zrodlo?.url ? `<a href="${esc(k.zrodlo.url)}" target="_blank" rel="noopener">Otwórz ChPL (PDF)</a>` : "Brak ChPL"}${k.zrodlo?.pozwolenie ? ` · pozwolenie ${esc(k.zrodlo.pozwolenie)}` : ""}</span></div>
      <a class="btn btn-secondary btn-block" href="#zmien-${esc(k.id)}">Zmień produkt</a>
      <label class="field"><span class="label">Opakowanie</span><input class="input" data-pole="opakowanie" value="${esc(k.opakowanie)}" placeholder="np. amp. 2 ml (100 mg)"></label>
      <label class="field"><span class="label">Punkty ChPL, z których pochodzą dane</span><input class="input" data-pole="punkty" value="${esc(k.punkty)}" placeholder="np. 4.2, 6.6" inputmode="decimal"></label>
    </section>

    <section class="group">
      <h3 class="group-title">Czym rozcieńczyć</h3>
      ${(k.plyny || []).map((p, i) => `<div class="item-row">
        <input class="input" data-plyn="${i}" value="${esc(p.nazwa)}" aria-label="Płyn">
        <label class="check" style="min-height:44px"><input type="checkbox" data-plyn-ok="${i}" ${p.ok !== false ? "checked" : ""}>dozwolony</label>
        <button class="x-btn" type="button" data-usun-plyn="${i}" aria-label="Usuń płyn">${ic("x")}</button></div>`).join("")}
      <div class="quick">${PLYNY_SZYBKIE.map((p) => `<button type="button" data-dodaj-plyn="${esc(p)}">+ ${esc(p)}</button>`).join("")}</div>
      <p class="hint">Odznacz „dozwolony”, gdy ChPL mówi, że płyn jest niezgodny albo należy go unikać. W aplikacji będzie przekreślony na czerwono.</p>
    </section>

    <section class="group">
      <h3 class="group-title">Ile i jak przygotować</h3>
      ${lista("przygotowanie", "Każda linia to osobny punkt, np.\n1 amp. (2 ml) w 100 ml NaCl 0,9%")}
    </section>
    <section class="group">
      <h3 class="group-title">Podanie</h3>
      ${lista("tempo", "np. Wlew 15–30 min")}
    </section>

    <section class="group">
      <h3 class="group-title">Uwagi</h3>
      ${(k.uwagi || []).map((u, i) => `<div class="item-row">
        <textarea class="textarea" data-uwaga="${i}" aria-label="Uwaga" style="min-height:64px">${esc(u.tekst)}</textarea>
        <div class="item-tools"><button class="x-btn" type="button" data-usun-uwage="${i}" aria-label="Usuń uwagę">${ic("x")}</button>
        <label class="check"><input type="checkbox" data-uwaga-wazna="${i}" ${u.wazne ? "checked" : ""}>krytyczna</label></div></div>`).join("")}
      <div class="quick"><button type="button" data-dodaj-uwage>+ Dodaj uwagę</button></div>
      <p class="hint">Krytyczne uwagi pokazują się na czerwono na samej górze karty (np. niezgodność, której pomylenie jest groźne).</p>
    </section>

    <section class="group">
      <h3 class="group-title">Notatka wewnętrzna</h3>
      <textarea class="textarea" data-pole="uwagaAdmin" placeholder="Widoczna tylko w panelu" style="min-height:64px">${esc(k.uwagaAdmin)}</textarea>
    </section>

    <section class="group">
      <h3 class="group-title">Widoczność i usuwanie</h3>
      <button class="btn btn-secondary btn-block" type="button" data-ukryj>${ic(k.ukryty ? "oko" : "okoX")}${k.ukryty ? "Pokaż w aplikacji" : "Ukryj w aplikacji"}</button>
      ${potwierdzUsun
        ? `<div class="confirm"><b>Usunąć ${esc(k.substancja)} z listy?</b><span>Karta zniknie z pliku po zapisaniu. Jeśli chcesz ją tylko schować, użyj „Ukryj”.</span>
           <div class="btns"><button class="btn btn-secondary" type="button" data-usun-anuluj>Anuluj</button><button class="btn btn-danger" type="button" data-usun-tak>${ic("kosz")}Usuń</button></div></div>`
        : `<button class="btn btn-danger btn-block" type="button" data-usun>${ic("kosz")}Usuń lek z listy</button>`}
    </section>`;
}

function chpl(k, z) {
  if (!z?.sekcje || !Object.keys(z.sekcje).length) {
    return `<div class="notice n-info">${ic("info")}<div>Fragmenty ChPL pojawią się po aktualizacji danych (skrypt <code>tools/pobierz.py</code>). Do tego czasu otwórz PDF.</div></div>
      ${k.zrodlo?.url ? `<a class="btn btn-secondary btn-block" href="${esc(k.zrodlo.url)}" target="_blank" rel="noopener">${ic("dokument")}Otwórz ChPL (PDF)</a>` : ""}`;
  }
  const t = z.sekcje[sekcja];
  return `
    <div class="chips-scroll">${SEKCJE.map((s) => `<button class="chip-f" type="button" data-sekcja="${s}" aria-pressed="${s === sekcja}">pkt ${s}</button>`).join("")}
      ${z.chplUrl ? `<a class="chip-f" href="${esc(z.chplUrl)}" target="_blank" rel="noopener" style="text-decoration:none">PDF ↗</a>` : ""}</div>
    ${z.meta ? `<p class="small">${esc(z.meta.nazwa)} · ${esc(z.meta.moc)} · ${esc(z.meta.podmiot)}${z.dataChpl ? " · ChPL z " + esc(z.dataChpl) : ""}</p>` : ""}
    <section class="group"><div class="chpl">${t ? podswietl(t) : "Brak tego punktu w pobranej ChPL."}</div></section>
    <p class="small">Tekst wycięty automatycznie z PDF. Przy tabelach i przypisach sprawdź oryginał.</p>`;
}

function podswietl(tekst) {
  let h = esc(tekst);
  h = h.replace(/(niezgodn\w*|nie należy|nie wolno|nie mieszać|nie łączyć|wyłącznie|wytrąc\w*|nie może być podawany)/gi, '<mark class="m-bad">$1</mark>');
  h = h.replace(/(glukoz\w*|chlork\w* sodu|NaCl|soli fizjologicznej|Ringera?\w*|mleczan\w*|Hartmanna|wod\w* do wstrzykiwań|wieloelektrolit\w*)/gi, "<mark>$1</mark>");
  h = h.replace(/(\d+(?:[,.]\d+)?(?:\s?[-–]\s?\d+(?:[,.]\d+)?)?\s?(?:mg\/ml|mg\/min|mg|ml\/h|ml|mmol\/l|mmol|µg|mcg|g|j\.m\.|minut\w*|min|godzin\w*|h|%))/gi, "<mark>$1</mark>");
  return h;
}

function akcje(k) {
  if (k.status === "zweryfikowany") {
    return `<p class="verified" style="margin:0;color:var(--ok);font-weight:600;font-size:.9rem">${ic("ok")} Sprawdzone: ${esc(k.weryfikacja?.kto)}, ${esc(dataPL(k.weryfikacja?.kiedy))}</p>
      <button class="btn btn-secondary btn-block" type="button" data-cofnij>Cofnij zatwierdzenie</button>`;
  }
  const moze = maTresc(k) && kto() && k.status !== "brak-chpl";
  const powod = !kto() ? `Ustaw swoje imię i nazwisko w zakładce <a href="#plik">Publikuj</a>.` : !maTresc(k) ? "Uzupełnij kartę, żeby ją zatwierdzić." : k.status === "brak-chpl" ? "Kart bez ChPL nie zatwierdzamy." : "Zatwierdź dopiero po porównaniu każdego punktu z ChPL.";
  return `<button class="btn btn-primary btn-block" type="button" data-zatwierdz ${moze ? "" : "disabled"}>${ic("ok")}Sprawdziłem z ChPL, zatwierdź</button><p class="hint">${powod}</p>`;
}

function podepnijFormularz(k) {
  const odswiez = () => ekranLek(k.id);
  APP.addEventListener("input", (e) => {
    const t = e.target, d = t.dataset;
    if (d.pole) k[d.pole] = t.value;
    else if (d.linie) k[d.linie] = t.value.split("\n").map((s) => s.trim()).filter(Boolean);
    else if (d.plyn !== undefined) k.plyny[+d.plyn].nazwa = t.value;
    else if (d.uwaga !== undefined) k.uwagi[+d.uwaga].tekst = t.value;
    else return;
    if (d.pole === "status") return; // obsługa w change
    if (zmiana(k)) odswiez();
  }, { once: false });
  APP.addEventListener("change", (e) => {
    const t = e.target, d = t.dataset;
    if (d.pole === "status") { k.status = t.value; k.weryfikacja = null; zapiszKopie(); odswiez(); }
    else if (d.plynOk !== undefined) { k.plyny[+d.plynOk].ok = t.checked; zmiana(k); odswiez(); }
    else if (d.uwagaWazna !== undefined) { k.uwagi[+d.uwagaWazna].wazne = t.checked; zmiana(k); odswiez(); }
  });
  APP.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.widok) { widok = d.widok; return odswiez(); }
    if (d.sekcja) { sekcja = d.sekcja; return odswiez(); }
    if (d.typ) { k.typ = d.typ; zmiana(k); return odswiez(); }
    if (d.dodajPlyn) { k.plyny.push({ nazwa: d.dodajPlyn, ok: true }); zmiana(k); return odswiez(); }
    if (d.usunPlyn !== undefined) { k.plyny.splice(+d.usunPlyn, 1); zmiana(k); return odswiez(); }
    if (d.dodajUwage !== undefined) { k.uwagi.push({ tekst: "", wazne: false }); zmiana(k); odswiez(); const t = APP.querySelectorAll("[data-uwaga]"); t[t.length - 1]?.focus(); return; }
    if (d.usunUwage !== undefined) { k.uwagi.splice(+d.usunUwage, 1); zmiana(k); return odswiez(); }
    if (d.ukryj !== undefined) { k.ukryty = !k.ukryty; zapiszKopie(); toast(k.ukryty ? "Ukryto w aplikacji" : "Lek znów widoczny"); return odswiez(); }
    if (d.usun !== undefined) { potwierdzUsun = true; return odswiez(); }
    if (d.usunAnuluj !== undefined) { potwierdzUsun = false; return odswiez(); }
    if (d.usunTak !== undefined) {
      BAZA.leki = BAZA.leki.filter((x) => x.id !== k.id); potwierdzUsun = false; zapiszKopie();
      toast(`Usunięto: ${k.substancja}`); location.hash = "lista"; return;
    }
    if (d.zatwierdz !== undefined) {
      k.status = "zweryfikowany"; k.weryfikacja = { kto: kto(), kiedy: dzis(), hash: k.zrodlo?.hash || null };
      zapiszKopie(); toast("Zatwierdzono"); return odswiez();
    }
    if (d.cofnij !== undefined) { k.status = "szkic"; k.weryfikacja = null; zapiszKopie(); return odswiez(); }
  });
}

// ---------- ekran: dodaj / zmień produkt ----------
async function ekranSzukajProduktu(trybZmiany) {
  const k = trybZmiany ? karta(trybZmiany) : null;
  zakladki(trybZmiany ? "lista" : "dodaj");
  nowyEkran("shell");
  if (wybranyProdukt && !trybZmiany) return ekranFormularzaNowego();
  APP.innerHTML = `
    ${pasek(trybZmiany ? "Zmień produkt" : "Dodaj lek", { wstecz: trybZmiany ? `#lek-${esc(trybZmiany)}` : "#lista" })}
    <div class="pad stack">
      <p class="small">${trybZmiany ? `Wybierz inny produkt dla: <b>${esc(k.substancja)}</b>. Karta wróci do szkicu.` : "Wyszukaj produkt w Rejestrze Produktów Leczniczych (tylko postacie dożylne i infuzyjne z ChPL)."}</p>
      <div class="search">${ic("szukaj")}<input id="q" type="search" placeholder="Nazwa lub substancja" autocomplete="off" aria-label="Szukaj w rejestrze"></div>
      <div id="wyn"><div class="empty">Wczytuję rejestr…</div></div>
      ${trybZmiany ? "" : `<button class="btn btn-ghost btn-block" type="button" id="bezChpl">Dodaj lek spoza rejestru (bez ChPL)</button>`}
    </div>`;
  const R = await rejestr();
  const naLiscie = new Set(BAZA.leki.map((x) => x.rpl).filter(Boolean));
  const rysuj = () => {
    const t = norm($("#q").value.trim());
    if (t.length < 2) { $("#wyn").innerHTML = `<div class="empty"><b>${R.produkty.length} produktów w indeksie</b>Wpisz co najmniej 2 litery. Rejestr z dnia ${esc(dataPL(R.stan))}.</div>`; return; }
    const hity = R.produkty.filter((p) => norm(`${p.n} ${p.s}`).includes(t)).slice(0, 60);
    $("#wyn").innerHTML = hity.length
      ? `<div class="list">${hity.map((p) => `<button class="row" type="button" data-r="${p.r}">
          <span class="row-main"><span class="row-title">${esc(p.n)}</span><span class="row-sub">${esc(p.m || "")} · ${esc(p.p || "")}</span><span class="row-sub">${esc(p.s || "")} · ${esc(p.f || "")}</span></span>
          <span class="row-aside">${naLiscie.has(p.r) ? '<span class="tag t-ok">Na liście</span>' : ic("plus")}</span></button>`).join("")}</div>`
      : `<div class="empty"><b>Nic nie znaleziono</b>Spróbuj nazwy łacińskiej substancji, np. „metamizol”.</div>`;
  };
  $("#q").addEventListener("input", rysuj);
  $("#q").focus();
  rysuj();
  $("#wyn").addEventListener("click", (e) => {
    const b = e.target.closest("[data-r]");
    if (!b) return;
    const p = R.produkty.find((x) => x.r === +b.dataset.r);
    if (trybZmiany) {
      Object.assign(k, { rpl: p.r, chplWlasny: null, nazwa: p.n, moc: p.m || "", postac: p.p || "", status: "szkic", weryfikacja: null, zamienniki: [] });
      k.zrodlo = { url: CHPL_URL(p.r), pozwolenie: null, podmiot: p.f, hash: null, dataChpl: null, pobrano: R.stan };
      delete ZRODLA[k.id];
      zapiszKopie(); toast("Zmieniono produkt"); location.hash = `lek-${k.id}`;
    } else {
      wybranyProdukt = p; ekranFormularzaNowego();
    }
  });
  $("#bezChpl")?.addEventListener("click", () => { wybranyProdukt = { r: null, n: "", m: "", p: "", s: "", f: "" }; ekranFormularzaNowego(); });
}

function ekranFormularzaNowego() {
  const p = wybranyProdukt;
  const bez = !p.r;
  nowyEkran("shell");
  APP.innerHTML = `
    ${pasek("Nowy lek", { wstecz: "#dodaj" })}
    <div class="pad stack">
      ${bez ? `<div class="notice n-info">${ic("info")}<div>Lek spoza rejestru dostanie status „Brak ChPL” i w aplikacji pokaże tylko ostrzeżenie.</div></div>`
        : `<section class="group"><h3 class="group-title">Wybrany produkt</h3><div class="product"><b>${esc(p.n)}</b><span>${esc(p.m)} · ${esc(p.p)}</span><span>${esc(p.s)} · ${esc(p.f)}</span></div>
           <button class="btn btn-ghost" type="button" id="inny">Wybierz inny</button></section>`}
      <section class="group">
        ${bez ? `<label class="field"><span class="label">Nazwa handlowa</span><input class="input" id="nNazwa" placeholder="np. Trandate"></label>` : ""}
        <label class="field"><span class="label">Nazwa substancji po polsku</span><input class="input" id="nSub" placeholder="np. Metamizol" autocapitalize="sentences"></label>
        <label class="field"><span class="label">Inne nazwy do wyszukiwarki</span><input class="input" id="nAl" placeholder="np. pyralgina"></label>
        <div class="field"><span class="label">Rodzaj</span><div class="segmented" id="nTyp"><button type="button" data-v="lek" aria-pressed="true">Lek</button><button type="button" data-v="plyn" aria-pressed="false">Płyn infuzyjny</button></div></div>
      </section>
      <button class="btn btn-primary btn-block" type="button" id="dodajBtn" disabled>${ic("plus")}Dodaj do listy</button>
    </div>`;
  let typ = "lek";
  const sprawdz = () => ($("#dodajBtn").disabled = !$("#nSub").value.trim() || (bez && !$("#nNazwa").value.trim()));
  APP.addEventListener("input", sprawdz);
  $("#nTyp").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; typ = b.dataset.v; $("#nTyp").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
  $("#inny")?.addEventListener("click", () => { wybranyProdukt = null; ekranSzukajProduktu(null); });
  $("#dodajBtn").addEventListener("click", () => {
    const sub = $("#nSub").value.trim();
    const k = {
      id: noweId(sub), typ, rpl: p.r, chplWlasny: null,
      nazwa: bez ? $("#nNazwa").value.trim() : p.n, substancja: sub, aliasy: $("#nAl").value.trim(),
      moc: p.m || "", postac: p.p || "", opakowanie: "", plyny: [], przygotowanie: [], tempo: [], uwagi: [], punkty: "",
      status: bez ? "brak-chpl" : "szkic", weryfikacja: null, uwagaAdmin: "", ukryty: false,
      zrodlo: { url: p.r ? CHPL_URL(p.r) : null, pozwolenie: null, podmiot: p.f || null, hash: null, dataChpl: null, pobrano: REJESTR?.stan || BAZA.stanBazy },
      zamienniki: [],
    };
    BAZA.leki.push(k); zapiszKopie(); wybranyProdukt = null;
    toast(`Dodano: ${sub}`); location.hash = `lek-${k.id}`;
  });
  $("#nSub").focus();
}

// ---------- ekran: publikacja ----------
async function opublikuj() {
  const t = gh.token.get();
  publikacja = { trwa: true, komunikat: null, blad: null }; ekranPlik();
  try {
    for (let proba = 0; proba < 2; proba++) {
      const { sha, dane: zdalna } = await gh.pobierz(t);
      let doZapisu = BAZA, nadpisane = [];
      if (sha !== baseSha) ({ wynik: doZapisu, nadpisane } = gh.scal(BASE, BAZA, zdalna));
      const opis = gh.podsumuj(zdalna, doZapisu);
      if (!opis.ile) { BASE = zdalna; baseSha = sha; BAZA = structuredClone(zdalna); wyczyscKopie(); publikacja = { trwa: false, komunikat: "Nie było nic do opublikowania.", blad: null }; break; }
      try {
        const nowySha = await gh.zapisz(t, doZapisu, sha, `Panel: ${opis.tekst} (${kto() || "bez podpisu"})`);
        BASE = doZapisu; baseSha = nowySha; BAZA = structuredClone(doZapisu); wyczyscKopie();
        const g = new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        publikacja = { trwa: false, blad: null, komunikat: `Opublikowano o ${g}: ${opis.tekst}. Aplikacja zaktualizuje się w ciągu 1–3 minut.`
          + (nadpisane.length ? ` Uwaga: w międzyczasie ktoś zmienił też: ${nadpisane.join(", ")} – zostały Twoje wersje.` : "") };
        break;
      } catch (e) {
        if (!e.konflikt || proba === 1) throw e; // ktoś zapisał w tej samej sekundzie – spróbuj jeszcze raz
      }
    }
  } catch (e) {
    publikacja = { trwa: false, komunikat: null, blad: e.message };
  }
  ekranPlik();
}

function ekranPlik() {
  zakladki("plik");
  nowyEkran("shell");
  const t = gh.token.get();
  const zm = gh.podsumuj(BASE, BAZA);
  APP.innerHTML = `
    ${pasek("Publikacja")}
    <div class="pad stack">
      <section class="group">
        <h3 class="group-title">Opublikuj zmiany</h3>
        ${publikacja.komunikat ? `<div class="notice n-ok">${ic("ok")}<div>${esc(publikacja.komunikat)} <a href="${gh.linkAkcji}" target="_blank" rel="noopener">Postęp</a></div></div>` : ""}
        ${publikacja.blad ? `<div class="notice n-danger">${ic("uwaga")}<div>${esc(publikacja.blad)}</div></div>` : ""}
        ${brudne ? `<div class="notice n-warn">${ic("uwaga")}<div>Nieopublikowane: ${esc(zm.tekst)}.</div></div>` : (publikacja.komunikat ? "" : `<p class="small">Wszystkie zmiany są opublikowane.</p>`)}
        ${t
          ? `<button class="btn btn-primary btn-block" type="button" id="publikuj" ${brudne && !publikacja.trwa ? "" : "disabled"}>${ic("wgraj")}${publikacja.trwa ? "Publikuję…" : "Opublikuj"}</button>
             <p class="hint">Zmiany trafią do repozytorium z Twoim podpisem. <a href="${gh.linkHistorii}" target="_blank" rel="noopener">Historia zmian</a></p>`
          : `<p class="hint">Żeby publikować, połącz panel z GitHubem poniżej.</p>`}
      </section>

      <section class="group">
        <h3 class="group-title">Kto sprawdza karty</h3>
        <label class="field"><span class="label">Imię i nazwisko (zapisywane przy zatwierdzeniu i publikacji)</span><input class="input" id="kto" value="${esc(kto())}" autocomplete="name"></label>
      </section>

      <section class="group">
        <h3 class="group-title">Połączenie z GitHubem</h3>
        ${t
          ? `${polaczenie.blad ? `<div class="notice n-danger">${ic("uwaga")}<div>${esc(polaczenie.blad)}</div></div>` : `<div class="notice n-ok">${ic("ok")}<div>Połączono z repozytorium ${esc(gh.linkAkcji.split("/").slice(3, 5).join("/"))}.</div></div>`}
             <button class="btn btn-ghost btn-block" type="button" id="odlacz">Odłącz ten telefon / komputer</button>`
          : `<label class="field"><span class="label">Klucz dostępu (token)</span><input class="input" id="token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
             <button class="btn btn-primary btn-block" type="button" id="polacz">Połącz</button>
             <details class="more"><summary>Jak zdobyć klucz</summary><ul>
               <li>Zaloguj się na GitHub (musisz mieć dostęp do repozytorium).</li>
               <li>Wejdź na github.com/settings/personal-access-tokens/new.</li>
               <li>Repository access: <b>Only select repositories</b> → wlew.</li>
               <li>Permissions → Contents: <b>Read and write</b>.</li>
               <li>Expiration: np. 90 dni. Skopiuj klucz i wklej go tutaj.</li>
             </ul><p class="small" style="margin-top:8px">Klucz zostaje tylko w tej przeglądarce. Nie łącz panelu na cudzym komputerze.</p></details>`}
      </section>

      <section class="group">
        <h3 class="group-title">Kopia zapasowa</h3>
        <button class="btn btn-secondary btn-block" type="button" id="eksport">${ic("pobierz")}Pobierz leki.json</button>
        <label class="btn btn-secondary btn-block" for="import">${ic("wgraj")}Wczytaj leki.json z urządzenia</label>
        <input type="file" id="import" accept=".json,application/json" hidden>
        ${potwierdzOdrzuc
          ? `<div class="confirm"><b>Odrzucić wszystkie nieopublikowane zmiany?</b><span>Wrócisz do ostatniej opublikowanej wersji. Tego nie da się cofnąć.</span>
             <div class="btns"><button class="btn btn-secondary" type="button" id="odrzucNie">Anuluj</button><button class="btn btn-danger" type="button" id="odrzucTak">Odrzuć</button></div></div>`
          : `<button class="btn btn-danger btn-block" type="button" id="odrzuc" ${brudne ? "" : "disabled"}>Odrzuć nieopublikowane zmiany</button>`}
      </section>
      <p class="small">Baza z dnia ${esc(dataPL(BAZA.stanBazy))} · leków na liście: ${BAZA.leki.length}</p>
    </div>`;
  $("#kto").addEventListener("input", (e) => ls.set(LS.kto, e.target.value.trim()));
  $("#publikuj")?.addEventListener("click", opublikuj);
  $("#polacz")?.addEventListener("click", async () => {
    const v = $("#token").value.trim();
    if (!v) return;
    $("#polacz").disabled = true; $("#polacz").textContent = "Sprawdzam…";
    try {
      await gh.sprawdz(v);
      gh.token.set(v); polaczenie = { ok: true, blad: null };
      if (!brudne) { const r = await gh.pobierz(v); BASE = r.dane; baseSha = r.sha; BAZA = structuredClone(r.dane); }
      toast("Połączono z GitHubem");
    } catch (e) { polaczenie = { ok: false, blad: null }; toast(e.message); }
    ekranPlik();
  });
  $("#odlacz")?.addEventListener("click", () => { gh.token.set(""); polaczenie = { ok: false, blad: null }; toast("Odłączono"); ekranPlik(); });
  $("#eksport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(BAZA, (key, v) => (key.startsWith("_") ? undefined : v), 1)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "leki.json" });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast("Pobrano leki.json");
  });
  $("#import").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.leki)) throw new Error("to nie jest plik z lekami");
      BAZA = d; zapiszKopie(); toast(`Wczytano ${d.leki.length} leków`); ekranPlik();
    } catch (err) { toast("Nie udało się wczytać: " + err.message); }
    e.target.value = "";
  });
  $("#odrzuc")?.addEventListener("click", () => { potwierdzOdrzuc = true; ekranPlik(); });
  $("#odrzucNie")?.addEventListener("click", () => { potwierdzOdrzuc = false; ekranPlik(); });
  $("#odrzucTak")?.addEventListener("click", () => {
    BAZA = structuredClone(BASE); wyczyscKopie(); potwierdzOdrzuc = false; toast("Przywrócono opublikowaną wersję"); ekranPlik();
  });
}

// ---------- trasy ----------
function trasa() {
  const h = location.hash.slice(1);
  potwierdzUsun = h.startsWith("lek-") ? potwierdzUsun : false;
  if (h.startsWith("lek-")) ekranLek(h.slice(4));
  else if (h.startsWith("zmien-")) ekranSzukajProduktu(h.slice(6));
  else if (h === "dodaj") ekranSzukajProduktu(null);
  else if (h === "plik") ekranPlik();
  else ekranLista();
  window.scrollTo(0, 0);
}

document.querySelector(".tabbar").addEventListener("click", (e) => {
  const t = e.target.closest(".tab"); if (!t) return;
  if (t.dataset.tab === "dodaj") wybranyProdukt = null;
  location.hash = t.dataset.tab;
});
window.addEventListener("hashchange", trasa);
trasa();
