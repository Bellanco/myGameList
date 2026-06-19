---
applyTo: "src/styles/**"
---

# Styles (`src/styles/`)

- Styling is **SCSS only** — no Tailwind, no CSS‑in‑JS.
- Structure: `index.scss` imports the partials `_base`, `_layout`, `_table`, `_forms-and-buttons`, `_overlays-and-responsive`. Add new styles to the most relevant existing partial; create `_feature.scss` only for a genuinely new area and `@use`/`@import` it from `index.scss`.
- **Mobile‑first.** Write base rules for small screens, then layer breakpoints up. Verify at 360 / 768 / 1024 / 1440 px. (Legacy breakpoints in use include 1100px and 1400px.)
- Match the existing naming (kebab‑case classes that mirror component names, e.g. `.game-table`). Reuse existing variables/mixins rather than introducing new color/spacing values.
- Don't move layout/spacing into inline styles in components — keep it here.
