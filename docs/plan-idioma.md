# Idioma — la aplicación en español e inglés

Estado: **plan, sin empezar** (2026-09-25). Recoge lo medido en el código ese día y las decisiones tomadas con el
propietario (§6). Si una cifra no cuadra con el código, manda el código: corrígela aquí.

---

## 1. Qué se pidió

> «Tener la aplicación en inglés y español: me gustaría que estuviese en un botón similar al de tema claro
> oscuro, para que sea de fácil uso.»

Estaba pendiente desde la unificación de premios (`plan-unificar-premios.md` §7), que dejó los títulos de
categoría bilingües y los textos en módulos propios para no pagar dos veces.

---

## 2. Punto de partida (medido)

### 2.1 Dónde está el texto

| Qué | Cuánto | Cómo se midió |
|---|---|---|
| Literales en los módulos `core/constants/*Labels.ts`, `labels.ts`, `socialShell.ts`, `legal*.ts` | **≈1.970** | perl sobre los ficheros sin comentarios |
| — de ellos en el **arranque** (`labels.ts`, `legal.ts`, `socialShell.ts`) | ≈380 · **13,8 kB min / ≈5,9 kB gzip** | sourcemap de `dist`: bytes generados por módulo |
| — en chunks perezosos (admin, legal, social, premios, stats, ajustes, logros, compartir) | 94,5 kB min | ídem |
| Catálogo de logros (`core/achievements/catalog.ts`) | 270 literales, 48 plurales, ordinales en femenino | perl |
| Voz de los temas (`constants/themes/*.ts`, `*.social.ts`, `premios.ts`) | 8 temas × 6 frases | lectura |
| Texto visible **fuera** de los módulos (view, viewmodel, `App.tsx`) | ≈96 | perl, literales con tilde o palabra funcional |
| `new Error('…')` en español en model/viewmodel/core | 111, en 30 ficheros | grep |
| Errores `{ error }` en español de las Pages Functions que el cliente pinta tal cual | ≈25 sitios | grep en `functions/` |

**No hay infraestructura de i18n**: ni librería, ni contexto de idioma, ni `navigator.language`, ni
`documentElement.lang` en tiempo de ejecución. Lo que sí hay y sirve:

- **`WidenText<T>`** (`labels.ts:532-546`): ensancha un objeto `as const` a `string`, así que un segundo
  diccionario puede cumplir *exactamente* el mismo tipo. Una clave que falte en inglés es un error de compilación.
- **`statsVoice.ts`**: dos diccionarios del mismo tipo (`own`/`other`) servidos por contexto. Es el esquema de
  un idioma, aplicado hoy a la persona gramatical.
- **Premios**: `PremiosLanguage = 'es' | 'en'` y `tField` (`core/premios/localize.ts`) ya leen los títulos
  bilingües `{ es, en }` de `premiosCategories`. Donde no se rellenó el inglés, el panel copió el español.

> **`data/i18n/en.js` no existe.** `plan-unificar-premios.md` decía que se conservaba; no está en el árbol ni en
> el historial (`git log --all`). No hay traducción previa que aprovechar, salvo los `title.en` de Firestore.

### 2.2 Lo que ya se guarda como código (y por tanto se traduce solo)

Estados de pestaña (`c/v/e/p`), mensajes de lista del feed (`{tab, at}`: el verbo lo pone `socialLabels`), tipo
de actividad, logros (bitmap de ids), rangos (`bronze…mithril`), votos y ganadores (`optionId`). Las reglas de
Firestore **no validan ningún literal en español** y ninguna cota de longitud depende del idioma de la interfaz.

### 2.3 Lo que no se traduce porque no es interfaz

Reseñas, publicaciones, nombres, **géneros, plataformas y puntos fuertes/débiles** (texto libre por biblioteca;
lo importado de Playnite ya entra en inglés), nombres de nominados, nombre de la edición de premios, motivo de
un veto y el **aviso del administrador** (texto libre, un idioma; ver §6).

### 2.4 Formato dependiente del idioma

- `'es-ES'` fijo en ≈25 sitios (`Intl.NumberFormat`, `Intl.DateTimeFormat`, `toLocale*String`).
- `toLocaleString()` **sin** locale en `labels.ts:253` y `socialLabels.ts:125`: sale con el idioma del
  navegador y ya es incoherente con el resto.
- Meses escritos a mano (`viewmodel/social/socialFeed.ts:157-170`) y «El DD de MES a las HH:MM» montado con
  `de` y `a las` (`socialLabels.ts:145-164`).
- `localeCompare(…, 'es')` en `core/utils/compare.ts:4` y cinco sitios más.

### 2.5 Trampas encontradas

