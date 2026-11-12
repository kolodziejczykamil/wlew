"""Zarządzanie kontami do panelu admina (zmienna USERS w Cloudflare Pages).

Użycie:
    python3 tools/konta.py dodaj marcin "Marcin Nowak"   # pyta o hasło, dopisuje konto
    python3 tools/konta.py usun marcin
    python3 tools/konta.py lista
    python3 tools/konta.py sekret                        # losowy SESSION_SECRET

Konta trzymane są lokalnie w tools/.konta.json (poza repozytorium – patrz .gitignore).
Po każdej zmianie skrypt wypisuje wartość do wklejenia w Cloudflare:
    Pages → projekt → Settings → Variables and Secrets → USERS (typ: Secret) → Save,
a potem Deployments → ostatnie wdrożenie → Retry deployment (żeby zmiana zadziałała).
Hasła zapisywane są jako PBKDF2-SHA256 – samego hasła nie da się z tego odczytać.
"""
import base64
import getpass
import hashlib
import json
import os
import secrets
import sys
from pathlib import Path

PLIK = Path(__file__).resolve().parent / ".konta.json"
ITERACJE = 100_000  # maksimum obsługiwane przez Web Crypto w Cloudflare Workers


def hash_hasla(haslo: str) -> str:
    sol = os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", haslo.encode("utf-8"), sol, ITERACJE)
    return f"pbkdf2${ITERACJE}${base64.b64encode(sol).decode()}${base64.b64encode(h).decode()}"


def wczytaj():
    return json.loads(PLIK.read_text("utf-8")) if PLIK.exists() else []


def zapisz(konta):
    PLIK.write_text(json.dumps(konta, ensure_ascii=False, indent=1), "utf-8")
    print("\nWartość zmiennej USERS (skopiuj całą linię):\n")
    print(json.dumps(konta, ensure_ascii=False, separators=(",", ":")))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    konta = wczytaj()
    if cmd == "dodaj" and len(sys.argv) >= 4:
        login, imie = sys.argv[2].strip().lower(), sys.argv[3].strip()
        haslo = getpass.getpass(f"Hasło dla {login} (min. 10 znaków): ")
        if len(haslo) < 10:
            sys.exit("Hasło jest za krótkie.")
        if haslo != getpass.getpass("Powtórz hasło: "):
            sys.exit("Hasła się różnią.")
        konta = [k for k in konta if k["login"] != login] + [dict(login=login, imie=imie, haslo=hash_hasla(haslo))]
        zapisz(konta)
    elif cmd == "usun" and len(sys.argv) >= 3:
        konta = [k for k in konta if k["login"] != sys.argv[2].strip().lower()]
        zapisz(konta)
    elif cmd == "lista":
        for k in konta:
            print(f"{k['login']:<16} {k['imie']}")
    elif cmd == "sekret":
        print(secrets.token_urlsafe(48))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
