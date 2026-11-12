"""Pobiera dane z Rejestru Produktów Leczniczych i ChPL dla leków z tools/lista.py.

Użycie (z katalogu projektu):
    .venv/bin/python tools/pobierz.py            # używa pobranych wcześniej plików
    .venv/bin/python tools/pobierz.py --odswiez  # pobiera rejestr i wszystkie ChPL od nowa

Wynik:
    app/data/zrodla.json – metadane produktu, wycięte punkty ChPL (4.2, 6.2, 6.3, 6.6), hash PDF
    app/data/leki.json   – karty leków (lista zarządzana w panelu admina); treści są zachowane,
                           metadane odświeżane z rejestru. Jeśli ChPL zmieniła się od weryfikacji,
                           karta dostaje status "do-ponownej-weryfikacji".
    app/data/rejestr-iv.json – indeks produktów dożylnych do wyszukiwarki w panelu admina
"""
import datetime as dt
import hashlib
import io
import json
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import logging

from pypdf import PdfReader

logging.getLogger("pypdf").setLevel(logging.ERROR)  # część PDF z rejestru ma śmieci przed nagłówkiem – czytają się poprawnie

sys.path.insert(0, str(Path(__file__).parent))
from lista import LISTA, EMA_METALYSE  # noqa: E402
from szkice import SZKICE  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
RPL_XML = CACHE / "rpl.xml"
RPL_URL = "https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/overall.xml"
CHPL_URL = "https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/{}/characteristic"
OUT = ROOT / "app" / "data"
NS = {"r": "http://rejestry.ezdrowie.gov.pl/rpl/eksport-danych-v6.0.0"}
SEKCJE = ["4.2", "6.2", "6.3", "6.6"]
UA = {"User-Agent": "wlew-data-script/0.1"}


def pobierz_plik(url, cel):
    # curl zamiast urllib: działa z systemowymi certyfikatami na macOS
    cel.parent.mkdir(parents=True, exist_ok=True)
    tmp = cel.with_suffix(cel.suffix + ".part")
    subprocess.run(["curl", "-sSfL", "--max-time", "180", "-A", UA["User-Agent"], "-o", str(tmp), url], check=True)
    tmp.replace(cel)


def wczytaj_rejestr():
    root = ET.parse(RPL_XML).getroot()
    stan = root.get("stanNaDzien")
    po_id, po_substancji = {}, {}
    for p in root.findall("r:produktLeczniczy", NS):
        if p.get("rodzajPreparatu") != "ludzki" or not p.get("charakterystyka"):
            continue
        rid = int(p.get("charakterystyka").rstrip("/").split("/")[-2])
        drogi = [d.get("drogaPodaniaNazwa") or "" for d in p.findall(".//r:drogaPodania", NS)]
        meta = dict(
            rpl=rid,
            nazwa=p.get("nazwaProduktu"),
            substancjaLac=p.get("nazwaPowszechnieStosowana"),
            moc=p.get("moc"),
            postac=p.get("nazwaPostaciFarmaceutycznej"),
            podmiot=p.get("podmiotOdpowiedzialny"),
            pozwolenie=p.get("numerPozwolenia"),
            drogi=drogi,
            chplUrl=p.get("charakterystyka"),
        )
        po_id[rid] = meta
        if any("żyl" in d for d in drogi):
            po_substancji.setdefault(meta["substancjaLac"], []).append(meta)
    return stan, po_id, po_substancji


NAGLOWEK = re.compile(r"^\s*(\d{1,2}\.\d{1,2})\.?\s+[A-ZŻŹĆŁŚÓĄĘŃa-zżźćłśóąęń]")
NAGLOWEK_GLOWNY = re.compile(r"^\s*(\d{1,2})\.\s+[A-ZŻŹĆŁŚÓĄĘŃ]{3,}")
DATA = re.compile(
    r"\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[a-ząćęłńóśźż]+\s+\d{4}|\d{2}[./]\d{4}|[a-ząćęłńóśźż]{4,}\s+\d{4}",
    re.I,
)