1. **La tabla ordena por la etiqueta en español.** `GameTable.tsx:359-366` (`SORT_COLUMN`) usa `Juego`, `Año`,
   `Géneros`… como clave de orden: traducir la cabecera rompe la ordenación sin que falle nada.
2. **jsdom y Playwright hablan inglés.** En jsdom `navigator.language` es `en-US`, y el proyecto de Playwright
   (`devices['Desktop Chrome']`) no fija `locale`. Si el idioma por defecto sigue al navegador, **toda la suite
   pasaría a inglés** y los 213 textos literales en español de los tests (176 en component, 37 en e2e) fallarían.
3. **`publicConfig` tiene `hasOnly`** (`firestore.rules:336`). Un campo nuevo que el cliente escriba antes de
   desplegar las reglas **rechaza la escritura entera**, no solo el campo: es el incidente de `listShape`/F5.
4. **El anti-flash va inline con hash en la CSP** (`index.html:25-60`, `public/_headers`). Tocarlo obliga a
   recalcular el `sha256`.
5. **Margen del arranque: 8,9 kB** (`npm run validate`: crítico 181,1/190 kB; total 217,1/240). Meter el
   diccionario inglés del arranque en el chunk de entrada se comería ≈6 de esos 9 kB a todos, incluido quien no
   lo usa nunca.

---

## 3. Decisiones que propone el plan

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Sin librería** (ni i18next ni react-intl) | El texto ya vive en objetos tipados; `WidenText` da la garantía de completitud en compilación, que es lo que aportaría la librería. Cero peso añadido |
| 2 | **Un diccionario inglés por módulo**, con el mismo tipo: `labels.ts` ↔ `labels.en.ts`, `socialLabels.ts` ↔ `socialLabels.en.ts`… | Cada traducción viaja en el mismo chunk perezoso que su pantalla, no en el arranque |
| 3 | **El módulo elige el diccionario al cargarse**, con un `await import()` de nivel superior solo si el idioma es inglés. Los ≈135 ficheros que importan `SOCIAL_UI`, `UI_MESSAGES`… **no cambian** | Quien use la app en español no descarga ni ejecuta un byte de inglés. El build ya es `es2022`, que admite `await` de nivel superior |
| 4 | **Cambiar de idioma recarga la página** | Hay decenas de capturas a nivel de módulo (`const APPEARANCE = APPEARANCE_UI`, `PUNTO_PREMIOS = { label: MENU.premios }`…). Un cambio en caliente obligaría a tocar cada consumidor. La recarga es instantánea desde el precache y funciona sin conexión |
| 5 | El inglés del **arranque** va en un chunk aparte **precacheado** | Cuenta contra el total (22,9 kB de margen), no contra el crítico. Quien entra en inglés con el SW instalado lo saca de la caché, sin esperar a la red |
| 6 | Idioma = **preferencia** como el tema: `mis-listas-language` en local, `<html lang>` desde el anti-flash, réplica a `publicConfig.language` | Mismo `createPreferenceStore`, misma hidratación al iniciar sesión, mismo sitio en Ajustes |
| 7 | **Un solo locale derivado** (`es-ES` / `en-GB`) para fechas, números y ordenación; ortografía británica en los textos | Sustituye los ≈25 `'es-ES'` fijos y arregla de paso los dos `toLocaleString()` sin locale |
| 8 | **Las rutas siguen en español** (`/en-curso`, `/completados`…) | Son identificadores: los usan enlaces compartidos, los atajos del manifest y los e2e. Traducirlas no aporta y rompe enlaces |
| 9 | **Los tests siguen en español** | `tests/setup.ts` y `playwright.config.ts` fijan `es`. El inglés tiene sus propios tests (§5) |

### 3.1 El botón

- **Al lado del de tema**, en `FloatingControls` (`FloatingControls.tsx:69-71`), con la misma forma
  (`btn-icon`, 44 px) y el mismo comportamiento al hacer scroll. Muestra el idioma **actual** en dos letras
  (`ES` / `EN`), como el tema muestra su icono actual; `aria-label` y `title` dicen a cuál cambia, en el idioma
  **de destino** («Switch to English» / «Cambiar a español»), que es lo que busca quien no entiende el actual.
- **También en Ajustes → Apariencia**, junto al conmutador de tema (`AppearanceToggles.tsx`).
- Si hay una edición a medio guardar, se avisa antes de recargar. El resto del estado ya sobrevive a una recarga.

---

## 4. Entrega por fases

Cada fase termina con la suite en verde y algo comprobable. Se para al final de cada una.

