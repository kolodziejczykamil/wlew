"""Podgląd kluczowych fragmentów ChPL dla wskazanych leków (do przygotowania szkiców kart).
Użycie: .venv/bin/python tools/podglad.py kcl paracetamol ..."""
import json, re, sys
from pathlib import Path
Z = json.loads((Path(__file__).resolve().parent.parent / "app/data/zrodla.json").read_text("utf-8"))
KLUCZ = re.compile(r"rozcie|rozpu|ml|min|infuz|wlew|wstrzyk|glukoz|chlork|ringer|niezgod|nie należy|wyłącznie|stężen|szybko|powoli", re.I)
for k in sys.argv[1:]:
    s = Z[k]["sekcje"]; m = Z[k]["meta"] or {}
    print(f"\n######## {k} | {m.get('nazwa')} {m.get('moc')} | {m.get('postac')}")
    akapity = re.split(r"\n\s*\n", s.get("4.2", ""))
    sp = [a for a in akapity if re.search(r"sposób podawania|podanie|infuz|wlew|rozcie|wstrzyk", a, re.I) and KLUCZ.search(a)]
    print("[4.2]", "\n".join(re.sub(r"\s*\n\s*", " ", a) for a in sp)[:2200])
    for n in ("6.2", "6.3", "6.6"):
        print(f"[{n}]", re.sub(r"\s*\n\s*", " ", s.get(n, ""))[:1200])
