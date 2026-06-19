---
applyTo: "src/view/**"
---

# View layer (`src/view/`)

- Components are **presentational**: data and handlers come from a ViewModel hook or parent props. **Do not import repositories** (`src/model/repository/`) here.
- Memoize components that render in lists (`memo`) and stabilize callbacks/derived values (`useCallback`/`useMemo`) where it prevents re‑renders.
- Lazy‑load heavy sections/modals with `React.lazy()` (follow `App.tsx` — `SocialHub`, `SettingsHub`, `FormModal`, `ConfirmModal`).
- The games table is virtualized with `@tanstack/react-virtual` — keep large lists virtualized; don't render thousands of rows directly. Provide stable `key`s.
- Icons: use the existing `<Icon name="…" />` (`Icon.tsx` + `IconSprite.tsx`) — don't inline new SVGs ad hoc.
- **Styling is SCSS** in `src/styles/` — no Tailwind, no CSS‑in‑JS, avoid complex inline styles. Add to the right partial or create `_feature.scss` and import it in `index.scss`.
- **Mobile‑first**, verify at 360 / 768 / 1024 / 1440 px.
- **Accessibility is linted** (eslint-plugin-jsx-a11y): semantic elements, ARIA labels, keyboard navigation, focus management in modals.
- Sanitize any dynamic/user content; never use `dangerouslySetInnerHTML` with unsanitized input.

Component pattern:
```tsx
import { memo } from 'react';
interface FooProps { /* typed, no `any` */ }
function FooRaw(props: FooProps) { return <div className="foo">{/* … */}</div>; }
export const Foo = memo(FooRaw);
```

Verify: `npx tsc --noEmit` and `npm run validate`.
