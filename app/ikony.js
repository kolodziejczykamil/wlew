// Ikony liniowe (24×24), rysowane kolorem tekstu.
const P = {
  szukaj: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  gwiazdka: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  wstecz: '<path d="M15 5l-7 7 7 7"/>',
  dalej: '<path d="M9 5l7 7-7 7"/>',
  kropla: '<path d="M12 3.5c3.5 4.4 6 7.7 6 10.8a6 6 0 0 1-12 0c0-3.1 2.5-6.4 6-10.8z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  lista: '<path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pobierz: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>',
  wgraj: '<path d="M12 15.5V4.5M7 9l5-5 5 5M5 19.5h14"/>',
  kosz: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l1 12.5h9l1-12.5"/>',
  oko: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  okoX: '<path d="M4 4l16 16M10 6c.6-.1 1.3-.2 2-.2 6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-2.6 3.3M6.4 7.6A16 16 0 0 0 2.5 12s3.5 6.2 9.5 6.2c1.4 0 2.7-.3 3.8-.8"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  uwaga: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  dokument: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12.5h6M9.5 16h6"/>',
  ustawienia: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
export const ic = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ""}</svg>`;
