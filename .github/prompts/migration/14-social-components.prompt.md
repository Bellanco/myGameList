# Prompt 14 — Social UI components

## Prerequisites
Prompts 01–13 complete. React 19 + TypeScript 6 + SCSS (no Tailwind).

## Task
Create all React components for the social hub.
These components only receive data from ViewModels — they never
call Gist APIs or Firestore directly.

## Output files
- `src/components/social/FeedCard.tsx`
- `src/components/social/FeedList.tsx`
- `src/components/social/UserProfilePage.tsx`
- `src/components/social/GameCard.tsx`
- `src/components/social/GameGrid.tsx`
- `src/components/social/AvatarHash.tsx`
- `src/components/social/RatingBadge.tsx`
- `src/components/social/SnippetText.tsx`
- `src/components/social/__tests__/FeedCard.test.tsx`

---

## Data contract reminder

Components receive `FirestoreFeedCard` or `PublicGame` objects.
They must never receive or display `Game` objects (which contain private fields).

**Enforce with TypeScript**:
```ts
// This must cause a type error:
<FeedCard card={game as FirestoreFeedCard} />
// Because Game has 'score', 'hours', etc. that FirestoreFeedCard doesn't.
```

---

## `src/components/social/AvatarHash.tsx`

```tsx
interface AvatarHashProps {
  hash:        string;     // avatarHash from profile — NOT a URL
  displayName: string;
  size:        'sm' | 'md' | 'lg';
}
```

Derives a deterministic color and initials from the hash.
Never fetches an image URL from the network.
Renders a colored circle with initials as fallback for all users.

```ts
function hashToColor(hash: string): string {
  // Use first 6 chars of hash as HSL hue (0-360)
  const hue = parseInt(hash.slice(0, 6), 16) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}
function hashToInitials(displayName: string): string {
  return displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
```

---

## `src/components/social/RatingBadge.tsx`

```tsx
interface RatingBadgeProps {
  rating:  number;   // 1–5
  size:   'sm' | 'md';
}
```

Renders a star-based badge. 1–2 = red, 3 = amber, 4–5 = green.
Accessible: include `aria-label="Rating: {rating} out of 5"`.

---

## `src/components/social/SnippetText.tsx`

```tsx
interface SnippetTextProps {
  snippet:        string;    // ≤160 chars — always a snippet, never full review
  hasFullReview:  boolean;
  onReadMore?:    () => void;
}
```

Renders the snippet text. If `hasFullReview` is true, shows a "Read more" link.
**Important**: "Read more" calls `onReadMore` — it does NOT fetch anything itself.
The parent ViewModel decides what to show in the expanded state.

Add a subtle visual indicator that this is a preview, not the full text.

---

## `src/components/social/FeedCard.tsx`

```tsx
interface FeedCardProps {
  card:          FirestoreFeedCard;
  onProfileClick:(profileId: string) => void;
  onGameClick:   (gameId: string, socialGistId: string) => void;
  onReadMore:    (card: FirestoreFeedCard) => void;
  isOwn:         boolean;   // true if card.profileId === currentUser.profileId
}

export function FeedCard(props: FeedCardProps): JSX.Element
```

Layout:
```
┌──────────────────────────────────────────┐
│ [Avatar] DisplayName          [Rating]   │
│          GameName · Genre                │
│──────────────────────────────────────────│
│ Snippet text…                            │
│ [Read more ↗]         [time ago]         │
└──────────────────────────────────────────┘
```

Requirements:
- Uses `<AvatarHash>`, `<RatingBadge>`, `<SnippetText>`.
- Time ago: relative format ("3 days ago") using a pure function, no library.
- Avatar and display name are clickable → `onProfileClick(card.profileId)`.
- Game name is clickable → `onGameClick(card.gameId, card.socialGistId)`.
- If `isOwn`: show a small "Edit" icon that navigates to the game detail page.
- Accessible: `role="article"`, `aria-label="Review of {gameName} by {displayName}"`.
- Never renders `score`, `hours`, `review` (full), or any private field.

---

## `src/components/social/FeedList.tsx`

```tsx
interface FeedListProps {
  viewModel: SocialFeedViewModel;
}

export function FeedList({ viewModel }: FeedListProps): JSX.Element
```

