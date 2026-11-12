// Ustawienia aplikacji – zmieniane przed wydaniem wersji.
export const CONFIG = {
  // true na czas testów w grupie SOR; false w wersji publicznej (szkice pokazują wtedy "w przygotowaniu").
  pokazSzkice: true,
  // Adres do zgłaszania błędów w kartach. UZUPEŁNIĆ przed testami.
  emailBledow: "bledy@example.com",
  // Po ilu dniach od stanu bazy pokazać ostrzeżenie o nieaktualnych danych.
  ostrzezenieDni: 90,
  // Wersja tekstu zgody – zmiana wymusza ponowne potwierdzenie.
  wersjaZgody: 1,
  // Publikacja z panelu admina: plik z kartami w repozytorium na GitHubie.
  github: { repo: "kolodziejczykamil/wlew", galaz: "main", plik: "app/data/leki.json" },
};
