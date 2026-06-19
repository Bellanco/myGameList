# Prompt 10 — Firestore Security Rules

## Prerequisites
Prompts 01–05 complete. No TypeScript here — pure Firestore Rules syntax.

## Task
Generate the complete `firestore.rules` file and a companion
`firestore.rules.test.ts` that validates every rule using the
Firebase Rules Unit Testing library (`@firebase/rules-unit-testing`).

## Output files
- `firestore.rules`
- `src/__tests__/firestore.rules.test.ts`

---

## `firestore.rules`

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── /userMap/{uid} ──────────────────────────────────────────────────
    // Maps Firebase uid → profileId. Never readable by clients.
    match /userMap/{uid} {
      allow read, write: if false;
    }

    // ── /privateConfig/{uid} ────────────────────────────────────────────
    // Contains gamesGistId, socialGistId, chunk maps.
    // ONLY the authenticated owner can read or write.
    match /privateConfig/{uid} {
      allow read, write: if request.auth != null
                         && request.auth.uid == uid;
    }

    // ── /users/{profileId} ──────────────────────────────────────────────
    match /users/{profileId} {
      allow read: if isPublicProfile()
                  && consentNotExpired();

      allow create: if isOwner(profileId)
                    && noPrivateFields(request.resource.data)
                    && hasRequiredProfileFields(request.resource.data);

      allow update: if isOwner(profileId)
                    && noPrivateFields(request.resource.data);

      allow delete: if isOwner(profileId);

      // ── /users/{profileId}/games/{gameId} ─────────────────────────────
      match /games/{gameId} {
        allow read: if parentIsPublic(profileId)
                    && consentNotExpired();

        allow create, update: if isOwner(profileId)
                              && noPrivateFields(request.resource.data)
                              && snippetLength(request.resource.data)
                              && noReviewField(request.resource.data);

        allow delete: if isOwner(profileId);
      }
    }

    // ── /feed/{reviewId} ────────────────────────────────────────────────
    match /feed/{reviewId} {
      allow read: if resource.data.status == 'active'
                  && resource.data.expiresAt > request.time.toMillis();

      allow create: if isOwner(reviewId.split(':')[0])
                    && noPrivateFields(request.resource.data)
                    && snippetLength(request.resource.data)
                    && noReviewField(request.resource.data)
                    && validFeedCard(request.resource.data);

      allow update: if isOwner(reviewId.split(':')[0])
                    && noPrivateFields(request.resource.data)
                    && noReviewField(request.resource.data);

      allow delete: if isOwner(reviewId.split(':')[0]);
    }

    // ── Helper functions ─────────────────────────────────────────────────

    function isOwner(profileId) {
      return request.auth != null
          && get(/databases/$(database)/documents/userMap/$(request.auth.uid))
               .data.profileId == profileId;
    }

    function isPublicProfile() {
      return resource.data.private == false;
    }

    function consentNotExpired() {
      return resource.data.consent.autoExpireAt > request.time.toMillis();
    }

    function parentIsPublic(profileId) {
      let parent = get(/databases/$(database)/documents/users/$(profileId));
      return parent.data.private == false
          && parent.data.consent.autoExpireAt > request.time.toMillis();
    }

    function noPrivateFields(data) {
      return !('uid'          in data)
          && !('email'        in data)
          && !('githubToken'  in data)
          && !('gamesGistId'  in data)
          && !('score'        in data)
          && !('hours'        in data)
          && !('steamDeck'    in data)
          && !('retry'        in data)
          && !('replayable'   in data)
          && !('photoURL'     in data);
    }

    function noReviewField(data) {
      return !('review' in data);
    }

    function snippetLength(data) {
      return !('snippet' in data) || data.snippet.size() <= 200;
    }

    function hasRequiredProfileFields(data) {
      return 'profileId'    in data
          && 'displayName'  in data
          && 'socialGistId' in data
          && 'updatedAt'    in data;
    }

    function validFeedCard(data) {
      return 'profileId'   in data
          && 'gameId'      in data
          && 'gameName'    in data
          && 'rating'      in data
          && 'snippet'     in data
          && 'status'      in data
          && 'createdAt'   in data
          && 'expiresAt'   in data;
    }
  }
}
```

---

## `src/__tests__/firestore.rules.test.ts`

Use `@firebase/rules-unit-testing` v2. Each test group covers one rule path.

```ts
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mi-lista-test',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});

