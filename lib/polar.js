// Kody dostępu z Polar.sh (publiczne endpointy portalu klienta – nie wymagają klucza API).
// POLAR_ORG_ID – id organizacji w Polar, POLAR_BENEFIT_ID – id korzyści „klucz licencyjny” (opcjonalnie, zalecane),
// POLAR_API – adres API (domyślnie produkcja; do testów https://sandbox-api.polar.sh).

const api = (env) => (env.POLAR_API || "https://api.polar.sh").replace(/\/$/, "");

async function wyslij(env, sciezka, dane) {
  let r;
  try {
    r = await fetch(`${api(env)}/v1/customer-portal/license-keys/${sciezka}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "wlew" },
      body: JSON.stringify({ organization_id: env.POLAR_ORG_ID, ...dane }),
    });
  } catch {
    return { ok: false, status: 0, d: null };
  }
  let d = null;
  try { d = await r.json(); } catch { /* pusta odpowiedź */ }
  return { ok: r.ok, status: r.status, d };
}

const czytelnyBlad = (status, d) => {
  const opis = typeof d?.detail === "string" ? d.detail.toLowerCase() : "";
  if (status === 0) return "Nie udało się połączyć z systemem płatności. Spróbuj za chwilę.";
  if (opis.includes("limit")) return "Ten kod jest już używany na maksymalnej liczbie urządzeń. Usuń go z innego urządzenia w zakładce Info albo napisz do nas.";
  if (status === 404) return "Nie znaleziono takiego kodu. Sprawdź, czy został wpisany dokładnie tak jak w mailu.";
  if (status === 403) return "Ten kod nie jest już aktywny (np. subskrypcja wygasła albo została anulowana).";
  return "Nie udało się sprawdzić kodu. Spróbuj ponownie za chwilę.";
};

/** Sprawdza, czy klucz jest aktywny i należy do naszego produktu. */
function kluczOk(env, k) {
  if (!k) return false;
  if (k.status !== "granted") return false;
  if (env.POLAR_BENEFIT_ID && k.benefit_id !== env.POLAR_BENEFIT_ID) return false;
  if (k.expires_at && new Date(k.expires_at) < new Date()) return false;
  return true;
}

/** Aktywacja kodu na urządzeniu → {aktywacja} albo {blad}. */
export async function aktywuj(env, kod, etykieta) {
  const a = await wyslij(env, "activate", { key: kod, label: etykieta });
  if (!a.ok || !a.d?.id) return { blad: czytelnyBlad(a.status, a.d) };
  const s = await sprawdz(env, kod, a.d.id);
  if (!s.ok) {
    await dezaktywuj(env, kod, a.d.id); // nie zostawiaj zajętego miejsca po nieudanej weryfikacji
    return { blad: s.blad };
  }
  return { aktywacja: a.d.id };
}

/** Walidacja kodu z aktywacją → {ok:true} albo {ok:false, blad, odebrany}. */
export async function sprawdz(env, kod, aktywacja) {
  const v = await wyslij(env, "validate", { key: kod, activation_id: aktywacja });
  if (v.status === 0) return { ok: false, blad: czytelnyBlad(0), siec: true };
  if (!v.ok) return { ok: false, blad: czytelnyBlad(v.status, v.d), odebrany: true };
  if (!kluczOk(env, v.d)) return { ok: false, blad: "Ten kod nie jest już aktywny (np. subskrypcja wygasła albo została anulowana).", odebrany: true };
  return { ok: true };
}

export async function dezaktywuj(env, kod, aktywacja) {
  const d = await wyslij(env, "deactivate", { key: kod, activation_id: aktywacja });
  return d.ok || d.status === 404;
}
