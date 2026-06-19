# Prompt 13 — Migration UI

## Prerequisites
Prompts 01–12 complete. React 18 + TypeScript + Tailwind CSS.

## Task
Create the migration UI: a modal that guides the user through the
one-time migration process. It is shown automatically when
`appStore.migrationNeeded === true` after login.

## Output files
- `src/components/migration/MigrationModal.tsx`
- `src/components/migration/TokenInput.tsx`
- `src/components/migration/MigrationProgress.tsx`
- `src/components/migration/MigrationError.tsx`
- `src/components/migration/MigrationModal.test.tsx`

---

## Migration steps visible to the user

The migration has 5 steps. Show a step indicator at the top.

```
Step 1 — Security update     (rotate token)
Step 2 — Update account      (migrate Firestore doc)
Step 3 — Import games        (migrate games Gist)
Step 4 — Set up social        (create social Gist)
Step 5 — Done                (confirm and launch)
```

---

## `src/components/migration/MigrationModal.tsx`

```tsx
/**
 * Full-screen modal shown when migration is needed.
 * Subscribes to appStore for step and error state.
 * Manages local step state via useReducer.
 * Does NOT run migration logic — calls runMigration() from src/migration/runMigration.ts.
 */
export function MigrationModal(): JSX.Element
```

Step rendering logic:
- Step 1 → renders `<TokenInput />`
- Steps 2–4 → renders `<MigrationProgress />`
- Step 5 → renders a success screen with a "Launch app" button
- Any error → renders `<MigrationError />` with retry button

The modal must:
- Be full-screen with a semi-transparent backdrop.
- Not be dismissible by clicking outside or pressing Escape.
- Show a warning banner on Step 1 explaining why the token rotation is needed
  ("A previous version stored your GitHub token insecurely.
   Please generate a new token to continue.").
- Disable the browser back button while active.

---

## `src/components/migration/TokenInput.tsx`

```tsx
interface TokenInputProps {
  onTokenSubmit: (token: string) => void;
  validating: boolean;
  error: string | null;
}

export function TokenInput({ onTokenSubmit, validating, error }: TokenInputProps): JSX.Element
```

UI requirements:
- Password-type input (masked by default, toggle to show).
- "Generate new token" button that opens
  `https://github.com/settings/tokens/new?scopes=gist&description=Mi%20Lista`
  in a new tab.
- Instruction text: "Select only the 'gist' scope. No other permissions are needed."
- Submit button disabled while `validating` is true.
- Shows a spinner while validating.
- On error: inline error message below the input in red.
- On success: green checkmark, then auto-advances to step 2 after 800ms.

Validation (call from the parent):
```ts
async function validateToken(token: string): Promise<boolean> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `token ${token}` }
  });
  return res.ok;
}
```

---

## `src/components/migration/MigrationProgress.tsx`

```tsx
interface MigrationProgressProps {
  currentStep: number;      // 1–5
  totalSteps:  number;      // 5
  stepLabel:   string;
  detail:      string | null;
  gamesCount:  number | null;
}

export function MigrationProgress(props: MigrationProgressProps): JSX.Element
```

UI requirements:
- Animated progress bar (CSS transition on width).
- Step label: "Importing games… (47 / 163)" when gamesCount is available.
- Indeterminate spinner for steps without a count.
- Do NOT show a cancel button — migration cannot be cancelled mid-way.
- Show estimated time remaining if `gamesCount > 50`:
  ```ts
  const estimatedSeconds = Math.ceil(gamesCount / 20); // ~20 games/sec
  ```

---

## `src/components/migration/MigrationError.tsx`

```tsx
interface MigrationErrorProps {
  error:       string;
  step:        number;
  onRetry:     () => void;
  onContactSupport: () => void;
}

export function MigrationError(props: MigrationErrorProps): JSX.Element
```

UI requirements:
- Red error icon + error message.
- "Try again" button → calls `onRetry`.
- "Contact support" button → opens a pre-filled GitHub issue URL.
- If step === 1 (token error): show specific guidance about token scopes.
- If step === 3 (Gist error): show "Your game data is safe.
  The import has not modified your existing Gist."

---

## `src/components/migration/MigrationModal.test.tsx`

```tsx
describe('MigrationModal', () => {
  it('renders TokenInput on step 1', () => {
    render(<MigrationModal />, { wrapper: StoreProvider });
    expect(screen.getByPlaceholderText(/github.*token/i)).toBeInTheDocument();
  });

  it('does not close on Escape', () => {
    render(<MigrationModal />, { wrapper: StoreProvider });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByPlaceholderText(/github.*token/i)).toBeInTheDocument();
  });

  it('advances to step 2 after valid token', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }));
    render(<MigrationModal />, { wrapper: StoreProvider });
    fireEvent.change(screen.getByRole('textbox', { hidden: true }), {
      target: { value: 'ghp_validtoken' }
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() =>
      expect(screen.getByText(/update account/i)).toBeInTheDocument()
    );
  });

  it('shows error on invalid token', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('', { status: 401 }));
    render(<MigrationModal />, { wrapper: StoreProvider });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() =>
      expect(screen.getByText(/invalid token/i)).toBeInTheDocument()
    );
  });
});
```

## Constraints
- The modal must be rendered in a React portal at `document.body` level.
- No animation library — CSS transitions only.
- `TokenInput` must never log the token value to the console.
- The "Generate new token" URL must include the `gist` scope pre-selected.