def tekst_pdf(sciezka):
    dane = sciezka.read_bytes()
    poczatek = dane.find(b"%PDF")  # część plików z rejestru ma metadane XMP przed nagłówkiem PDF
    if poczatek > 0:
        dane = dane[poczatek:]
    tekst = "\n".join((s.extract_text() or "") for s in PdfReader(io.BytesIO(dane)).pages)
    linie = []
    for l in tekst.splitlines():
        l = re.sub(r"[ \t]+", " ", l).rstrip()
        if re.fullmatch(r"\s*\d{1,3}\s*", l) or re.fullmatch(r"\s*\d{1,3}\s+CMDh\s*", l):
            continue  # numery stron
        linie.append(l)
    return linie


def wytnij_sekcje(linie):
    naglowki = []
    for i, l in enumerate(linie):
        m = NAGLOWEK.match(l)
        if m:
            naglowki.append((i, m.group(1)))
            continue
        m = NAGLOWEK_GLOWNY.match(l)
        if m:
            naglowki.append((i, m.group(1)))
    wynik = {}
    for cel in SEKCJE:
        start = next((i for i, n in naglowki if n == cel), None)
        if start is None:
            continue
        koniec = next((i for i, n in naglowki if i > start and n != cel), len(linie))
        wynik[cel] = "\n".join(linie[start:koniec]).strip()
    # data zatwierdzenia ChPL (punkt 10)
    data_chpl = None
    for i, l in enumerate(linie):
        if re.match(r"^\s*10\.\s*DATA", l, re.I):
            okno = " ".join(linie[i : i + 6])
            m = DATA.search(okno.split("PRODUKTU LECZNICZEGO", 1)[-1])
            if m:
                data_chpl = m.group(0)
            break
    return wynik, data_chpl


def zamienniki(meta, po_substancji):
    wynik, widziane = [], set()
    for z in po_substancji.get(meta["substancjaLac"], []):
        klucz = (z["nazwa"], z["moc"])
        if z["rpl"] == meta["rpl"] or klucz in widziane:
            continue
        widziane.add(klucz)
        wynik.append(dict(nazwa=z["nazwa"], moc=z["moc"], postac=z["postac"], chplUrl=z["chplUrl"]))
    return wynik[:15]


def karta_z_listy(poz):
    """Nowa karta z początkowej listy (tools/lista.py) – używane tylko, gdy nie ma jeszcze leki.json."""
    k = dict(
        id=poz["id"],
        typ=poz.get("typ", "lek"),
        rpl=poz.get("rpl"),
        chplWlasny=EMA_METALYSE if poz.get("status") == "ema" else None,
        nazwa=poz["marcin"],
        substancja=poz["subst"],
        aliasy=poz.get("aliasy", ""),
        moc="",
        postac="",
        opakowanie="",
        plyny=[],
        przygotowanie=[],
        tempo=[],
        uwagi=[],
        punkty="",
        status=poz["status"] if poz.get("status") in ("brak-chpl", "nie-iv") else "szkic",
        weryfikacja=None,
        uwagaAdmin=poz.get("uwaga") or "",
        ukryty=False,
    )
    k.update(SZKICE.get(poz["id"], {}))
    return k


def indeks_rejestru(po_id):
    """Lekki indeks produktów dożylnych/infuzyjnych do wyszukiwarki w panelu admina."""
    wynik = []
    for m in po_id.values():
        if any("żyl" in d for d in m["drogi"]) or "infuz" in (m["postac"] or "").lower():
            wynik.append(dict(r=m["rpl"], n=m["nazwa"], s=m["substancjaLac"], m=m["moc"], p=m["postac"], f=m["podmiot"]))
    return sorted(wynik, key=lambda x: (x["n"] or "").lower())


