// Zarządzanie kodami dostępu z panelu (tylko zalogowani).
// GET  /api/dostepy → {platnosci, osoby: [...]}  (bez skrótów kodów)
// POST /api/dostepy {akcja: "dodaj"|"zmien"|"nowy-kod"|"usun", ...}
import { platnosciWlaczone } from "../../lib/dostep.js";
import { nowyKod, skrotKodu, wczytajDostepy, zapiszDostepy } from "../../lib/kody.js";
import { json, uzytkownik, zPanelu } from "../../lib/sesja.js";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const dzis = () => new Date().toISOString().slice(0, 10);
const tekst = (v, max) => String(v ?? "").trim().slice(0, max);
const publiczne = (o) => { const { skrot, ...reszta } = o; return reszta; };

export async function onRequestGet({ request, env }) {
  if (!(await uzytkownik(request, env))) return json({ blad: "Zaloguj się ponownie." }, 401);
  try {
    const { dane } = await wczytajDostepy(env, { swieze: true });
    return json({ platnosci: platnosciWlaczone(env), osoby: dane.osoby.map(publiczne) });
  } catch (e) {
    return json({ blad: e.message }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  const u = await uzytkownik(request, env);
  if (!u) return json({ blad: "Sesja wygasła. Zaloguj się ponownie." }, 401);
  if (!zPanelu(request)) return json({ blad: "Niedozwolone zapytanie." }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ blad: "Nieprawidłowe dane." }, 400); }

  // do 3 prób na wypadek równoczesnej zmiany przez inną osobę
  for (let proba = 0; proba < 3; proba++) {
    const { sha, dane } = await wczytajDostepy(env, { swieze: true });
    const osoby = dane.osoby;
    let wynik = {}, opis;

    if (d.akcja === "dodaj") {
      const nazwa = tekst(d.opis, 80);
      if (!nazwa) return json({ blad: "Wpisz, dla kogo jest dostęp (np. imię i nazwisko)." }, 400);
      if (!DATA.test(d.wazneDo || "")) return json({ blad: "Wybierz, do kiedy ma działać dostęp." }, 400);
      const kod = nowyKod();
      const osoba = {
        id: crypto.randomUUID().slice(0, 8), opis: nazwa, notatka: tekst(d.notatka, 200),
        wazneDo: d.wazneDo, aktywny: true, skrot: await skrotKodu(kod), koncowka: kod.slice(-4),
        dodal: u.imie, dodano: dzis(), zmieniono: dzis(),
      };
      osoby.push(osoba);
      wynik = { osoba: publiczne(osoba), kod };
      opis = `dodano dostęp #${osoba.id}`;
    } else {
      const o = osoby.find((x) => x.id === d.id);
      if (!o) return json({ blad: "Nie ma już takiej osoby na liście – odśwież stronę." }, 404);
      if (d.akcja === "zmien") {
        if (d.opis !== undefined) { const n = tekst(d.opis, 80); if (!n) return json({ blad: "Opis nie może być pusty." }, 400); o.opis = n; }
        if (d.notatka !== undefined) o.notatka = tekst(d.notatka, 200);
        if (d.wazneDo !== undefined) { if (!DATA.test(d.wazneDo)) return json({ blad: "Nieprawidłowa data." }, 400); o.wazneDo = d.wazneDo; }
        if (d.aktywny !== undefined) o.aktywny = !!d.aktywny;
        o.zmieniono = dzis(); o.zmienil = u.imie;
        wynik = { osoba: publiczne(o) };
        opis = `zmieniono dostęp #${o.id}`;
      } else if (d.akcja === "nowy-kod") {
        const kod = nowyKod();
        o.skrot = await skrotKodu(kod); o.koncowka = kod.slice(-4); o.zmieniono = dzis(); o.zmienil = u.imie;
        wynik = { osoba: publiczne(o), kod };
        opis = `nowy kod dla dostępu #${o.id}`;
      } else if (d.akcja === "usun") {
        dane.osoby = osoby.filter((x) => x.id !== o.id);
        wynik = { usunieto: o.id };
        opis = `usunięto dostęp #${o.id}`;
      } else {
        return json({ blad: "Nieznana akcja." }, 400);
      }
    }

    try {
      // w historii repozytorium tylko id – bez imion i nazwisk
      const w = await zapiszDostepy(env, dane, sha, `Dostępy: ${opis} (${u.imie})`, u.imie);
      if (w.konflikt) continue;
      return json({ ok: true, ...wynik });
    } catch (e) {
      return json({ blad: e.message }, 502);
    }
  }
  return json({ blad: "Ktoś zmieniał listę w tym samym momencie. Spróbuj jeszcze raz." }, 409);
}
