---
applyTo: "src/styles/**"
---

# Styles (`src/styles/`)

- Styling is **SCSS only** — no Tailwind, no CSS‑in‑JS. The visual system (four layers, tokens, eight themes) is documented in `DESIGN.md`; if it disagrees with the code, the code wins.
- Structure:
  - `index.scss` (imported from `main.tsx`) `@use`s the base bundle: `_base` (CAPA 0/1 tokens), `themes` (`themes/_index.scss`: every theme's `_colors.scss`), `_layout`, `_notice`, `_forms-and-buttons`, `_table`, `_overlays-and-responsive`, `_roulette`, `_tiers`, `_effects`, `_motion` and the default theme's skin.
  - **Area sheets without `_`** (`social.scss`, `settings.scss`, `reviews.scss`, `premios.scss`…) are imported by the component that needs them, so they travel in that component's lazy chunk. Before reusing a class from one of them elsewhere, check that the sheet is loaded on that screen too, or it renders unstyled.
  - **Themes:** one folder per theme in `themes/<id>/` — `_colors.scss` (identity + ramp, base bundle) and `<id>.scss` (letter, shapes, textures; loaded on demand by `view/hooks/paletteSkin.ts`). A theme's character goes there, not in the shared sheets. Adding a theme has its own recipe: `docs/temas.md`.
  - Add new styles to the most relevant existing sheet; create a new one only for a genuinely new area and `@use` it from `index.scss` (or import it from its component if it belongs to a lazy screen).
- **Ask for a token**: colors, font sizes, shadows and spacing come from CSS custom properties (`var(--sp-4)`, `var(--fs-sm)`, `var(--e2)`…). Don't write literal colors, `font-size`s, shadows or font families.
- Effects only under `[data-effects="on"]` (switch them off with `:root:not([data-effects="on"])` — `off` never exists) and respect `prefers-reduced-motion`.
- **Mobile‑first.** Write base rules for small screens, then layer breakpoints up. Verify at 360 / 768 / 1024 / 1440 px, in light and dark, and with a library of 120+ games when touching the virtualized table.
- Match the existing naming (kebab‑case classes, e.g. `.table-wrap`, `.list-head`, `.chips`).
- Don't move layout/spacing into inline styles in components — keep it here.
