# Prompt 10 — Firestore Security Rules

> Adaptado al stack real (Firebase v12 · Vitest · colección real `profiles`). Diseño destino conservado.
>
> **Punto de partida real:** hoy **no existe** `firestore.rules` ni emulador en el repo, y la colección real
> de perfiles se llama **`profiles`** (doc id = uid, hoy con campos sensibles). Este paso CREA las reglas que
> hacen cumplir el modelo index-only y el snippet split, renombrando el acceso público a `profiles/{profileId}`.
> `@firebase/rules-unit-testing` y `firebase-tools` son **dependencias nuevas** — confirmar antes de instalar.

## Prerequisites
Prompts 01–05 completos. Aquí no hay TypeScript de app: sintaxis de Firestore Rules + un test con el emulador.

## Output files
- `firestore.rules` (raíz)
- `tests/unit/firestore.rules.test.ts`
- `firebase.json` (config del emulador, raíz)

---

## `firestore.rules`
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // userMap/{uid} — mapa uid→profileId. Nunca legible por clientes.
    match /userMap/{uid} { allow read, write: if false; }

    // privateConfig/{uid} — ids de gist + chunks (SIN token). Solo el dueño.
    match /privateConfig/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // profiles/{profileId} — índice público (index-only)
    match /profiles/{profileId} {
      allow read:   if isPublicProfile() && consentNotExpired();
      allow create: if isOwner(profileId) && noPrivateFields(request.resource.data) && hasRequiredProfileFields(request.resource.data);
      allow update: if isOwner(profileId) && noPrivateFields(request.resource.data);
      allow delete: if isOwner(profileId);
    }

    // feed/{reviewId} — tarjetas públicas del feed
    match /feed/{reviewId} {
      allow read:   if resource.data.status == 'active' && resource.data.expiresAt > request.time.toMillis();
      allow create: if isOwner(reviewId.split(':')[0]) && noPrivateFields(request.resource.data) && snippetLength(request.resource.data) && noReviewField(request.resource.data) && validFeedCard(request.resource.data);
      allow update: if isOwner(reviewId.split(':')[0]) && noPrivateFields(request.resource.data) && noReviewField(request.resource.data);
      allow delete: if isOwner(reviewId.split(':')[0]);
    }

    // recommendations/{id} — entrega por email entre usuarios autenticados
    match /recommendations/{id} {
      allow read:   if request.auth != null;
      allow create: if request.auth != null && noReviewField(request.resource.data);
      allow update, delete: if request.auth != null;
    }

    function isOwner(profileId) {
      return request.auth != null
          && get(/databases/$(database)/documents/userMap/$(request.auth.uid)).data.profileId == profileId;
    }
    function isPublicProfile()  { return resource.data.private == false; }
    function consentNotExpired(){ return resource.data.consent.autoExpireAt > request.time.toMillis(); }
    function noPrivateFields(d) {
      return !('uid' in d) && !('email' in d) && !('githubToken' in d) && !('gamesGistId' in d)
          && !('score' in d) && !('hours' in d) && !('steamDeck' in d) && !('retry' in d) && !('replayable' in d);
    }
    function noReviewField(d) { return !('review' in d); }
    function snippetLength(d) { return !('snippet' in d) || d.snippet.size() <= 200; }
    function hasRequiredProfileFields(d) { return 'profileId' in d && 'displayName' in d && 'socialGistId' in d && 'updatedAt' in d; }
    function validFeedCard(d) { return 'profileId' in d && 'gameId' in d && 'gameName' in d && 'rating' in d && 'snippet' in d && 'status' in d && 'createdAt' in d && 'expiresAt' in d; }
  }
}
```

---

## `tests/unit/firestore.rules.test.ts`
`@firebase/rules-unit-testing` v2. Un grupo por ruta. `Date.now()` es válido en tests.
```ts
import { initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs'; import { resolve } from 'path';
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mi-lista-test',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
  });
});
afterEach(async () => { await env.clearFirestore(); });
afterAll(async () => { await env.cleanup(); });
```
Cubrir como mínimo:
- **userMap**: lectura/escritura denegadas incluso autenticado.
- **privateConfig**: el dueño lee/escribe; otro autenticado y el anónimo, denegados.
- **profiles**: lectura pública si `private==false` y consentimiento vigente; denegada si privado o consentimiento caducado; escritura con `githubToken`/`uid`/`review`/`score` denegada.
- **feed**: lectura anónima de tarjeta `active` no caducada; oculta denegada; create con `snippet>200`, con `review` o con `score` denegado.

(Reutilizar el patrón `withSecurityRulesDisabled` para sembrar datos y `authenticatedContext('uid')` para las escrituras.)

## Constraints
- Todos los tests pasan contra el `firestore.rules` generado.
- Ejecutar con `firebase emulators:exec "vitest run tests/unit/firestore.rules.test.ts"` (el script `test:rules` se añade en el paso 15).
- `firebase.json` con la config de emuladores en la raíz.
- Reglas desplegables con `firebase deploy --only firestore:rules`.
- Confirmar con el usuario antes de instalar `@firebase/rules-unit-testing` / `firebase-tools`.