afterEach(async () => { await env.clearFirestore(); });
afterAll(async () => { await env.cleanup(); });
```

### /userMap tests

```ts
describe('/userMap', () => {
  it('denies read for authenticated user', async () => {
    const db = env.authenticatedContext('user-123').firestore();
    await assertFails(db.collection('userMap').doc('user-123').get());
  });

  it('denies write for authenticated user', async () => {
    const db = env.authenticatedContext('user-123').firestore();
    await assertFails(
      db.collection('userMap').doc('user-123').set({ profileId: 'p-123' })
    );
  });
});
```

### /privateConfig tests

```ts
describe('/privateConfig', () => {
  it('allows owner to read', async () => {
    const db = env.authenticatedContext('user-abc').firestore();
    await env.withSecurityRulesDisabled(ctx =>
      ctx.firestore().collection('privateConfig').doc('user-abc').set({
        profileId: 'p-abc', gamesGistId: 'g1', socialGistId: 'g2'
      })
    );
    await assertSucceeds(db.collection('privateConfig').doc('user-abc').get());
  });

  it('denies read by other authenticated user', async () => {
    const db = env.authenticatedContext('user-xyz').firestore();
    await assertFails(db.collection('privateConfig').doc('user-abc').get());
  });

  it('denies unauthenticated read', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(db.collection('privateConfig').doc('user-abc').get());
  });
});
```

### /users tests

```ts
describe('/users', () => {
  const PUBLIC_USER = {
    profileId: 'p-abc',
    displayName: 'Bellanco',
    socialGistId: 'g123',
    private: false,
    consent: { autoExpireAt: Date.now() + 86400000 },
    updatedAt: Date.now(),
  };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(ctx =>
      ctx.firestore().collection('users').doc('p-abc').set(PUBLIC_USER)
    );
    // Set up userMap for owner checks
    await env.withSecurityRulesDisabled(ctx =>
      ctx.firestore().collection('userMap').doc('user-abc').set({ profileId: 'p-abc' })
    );
  });

  it('allows public read of non-private profile', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(db.collection('users').doc('p-abc').get());
  });

  it('denies read of private profile', async () => {
    await env.withSecurityRulesDisabled(ctx =>
      ctx.firestore().collection('users').doc('p-private').set({
        ...PUBLIC_USER, profileId: 'p-private', private: true
      })
    );
    const db = env.unauthenticatedContext().firestore();
    await assertFails(db.collection('users').doc('p-private').get());
  });

  it('denies read when consent expired', async () => {
    await env.withSecurityRulesDisabled(ctx =>
      ctx.firestore().collection('users').doc('p-expired').set({
        ...PUBLIC_USER,
        profileId: 'p-expired',
        consent: { autoExpireAt: Date.now() - 1000 },
      })
    );
    const db = env.unauthenticatedContext().firestore();
    await assertFails(db.collection('users').doc('p-expired').get());
  });

  it('denies write with private fields', async () => {
    const db = env.authenticatedContext('user-abc').firestore();
    await assertFails(
      db.collection('users').doc('p-abc').update({ githubToken: 'secret' })
    );
  });

  it('denies write with uid field', async () => {
    const db = env.authenticatedContext('user-abc').firestore();
    await assertFails(
      db.collection('users').doc('p-abc').update({ uid: 'user-abc' })
    );
  });

  it('denies write with review field', async () => {
    const db = env.authenticatedContext('user-abc').firestore();
    await assertFails(
      db.collection('users').doc('p-abc').update({ review: 'full text' })
    );
  });
});
```

### /feed tests

```ts
describe('/feed', () => {
  const VALID_CARD = {
    reviewId:    'p-abc12:game-id:review',
    profileId:   'p-abc',
    displayName: 'Bellanco',
    avatarHash:  'abc123',
    socialGistId:'g123',
    gameId:      'game-id',
    gameName:    'Dispatch',
    genres:      ['Aventura gráfica'],
    rating:      5,
    snippet:     'Short snippet under 160 chars',
    status:      'active',
    createdAt:   Date.now(),
    updatedAt:   Date.now(),
    expiresAt:   Date.now() + 86400000 * 365,
  };

  it('allows unauthenticated read of active, non-expired card', async () => {
    await env.withSecurityRulesDisabled(ctx =>
      ctx.firestore().collection('feed').doc('p-abc12:game-id:review').set(VALID_CARD)
    );
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(
      db.collection('feed').doc('p-abc12:game-id:review').get()
    );
  });

  it('denies read of hidden card', async () => {
    await env.withSecurityRulesDisabled(ctx =>
      ctx.firestore().collection('feed').doc('hidden-card').set({
        ...VALID_CARD, status: 'hidden'
      })
    );
    const db = env.unauthenticatedContext().firestore();
    await assertFails(db.collection('feed').doc('hidden-card').get());
  });

  it('denies create with snippet > 200 chars', async () => {
    const db = env.authenticatedContext('user-abc').firestore();
    await assertFails(
      db.collection('feed').doc('p-abc12:game-id:review').set({
        ...VALID_CARD, snippet: 'X'.repeat(201)
      })
    );
  });

  it('denies create with review field', async () => {
    const db = env.authenticatedContext('user-abc').firestore();
    await assertFails(
      db.collection('feed').doc('p-abc12:game-id:review').set({
        ...VALID_CARD, review: 'full review text'
      })
    );
  });

  it('denies create with score field', async () => {
    const db = env.authenticatedContext('user-abc').firestore();
    await assertFails(
      db.collection('feed').doc('p-abc12:game-id:review').set({
        ...VALID_CARD, score: 5
      })
    );
  });
});
```

## Constraints
- All tests must pass against the generated `firestore.rules` file.
- Run with `firebase emulators:exec "vitest run src/__tests__/firestore.rules.test.ts"`.
- Add a `firebase.json` emulators config to the project root.
- The rules file must be deployable via `firebase deploy --only firestore:rules`.