- Renders a list of `<FeedCard>` components.
- Implements infinite scroll using `IntersectionObserver` on a sentinel element.
- Shows a skeleton loader for the first load.
- Shows "Load more" spinner at the bottom when `loadingMore` is true.
- Shows "No reviews yet" empty state with an illustration.
- Shows a toast error if `viewModel.state.error` is set.

Skeleton loader: 3 placeholder cards with animated shimmer effect (CSS only).

---

## `src/components/social/GameCard.tsx`

```tsx
interface GameCardProps {
  game:         PublicGame;    // NOT Game — no private fields
  onGameClick:  (gameId: string) => void;
  showSnippet:  boolean;
}

export function GameCard({ game, onGameClick, showSnippet }: GameCardProps): JSX.Element
```

Layout:
```
┌─────────────────────────────┐
│ GameName                    │
│ Genres · Platforms          │
│ [completed] [★ 4]           │
│                             │
│ Snippet (if showSnippet)    │
└─────────────────────────────┘
```

Status badge colors:
- `completed` → green
- `pending` → blue
- `abandoned` → grey
- `excluded` → red

Must NOT show `score`, `hours`, `steamDeck`, `retry`, or `replayable`.

---

## `src/components/social/GameGrid.tsx`

```tsx
interface GameGridProps {
  viewModel:    UserProfileViewModel;
  filterStatus: GameStatus | 'all';
}

export function GameGrid({ viewModel, filterStatus }: GameGridProps): JSX.Element
```

- Renders a responsive grid of `<GameCard>` components.
- Filters by `filterStatus` client-side (data already loaded from Gist).
- Shows a "Load more games" button when `viewModel.state.hasMoreChunks`.
- The button calls `viewModel.loadMoreGames()`.

---

## `src/components/social/UserProfilePage.tsx`

```tsx
interface UserProfilePageProps {
  profileId:    string;
  socialGistId: string;
}

export function UserProfilePage(props: UserProfilePageProps): JSX.Element
```

Layout sections:
1. **Header**: Avatar, display name, stats (completed/reviews/avg rating).
2. **Tabs**: "Games" | "Reviews"
3. **Games tab**: `<GameGrid>` with status filter tabs (All / Completed / Abandoned).
4. **Reviews tab**: list of `ActivityFeedItem` rendered as mini `<FeedCard>`.
5. **Favorite games** section (horizontal scroll of `<GameCard>`).

Loads data via `UserProfileViewModel.load(profileId, socialGistId)`.
Shows a skeleton while loading.
Handles the `isOwnProfile` case: adds an "Edit profile" button.

---

## `src/components/social/__tests__/FeedCard.test.tsx`

```tsx
describe('FeedCard', () => {
  const card = buildFeedCard({
    displayName: 'Bellanco',
    gameName:    'Dispatch',
    rating:      5,
    snippet:     'Short snippet',
    hasFullReview: true,
  });

  it('renders display name and game name', () => {
    render(<FeedCard card={card} {...handlers} />);
    expect(screen.getByText('Bellanco')).toBeInTheDocument();
    expect(screen.getByText('Dispatch')).toBeInTheDocument();
  });

  it('does not render review field', () => {
    const { container } = render(<FeedCard card={card} {...handlers} />);
    expect(container.textContent).not.toContain('review');
  });

  it('does not render score or hours', () => {
    const { container } = render(<FeedCard card={card} {...handlers} />);
    expect(container.innerHTML).not.toContain('score');
    expect(container.innerHTML).not.toContain('hours');
  });

  it('calls onReadMore when Read more is clicked', () => {
    const onReadMore = vi.fn();
    render(<FeedCard card={card} onReadMore={onReadMore} {...otherHandlers} />);
    fireEvent.click(screen.getByText(/read more/i));
    expect(onReadMore).toHaveBeenCalledWith(card);
  });

  it('has correct aria-label', () => {
    render(<FeedCard card={card} {...handlers} />);
    expect(
      screen.getByRole('article', { name: /review of dispatch by bellanco/i })
    ).toBeInTheDocument();
  });
});
```

## Constraints
- No component may import from `src/gist/`, `src/firebase/`, or `src/db/`.
- All data flows through ViewModel props.
- `FeedCard` and `GameCard` must have TypeScript compile errors if passed a
  full `Game` object (private fields must be structurally incompatible).
- Accessible color contrast ratio ≥ 4.5:1 for all text.
- All interactive elements have visible focus rings.