def main():
    odswiez = "--odswiez" in sys.argv
    if odswiez or not RPL_XML.exists():
        print("Pobieram rejestr…")
        pobierz_plik(RPL_URL, RPL_XML)
    stan, po_id, po_substancji = wczytaj_rejestr()
    print(f"Rejestr: stan na {stan}, produktów z ChPL: {len(po_id)}")

    # Źródłem listy jest app/data/leki.json (zarządzany w panelu admina).
    # tools/lista.py służy tylko do pierwszego wygenerowania pliku.
    leki_plik = OUT / "leki.json"
    if leki_plik.exists():
        karty = json.loads(leki_plik.read_text("utf-8"))["leki"]
        z_listy = {p["id"]: p for p in LISTA}
        for k in karty:  # migracja starszego formatu
            if "rpl" not in k:
                k["rpl"] = z_listy.get(k["id"], {}).get("rpl")
                k["chplWlasny"] = EMA_METALYSE if z_listy.get(k["id"], {}).get("status") == "ema" else None
            k.setdefault("uwagaAdmin", z_listy.get(k["id"], {}).get("uwaga") or "")
            k.setdefault("ukryty", False)
    else:
        karty = [karta_z_listy(p) for p in LISTA]

    stare_zrodla = {}
    if (OUT / "zrodla.json").exists():
        stare_zrodla = json.loads((OUT / "zrodla.json").read_text("utf-8"))
    bledy = []
    zrodla = {}
    for karta in karty:
        meta = po_id.get(karta.get("rpl")) if karta.get("rpl") else None
        url = meta["chplUrl"] if meta else karta.get("chplWlasny")
        if karta.get("rpl") and not meta:
            print(f"  ! {karta['id']}: produktu {karta['rpl']} nie ma już w rejestrze")
        wpis = dict(meta=meta, chplUrl=url, sekcje={}, hash=None, dataChpl=None, zamienniki=[])
        if url:
            pdf = CACHE / "chpl" / (f"{karta['rpl']}.pdf" if meta else f"{karta['id']}.pdf")
            if odswiez or not pdf.exists():
                pobierz_plik(url, pdf)
                time.sleep(0.3)
            wpis["hash"] = hashlib.sha256(pdf.read_bytes()).hexdigest()[:16]
            try:
                wpis["sekcje"], wpis["dataChpl"] = wytnij_sekcje(tekst_pdf(pdf))
            except Exception as e:  # jeden uszkodzony PDF nie może zatrzymać całej aktualizacji
                stary = stare_zrodla.get(karta["id"]) or {}
                wpis["sekcje"], wpis["dataChpl"] = stary.get("sekcje", {}), stary.get("dataChpl")
                bledy.append(f"{karta['id']}: {e}")
                print(f"  ! {karta['id']}: nie udało się odczytać PDF ({e}) – zostają poprzednie fragmenty")
            if meta:
                wpis["zamienniki"] = zamienniki(meta, po_substancji)
        brak = [s for s in SEKCJE if s not in wpis["sekcje"]]
        print(f"  {karta['id']:<26} {'ok' if url else '--'}  sekcje: {','.join(wpis['sekcje']) or '-'}"
              + (f"  (brak {','.join(brak)})" if url and brak else ""))
        zrodla[karta["id"]] = wpis

        # metadane zawsze z rejestru
        if meta:
            karta["nazwa"], karta["moc"], karta["postac"] = meta["nazwa"], meta["moc"], meta["postac"]
        karta["zrodlo"] = dict(
            url=url,
            pozwolenie=(meta or {}).get("pozwolenie"),
            podmiot=(meta or {}).get("podmiot"),
            hash=wpis["hash"],
            dataChpl=wpis["dataChpl"],
            pobrano=stan,
        )
        karta["zamienniki"] = [f"{z['nazwa']} {z['moc']}" for z in wpis["zamienniki"]]
        wer = karta.get("weryfikacja")
        if wer and not wer.get("hash") and wpis["hash"]:
            wer["hash"] = wpis["hash"]  # lek dodany w panelu i sprawdzony przed pierwszym pobraniem ChPL
        if karta["status"] == "zweryfikowany" and wer and wer.get("hash") != wpis["hash"]:
            karta["status"] = "do-ponownej-weryfikacji"
            print(f"    -> ChPL zmieniła się od weryfikacji: {karta['id']}")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "zrodla.json").write_text(json.dumps(zrodla, ensure_ascii=False, indent=1), "utf-8")
    (OUT / "rejestr-iv.json").write_text(
        json.dumps(dict(stan=stan, produkty=indeks_rejestru(po_id)), ensure_ascii=False, separators=(",", ":")), "utf-8"
    )
    leki_plik.write_text(
        json.dumps(dict(stanBazy=stan, wygenerowano=dt.date.today().isoformat(), leki=karty), ensure_ascii=False, indent=1),
        "utf-8",
    )
    print(f"Zapisano {len(karty)} kart → {leki_plik.relative_to(ROOT)}")
    if bledy:
        print(f"Uwaga: {len(bledy)} PDF nie dało się odczytać:\n  " + "\n  ".join(bledy))


if __name__ == "__main__":
    main()
