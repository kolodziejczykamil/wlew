// Wspólny widok karty leku – aplikacja i podgląd w panelu admina.
import { CONFIG } from "./config.js";
import { ic } from "./ikony.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const norm = (s) =>
  String(s ?? "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");

export const dataPL = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join(".") : iso || "");

export function rodzinaPlynu(nazwa) {
  const n = norm(nazwa);
  if (n.includes("nacl") || n.includes("chlorek sodu") || n.includes("sol fizj")) return "nacl";
  if (n.includes("gluk") || /^g\d/.test(n)) return "glu";
  if (n.includes("ringer") || n.includes("pwe") || n.includes("wieloelektrolit") || n.includes("hartmann")) return "ringer";
  return "inny";
}

export const STATUSY = {
  szkic: { etykieta: "Szkic", klasa: "t-szkic" },
  zweryfikowany: { etykieta: "Sprawdzone", klasa: "t-ok" },
  "do-ponownej-weryfikacji": { etykieta: "Zmiana ChPL", klasa: "t-zmiana" },
  "nie-iv": { etykieta: "Nie iv", klasa: "t-nieiv" },
  "brak-chpl": { etykieta: "Brak ChPL", klasa: "t-brak" },
};

export const maTresc = (k) => (k.plyny?.length || k.przygotowanie?.length || k.tempo?.length || k.uwagi?.length) > 0;

/** Czy treść karty może być pokazana użytkownikowi aplikacji. */
export function widoczna(k, { podglad = false } = {}) {
  if (podglad || k.status === "zweryfikowany") return true;
  if (k.status === "szkic" || k.status === "do-ponownej-weryfikacji") return CONFIG.pokazSzkice;
  return true;
}

export const kropki = (k) =>
  `<span class="dots">${(k.plyny || []).filter((p) => p.ok !== false).slice(0, 4).map((p) => `<i class="dot d-${rodzinaPlynu(p.nazwa)}"></i>`).join("")}</span>`;

export const plyn = (p) =>
  `<span class="fluid ${p.ok === false ? "f-no" : "f-" + rodzinaPlynu(p.nazwa)}"><i></i>${esc(p.nazwa)}</span>`;

function komunikat(k) {
  const m = {
    szkic: ["n-warn", "uwaga", "<b>Szkic, niesprawdzony przez medyka.</b> Przed podaniem sprawdź w ChPL."],
    "do-ponownej-weryfikacji": ["n-warn", "uwaga", "<b>ChPL zmieniła się od ostatniego sprawdzenia.</b> Dane mogą być nieaktualne."],
    "nie-iv": ["n-danger", "uwaga", "<b>Wg ChPL ten produkt nie jest przeznaczony do podania dożylnego.</b>"],
    "brak-chpl": ["n-info", "info", "<b>Brak polskiej ChPL w Rejestrze Produktów Leczniczych.</b> Lek prawdopodobnie sprowadzany w imporcie docelowym. Korzystaj z ulotki z opakowania."],
  }[k.status];
  return m ? `<div class="notice ${m[0]}">${ic(m[1])}<div>${m[2]}</div></div>` : "";
}

const kroki = (arr) => `<ul class="steps">${(arr || []).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;

export function renderKarta(k, { podglad = false } = {}) {
  const z = k.zrodlo || {};
  const pokaz = widoczna(k, { podglad }) && maTresc(k);
  const meta = [k.moc, k.postac, k.opakowanie].filter(Boolean).map(esc).join(" · ");
  const krytyczne = (k.uwagi || []).filter((u) => u.wazne && u.tekst);
  const zwykle = (k.uwagi || []).filter((u) => !u.wazne && u.tekst);
  const ok = (k.plyny || []).filter((p) => p.ok !== false);
  const nie = (k.plyny || []).filter((p) => p.ok === false);

  let tresc = "";
  if (pokaz) {
    tresc = `
      ${krytyczne.map((u) => `<div class="notice n-critical">${ic("uwaga")}<div>${esc(u.tekst)}</div></div>`).join("")}
      ${k.plyny?.length || k.przygotowanie?.length ? `<section class="group">
        <h3 class="group-title">Rozcieńczanie</h3>
        ${ok.length ? `<div class="fluids">${ok.map(plyn).join("")}</div>` : ""}
        ${nie.length ? `<div class="fluids">${nie.map(plyn).join("")}</div>` : ""}
        ${k.przygotowanie?.length ? kroki(k.przygotowanie) : ""}
      </section>` : ""}
      ${k.tempo?.length ? `<section class="group"><h3 class="group-title">Podanie</h3>${kroki(k.tempo)}</section>` : ""}
      ${zwykle.length ? `<section class="group"><h3 class="group-title">Uwagi</h3>${zwykle.map((u) => `<div class="note">${esc(u.tekst)}</div>`).join("")}</section>` : ""}`;
  } else if (k.status !== "nie-iv" && k.status !== "brak-chpl") {
    tresc = `<div class="group"><p class="small">Karta w przygotowaniu. Do tego czasu korzystaj z ChPL.</p></div>`;
  }

  const wer = k.weryfikacja;
  const zrodloTxt = z.url
    ? `ChPL ${esc(k.nazwa)}${k.punkty ? `, pkt ${esc(k.punkty)}` : ""}${z.pozwolenie ? `. Pozwolenie nr ${esc(z.pozwolenie)}` : ""}${z.podmiot ? `, ${esc(z.podmiot)}` : ""}.${z.dataChpl ? ` Wersja ChPL: ${esc(z.dataChpl)}.` : ""} Rejestr z dnia ${esc(dataPL(z.pobrano))}.`
    : `Brak dokumentu źródłowego w rejestrze (stan z dnia ${esc(dataPL(z.pobrano))}).`;

  return `
    <header class="hero">
      <div class="eyebrow">${esc(k.substancja)}</div>
      <h2 class="h1">${esc(k.nazwa)}</h2>
      ${meta ? `<div class="meta">${meta}</div>` : ""}
    </header>
    ${komunikat(k)}
    ${tresc}
    <section class="group source">
      <h3 class="group-title">Źródło</h3>
      <p>${zrodloTxt}</p>
      ${wer ? `<p class="verified">${ic("ok")} Sprawdzone z ChPL: ${esc(wer.kto)}, ${esc(dataPL(wer.kiedy))}</p>` : ""}
      ${z.url ? `<a class="btn btn-secondary btn-block" href="${esc(z.url)}" target="_blank" rel="noopener">${ic("dokument")}Otwórz ChPL (PDF)</a>` : ""}
    </section>
    ${k.zamienniki?.length ? `<section class="group"><details class="more"><summary>Inne produkty z tą substancją (${k.zamienniki.length})</summary><ul>${k.zamienniki.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="small" style="margin-top:8px">Ich ChPL mogą się różnić. Karta dotyczy produktu ${esc(k.nazwa)}.</p></details></section>` : ""}`;
}
