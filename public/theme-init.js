// F1 — Init de tema y paleta ANTES del primer render para evitar el flash.
// Debe ir como primer elemento del <head> en index.html. Es 'self' → permitido por la CSP (script-src 'self').
// Mantener claves y colores en sincronía con:
//   - `src/core/constants/storageKeys.ts` (THEME_KEY, PALETTE_KEY)
//   - `src/core/constants/palettes.ts`   (ids + `--bg` de cada tema)
//   - `src/styles/_base.scss`            (bloques `[data-palette]`)
// Defecto: tema del sistema (si no se detecta, OSCURO) y paleta "steam".
(function () {
  // `--bg` de cada paleta y tema (debe coincidir con _base.scss). El `theme-color` se toma de aquí.
  var BG = {
    steam: { dark: '#1a1e24', light: '#f0e9db' },
    persona: { dark: '#0d0d0d', light: '#f4f1ee' },
    lotr: { dark: '#17120b', light: '#e6d7b3' }
  };
  try {
    var pref = localStorage.getItem('mis-listas-theme'); // 'dark' | 'light' | null
    var theme = pref === 'light' ? 'light'
      : pref === 'dark' ? 'dark'
        : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }

    var palette = localStorage.getItem('mis-listas-palette'); // id | null
    if (!BG[palette]) {
      palette = 'steam';
    }
    // "steam" es la paleta por defecto (vive en :root); solo fijamos el atributo para el resto.
    if (palette !== 'steam') {
      document.documentElement.setAttribute('data-palette', palette);
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', BG[palette][theme]);
    }
  } catch (e) {
    // Sin localStorage/matchMedia: se queda el tema oscuro y la paleta por defecto.
  }
})();
