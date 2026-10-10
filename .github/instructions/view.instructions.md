---
applyTo: "src/view/**"
---

# View layer (`src/view/`)

- Components are **presentational**: data and handlers come from a ViewModel hook or parent props. **New code should not import repositories** (`src/model/repository/`) here. Some existing screens (`AdminHub`, `DangerZone`, `PublicReviewScreen`…) and the `view/hooks/use*Session` hooks do — that deviation is measured and documented in the README («Arquitectura MVVM»); don't widen it and don't "fix" it in passing.
- Memoize components that render in lists (`memo`) and stabilize callbacks/derived values (`useCallback`/`useMemo`) where it prevents re‑renders.
- Lazy‑load heavy sections/modals with `React.lazy()` (follow `App.tsx` — `SocialHub`, `SettingsHub`, `StatsHub`, `PremiosHub`, `AdminHub`, `FormModal`, `ConfirmModal`). A lazy screen's fallback is a skeleton, not `null`.
- The games table is virtualized with `@tanstack/react-virtual` — keep large lists virtualized; don't render thousands of rows directly. Provide stable `key`s. Check table changes with 120+ games, or virtualization never kicks in.
- Icons: use the existing `<Icon name="…" />` (`Icon.tsx` + `IconSprite.tsx` / `IconSpriteRest.tsx`) — don't inline new SVGs ad hoc.
- **UI text is Spanish** and comes from `src/core/constants/*Labels.ts` / `labels.ts`, not string literals in JSX.
- **Styling is SCSS** in `src/styles/` — no Tailwind, no CSS‑in‑JS, avoid complex inline styles. See `.github/instructions/styles.instructions.md`: shared partials go through `index.scss`; area sheets (`social.scss`, `settings.scss`…) are imported by the component that needs them; a theme's character goes in `styles/themes/<id>/<id>.scss`.
- **Mobile‑first**, verify at 360 / 768 / 1024 / 1440 px, in light and dark.
- **Accessibility is linted** (eslint-plugin-jsx-a11y) and audited with axe in `tests/e2e/a11y.test.ts`: semantic elements, ARIA labels, keyboard navigation, focus management in modals.
- Sanitize any dynamic/user content; never use `dangerouslySetInnerHTML` with unsanitized input.
- Social hub screens can't be walked without a Google + GitHub session: review them with `docs/maquetas/social.html` and `node scripts/capturar-maqueta-social.mjs`. **If you add a hub screen or view, add it to that mock‑up too.**

Component pattern (as used across `src/view/`):
```tsx
import { memo } from 'react';
interface FooProps { /* typed, no `any` */ }
export const Foo = memo(function Foo(props: FooProps) {
  return <div className="foo">{/* … */}</div>;
});
```

Verify: `npm run typecheck` and `npm run validate` (and `npm run build && npm run test:e2e` if the change depends on browser layout).