| Fase | Qué entra | Cómo se comprueba | Peso |
|---|---|---|---|
| **F0** · Preparación (sin cambio visible) | `SORT_COLUMN` pasa a ids de columna; los ≈96 textos sueltos de view/viewmodel/`App.tsx` bajan a sus módulos; un `APP_LOCALE` único sustituye los `'es-ES'` y los meses a mano; los tests y Playwright fijan `es` | Suite en verde; la app idéntica; `grep "'es-ES'" src` solo en el módulo de idioma | 15 % |
| **F1** · Mecanismo y botón | Preferencia de idioma con el **navegador como valor por defecto** (store, anti-flash con `<html lang>` y hash de la CSP recalculado, réplica a `publicConfig`); **reglas antes que cliente**: `language` en el `hasOnly` con sus tests; patrón de carga con `await` de nivel superior; botón flotante y en Ajustes; **inglés del arranque** (`labels.ts`, `socialShell.ts`, `legal.ts` y el `label`/`voice` de los temas) | Con EN, la barra inferior, las pestañas, el listado, los modales y el menú de Ajustes en inglés; `npm run validate` con el crítico **sin cambios** para quien usa español | 20 % |
| **F2** · Pantallas | Diccionarios ingleses de `socialLabels`, `statsLabels` + `statsOtherLabels`, `settingsLabels`, `shareLabels`, `premiosLabels`, `achievementLabels`, `announcementLabels` y el panel de administración (`adminLabels`, 421 literales, más los textos sueltos de `model/repository/admin`); `tField` de premios con el idioma de la app | Recorrido completo en inglés, panel incluido; cada chunk perezoso pesa lo mismo en español | 35 % |
| **F3** · Lo que se compone | Catálogo de logros (270 frases con plurales y ordinales; el inglés no tiene el femenino de `ORDINAL_TIMES`); voces de tema de social y premios; los 111 errores de repositorio pasan a **códigos** que traduce la vista; los errores de las Functions se componen en el cliente a partir de `status` + `extra` (ya traen `quota`, `dailyLimit`, `banned`, `needsProfile`); `auth.languageCode` de Firebase | Forzar cada error conocido en inglés y ver el mensaje en inglés, no el del servidor | 20 % |
| **F4** · Legal y exterior | Textos legales en inglés **con cláusula de que prevalece la versión española** y sin subir `LEGAL_VERSION`; opcionales: `<title>`/`description`, manifest y tarjeta OG por idioma | Revisión del texto legal por su responsable | 10 % |

**Traducción.** Se puede hacer un primer borrador del inglés de cada módulo dentro de su fase; hay que revisarlo
antes de dar la fase por cerrada, sobre todo el tono de las voces de tema y los logros.

---

## 5. Cómo se prueba el inglés

- **Completitud**: el tipo compartido (`satisfies WidenText<typeof ES>`) hace que una clave olvidada no
  compile. No hace falta un test que recorra claves.
- **Conmutador** (componente): el botón anuncia el idioma de destino, escribe la preferencia y pide la recarga.
- **e2e**: en inglés, tras recargar, `<html lang="en">`, el primer `h1` en inglés y ninguna petición del
  diccionario inglés **en español** (que el que no lo usa no lo descarga).
- **Peso**: `npm run validate` antes y después de F1; el crítico no puede crecer para quien usa español.
- **Reglas**: `npm run test:rules` con `language` aceptado y un valor fuera de `['es','en']` rechazado.

---

## 6. Decisiones tomadas (2026-09-25)

| # | Pregunta | Decisión | Consecuencia |
|---|---|---|---|
| 1 | Idioma la primera vez | **El del navegador**: español si `navigator.language` empieza por `es`, inglés en otro caso | Obliga a fijar `es` en `tests/setup.ts` y `playwright.config.ts` en F0 (§2.5, trampa 2) |
| 2 | Panel de administración | **Se traduce** | `adminLabels` entra en F2 |
| 3 | Aviso del administrador | **Un solo idioma** | Sin cambios en `sanitizeAnnouncement`, la Function ni el panel |
| 4 | Textos legales | **Traducción informativa con prevalencia de la versión española** | F4; no sube `LEGAL_VERSION` |
| 5 | Variante del inglés | **Británico** (`en-GB`) | Fechas `25 September 2026`, ortografía `colour`, `favourite`… |

---

## 7. Fuera de alcance

- Traducir contenido de usuarios (reseñas, publicaciones, etiquetas) o de admin.
- Rutas en inglés.
- La descripción de los gists ya creados en GitHub (`'Mi Lista de Juegos - Sincronización'`): no se usa para
  localizarlos y se queda como está.
- Un tercer idioma. El mecanismo lo admite sin cambios, pero no se prepara nada para él.
