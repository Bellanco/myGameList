// ▟ CONTRATO DE UN TEMA (lado TS). La otra mitad —el color y el skin— vive en `src/styles/themes/<id>/`,
//   y la receta completa para crear, editar o borrar uno está en `docs/temas.md`.
//
//   Un tema son DOS constantes en `themes/<id>.ts`:
//     · `<id>`        la ficha: identidad, muestra del selector, `--bg` y la voz de la APLICACIÓN;
//     · `<id>Social`  la voz del HUB SOCIAL, aparte y exportada por separado.
//
//   POR QUÉ LA VOZ SOCIAL VA SUELTA: los textos del hub viajan en su chunk perezoso (ver la cabecera de
//   `socialLabels.ts`: importarlos desde el arranque devolvía 8 kB al presupuesto de todo el mundo). El
//   registro (`constants/palettes.ts`) es código de arranque y solo toca la ficha; `socialLabels.ts`, que
//   solo carga con el hub, es el único que toca la voz social. Dos exports en el mismo fichero, dos chunks
//   distintos: lo comprueba `tests/unit/themes.test.ts`, que verifica que ninguna frase social aparece en
//   el bundle de arranque.

/** Lo que dice un tema cuando la APLICACIÓN se rompe o se queda sin red. El guiño va INTEGRADO en la
 *  frase, sin comillas ni atribución; la línea de debajo (común) dice qué hacer. */
export interface ThemeVoice {
  /** Fallo de render que tumbaría la app (boundary raíz). */
  readonly appError: string;
  /** Sin conexión: no hay avería, falta comunicación. */
  readonly appOffline: string;
}

/** Lo mismo para el ESPACIO SOCIAL, donde lo que falla es la parte de GENTE (amistades, feed, reseñas). */
export interface ThemeSocialVoice {
  readonly error: string;
  readonly offline: string;
}

export interface ThemeDefinition {
  /** El `data-palette` del tema. Es la clave de todo: CSS, localStorage y sincronización. */
  readonly id: string;
  /** Nombre visible en el selector de Ajustes. */
  readonly label: string;
  /** Color de acento (la muestra del selector). */
  readonly accent: string;
  /** Segundo color OPCIONAL de la muestra, para temas de dos colores (el naranja+turquesa de «Forja y
   *  temple», el azul+naranja de «Cámara de pruebas»): distingue dos temas de acento parecido. */
  readonly accent2?: string;
  /** El `--bg` del tema en sus dos modos. DEBE coincidir con su `_colors.scss` y con el mapa del
   *  anti-flash de `index.html`; si derivan, la pantalla parpadea al cargar. Lo vigila el test. */
  readonly bg: { readonly dark: string; readonly light: string };
  readonly voice: ThemeVoice;
}
