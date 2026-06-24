# Prompt 14 — Social UI components

> Adaptado al stack real (React 19 / TS 6 / **SCSS, no Tailwind** / hooks). Diseño destino conservado.
>
> **Punto de partida real:** los componentes sociales viven en `src/view/components/socialhub/`
> (ya existen `SocialFeedScreen`, `SocialProfileScreen`, `SocialProfileDetailScreen`, `SocialDetailScreen`).
> Los ViewModels son **hooks** (`useSocialFeedViewModel`, `useUserProfileViewModel`), no clases.
> Los iconos usan `<Icon name="…" />`. Los ids de juego son `number`. No hay `src/components/social/`.

## Prerequisites
Prompts 01–13 completos.

## Task
Componentes de React para el hub social. Solo reciben datos de los ViewModels (hooks); nunca llaman a la API de gist ni a Firestore.

## Output files (rutas reales)
- `src/view/components/socialhub/FeedCard.tsx`
- `src/view/components/socialhub/FeedList.tsx`
- `src/view/components/socialhub/UserProfilePage.tsx`
- `src/view/components/socialhub/GameCard.tsx`
- `src/view/components/socialhub/GameGrid.tsx`
- `src/view/components/socialhub/AvatarHash.tsx`
- `src/view/components/socialhub/RatingBadge.tsx`
- `src/view/components/socialhub/SnippetText.tsx`
- `tests/unit/FeedCard.test.tsx`
- estilos en `src/styles/_social.scss` (importado en `index.scss`)

## Contrato de datos
Los componentes reciben `FirestoreFeedCard` o `PublicGame`. **Nunca** un `GameItem` (que tiene campos privados).
Forzar con TypeScript: pasar un `GameItem` donde se espera `FirestoreFeedCard`/`PublicGame` debe dar **error de compilación**
(los campos privados son estructuralmente incompatibles).

## `AvatarHash.tsx`
```tsx
interface AvatarHashProps { hash: string; displayName: string; size: 'sm'|'md'|'lg'; }
```
Color e iniciales deterministas desde el hash; nunca descarga imagen de red.
```ts
const hashToColor = (h: string) => `hsl(${parseInt(h.slice(0,6),16)%360}, 60%, 45%)`;
const hashToInitials = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
```

## `RatingBadge.tsx`
```tsx
interface RatingBadgeProps { rating: number; size: 'sm'|'md'; }
```
Badge con estrellas (reutilizar `renderStars.ts` de `src/core/utils/`). 1–2 rojo, 3 ámbar, 4–5 verde. `aria-label="Valoración: {rating} de 5"`.

## `SnippetText.tsx`
```tsx
interface SnippetTextProps { snippet: string; hasFullReview: boolean; onReadMore?: () => void; }
```
Muestra el snippet (≤160, nunca review completo). Si `hasFullReview`, enlace "Leer más" que llama `onReadMore` (no descarga nada).
Indicador visual sutil de que es un avance, no el texto completo.

## `FeedCard.tsx`
```tsx
interface FeedCardProps {
  card: FirestoreFeedCard;
  onProfileClick: (profileId: string) => void;
  onGameClick: (gameId: number, socialGistId: string) => void;
  onReadMore: (card: FirestoreFeedCard) => void;
  isOwn: boolean;
}
```
Usa `<AvatarHash>`, `<RatingBadge>`, `<SnippetText>`. "Hace X días" con función pura (sin librería).
Avatar/nombre → `onProfileClick(card.profileId)`; nombre del juego → `onGameClick(card.gameId, card.socialGistId)`.
Si `isOwn`, icono "Editar". `role="article"`, `aria-label="Reseña de {gameName} por {displayName}"`.
**Nunca** renderiza `score`, `hours`, `review` ni ningún campo privado.

## `FeedList.tsx`
```tsx
interface FeedListProps { vm: ReturnType<typeof useSocialFeedViewModel>; }
```
Lista de `<FeedCard>`; scroll infinito con `IntersectionObserver` sobre un centinela; skeleton en la primera carga;
spinner "Cargar más" si `loadingMore`; estado vacío "Aún no hay reseñas"; aviso de error vía `StatusNotice` si `vm.state.error`.

## `GameCard.tsx`
```tsx
interface GameCardProps { game: PublicGame; onGameClick: (gameId: number) => void; showSnippet: boolean; }
```
Badge de pestaña (`TabId`) con las etiquetas reales: `c`=Completado (verde), `v`=En curso (azul), `e`=Excluido (rojo), `p`=Pendiente (gris).
**No** muestra `score`, `hours`, `steamDeck`, `retry` ni `replayable`.

## `GameGrid.tsx`
```tsx
interface GameGridProps { vm: ReturnType<typeof useUserProfileViewModel>; filterTab: TabId | 'all'; }
```
Grid responsive de `<GameCard>`; filtra por `filterTab` en cliente (datos ya cargados); botón "Cargar más juegos" si `vm.state.hasMoreChunks` → `vm.loadMoreGames()`.

## `UserProfilePage.tsx`
```tsx
interface UserProfilePageProps { profileId: string; socialGistId: string; }
```
Secciones: (1) cabecera con `<AvatarHash>`, nombre, stats; (2) tabs "Juegos" | "Reseñas"; (3) `<GameGrid>` con filtros por `TabId`;
(4) reseñas como mini `<FeedCard>` desde `ActivityFeedItem`; (5) favoritos (scroll horizontal de `<GameCard>`).
Carga con `useUserProfileViewModel().load(profileId, socialGistId)`; skeleton mientras carga; si `isOwnProfile`, botón "Editar perfil".

## `tests/unit/FeedCard.test.tsx`
- Renderiza nombre y juego; **no** renderiza `review`/`score`/`hours`; llama `onReadMore(card)` al pulsar "Leer más"; `aria-label` correcto.

## Constraints
- Ningún componente importa de `src/model/repository/` directamente: los datos llegan por props desde los hooks ViewModel.
- `FeedCard`/`GameCard` deben dar error de tipos si reciben un `GameItem`.
- Contraste ≥ 4.5:1; focus rings visibles; jsx-a11y (ESLint) en verde.
- Estilos en `_social.scss` (SCSS), **sin Tailwind**.
- `tsc --noEmit` y `npm run test` deben pasar tras este paso.
