// F1 — Init de tema ANTES del primer render para evitar el flash de tema.
// Debe ir como primer elemento del <head> en index.html. Es 'self' → permitido por la CSP (script-src 'self').
// Mantener la clave y los colores en sincronía con `src/core/constants/storageKeys.ts` (THEME_KEY) y
// `src/view/hooks/useTheme.ts`. Defecto: tema del sistema; si no se detecta, OSCURO.
(function () {
  try {
    var pref = localStorage.getItem('mis-listas-theme'); // 'dark' | 'light' | null
    var theme = pref === 'light' ? 'light'
      : pref === 'dark' ? 'dark'
        : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#eef1f5' : '#1a1e24');
    }
  } catch (e) {
    // Sin localStorage/matchMedia: se queda el tema oscuro por defecto.
  }
})();
