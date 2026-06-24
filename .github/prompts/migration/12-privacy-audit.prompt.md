# Prompt 12 — Privacy audit

> Adaptado al stack real (rutas `src/model/repository/`, `src/viewmodel/` · scripts node como `scripts/ci-validate.js`). Diseño destino conservado.
>
> **Punto de partida real:** no existe `scripts/audit-privacy.ts` ni el script npm `audit:privacy` (los crea este paso).
> El I/O de gist vive en `gistRepository.ts`, el de Firestore en `firebaseRepository.ts`, los ViewModels en `src/viewmodel/`.
> `localStorage` **sí** se usa legítimamente en `localRepository.ts` (fallback offline-first), así que solo es violación fuera de ahí.

## Prerequisites
Prompts 01–11 completos.

## Task
Auditoría estática del código que detecte cualquier fuga de datos privados a canales públicos. Genera un informe y falla en violaciones críticas.

## Output files (rutas reales)
- `scripts/audit-privacy.js`        — script node ejecutable (estilo `scripts/ci-validate.js`; sin dep nueva `tsx`)
- `tests/unit/privacy-audit.test.ts`

---

## Qué cuenta como violación

### Categoría A — Crítica (bloquea migración)
Un campo de la lista aparece en un objeto que se escribe en:
- el gist social (`myGameList.social.json` / `myGameList.social-chunk-N.json`),
- cualquier colección de Firestore distinta de `privateConfig`,
- cualquier cuerpo de respuesta HTTP enviado a un no-dueño.

Campos prohibidos: `review`, `score`, `hours`, `steamDeck`, `retry`, `replayable`, `uid`, `email`, `githubToken`, `gamesGistId`.

### Categoría B — Aviso (corregir antes de release)
- `snippet` computado dentro de un ViewModel (debe estar solo en `toPublicGame`, `gistRepository.ts`).
- `fetch('https://api.github.com')` directo fuera de `gistRepository.ts`.
- `setDoc` / `updateDoc` / `addDoc` fuera de `firebaseRepository.ts`.
- `localStorage.setItem` **fuera de** `localRepository.ts` (ahí es legítimo).
- `console.log` que pueda imprimir token o uid.

### Categoría C — Info (documentar, no bloquea)
- `TODO`/`FIXME` relacionados con sync o privacidad.
- `as any` en funciones que manejan datos de juego.

---

## `scripts/audit-privacy.js`
Script node (ESM, sin app construida). Debe:
1. Escanear recursivamente `.ts`/`.tsx` bajo `src/`.
2. Categoría A: localizar literales de objeto y llamadas `set()/update()/PATCH` con un campo prohibido como clave,
   en módulos que escriben a Firestore o al gist social.
3. Categoría B (regex), con rutas reales:
```js
const B_PATTERNS = [
  { pattern: /snippet\s*[:=]/g,                    file: /ViewModel\.ts$/,         message: 'snippet computado en ViewModel' },
  { pattern: /fetch\(['"]https:\/\/api\.github/g,  notFile: /gistRepository/,      message: 'API de Gist fuera de gistRepository' },
  { pattern: /setDoc|updateDoc|addDoc/g,           notFile: /firebaseRepository/,  message: 'escritura a Firestore fuera de firebaseRepository' },
  { pattern: /localStorage\.setItem/g,             notFile: /localRepository/,     message: 'localStorage fuera de localRepository' },
  { pattern: /console\.log.*(token|uid)/gi,                                         message: 'posible fuga de token/uid en console.log' },
];
```
4. Volcar `audit-report.json`: `{ runAt, summary:{ critical, warnings, info }, violations:[{ category, file, line, field, context, message }] }`.
5. Exit 1 si hay alguna violación A; exit 0 si solo B/C (imprimiéndolas igual).

Añadir el script npm (lo formaliza el paso 15):
```json
"audit:privacy": "node scripts/audit-privacy.js"
```

## `tests/unit/privacy-audit.test.ts`
Tests de la lógica del auditor (rutas reales):
```ts
describe('detectForbiddenFields', () => {
  it('marca score en objeto a setDoc', () => {
    const v = detectForbiddenFields(`setDoc(ref, { profileId:'x', score:5 })`, 'test.ts');
    expect(v[0].field).toBe('score'); expect(v[0].category).toBe('A');
  });
  it('no marca score en gistRepository (ruta de juegos, privado)', () => {
    expect(detectForbiddenFields(`const p = { score: game.score };`, 'src/model/repository/gistRepository.ts')).toHaveLength(0);
  });
  it('marca review en escritura del gist social', () => {
    const v = detectForbiddenFields(`writeSocialGist(id, { games: { 1: { review:'t' } } })`, 'src/model/repository/gistRepository.ts');
    expect(v[0].field).toBe('review');
  });
  it('marca snippet computado en ViewModel', () => {
    const w = detectPatternB(`const snippet = game.review.slice(0,160);`, 'src/viewmodel/useGameListViewModel.ts');
    expect(w[0].message).toContain('snippet computado en ViewModel');
  });
  it('marca fetch a GitHub fuera de gistRepository', () => {
    const w = detectPatternB(`fetch('https://api.github.com/gists/123')`, 'src/model/repository/syncRepository.ts');
    expect(w[0].message).toContain('API de Gist fuera de gistRepository');
  });
});
```

## Integración con CI
Añadir a `.github/workflows/ci.yml` (paso 15):
```yaml
- name: Privacy audit
  run: npm run audit:privacy   # falla en cualquier violación de Categoría A
```

## Constraints
- Análisis estático puro (sin construir la app).
- Sin falsos positivos en comentarios (`// score: …` no dispara).
- Añadir `audit-report.json` a `.gitignore`.
- `npm run audit:privacy` debe existir tras el paso 15 y salir 0 en el código ya adaptado.
