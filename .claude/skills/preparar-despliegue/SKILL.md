---
name: preparar-despliegue
description: Comprueba que develop está lista para que el usuario cree una release y despliegue (checklist «Antes de desplegar» del README, cambios de reglas e índices desde la última etiqueta, CHANGELOG). No crea la release ni sube nada.
disable-model-invocation: true
---

Las releases las crea **el usuario**: esta skill solo comprueba y prepara. No crees ramas `release/`, no mergees a
`master`, no etiquetes, no hagas push y no subas la versión de `package.json` salvo que el usuario lo pida
expresamente en esta misma petición.

## 1. Qué sale en esta versión

```bash
git describe --tags --abbrev=0                          # última release
git log --oneline <última>..HEAD                        # lo que entra
git diff --stat <última>..HEAD -- firestore.rules firestore.indexes.json functions/ wrangler.toml public/_headers public/_redirects
```

- Si cambian `firestore.rules` o `firestore.indexes.json`, el despliegue de Pages **no** los aplica: hace falta
  `firebase deploy --only firestore:rules,firestore:indexes` (lo lanza el usuario; los índices que ya no estén en el
  fichero se borran). Comprueba en la memoria si algunas reglas ya se desplegaron antes que el cliente.
- Si cambia `public/_headers` (CSP) o un script inline de `index.html`, revisa que el hash de la CSP siga casando.
- Si cambia `public/_redirects`, debe seguir siendo par de `src/core/constants/routes.ts`.
- Si cambia `wrangler.toml` o aparecen secretos nuevos en `functions/`, avisa: los secretos van con
  `npx wrangler pages secret put` y los pone el usuario.

## 2. CHANGELOG

`[Unreleased]` debe recoger todo lo que entra, en el estilo de las entradas anteriores (español, en negrita la
frase que resume y luego el detalle para el usuario final). Señala lo que falte; no cierres la sección ni pongas
número de versión.

## 3. Suite, en este orden y cada comando en su propia llamada

`npm run build` → `npm run typecheck` → `npm run validate` → `npm test` → `npm run test:rules` (JDK 21+) →
`npm run test:e2e`. El `build` va primero porque `validate` mide el `dist` y `test:e2e` no construye. Lee cada salida
entera; nada de `| grep` que esconda un rojo.

`npm run audit:rules` lee producción con credenciales de `firebase-admin` (ver la cabecera del script): si no hay
credenciales en esta máquina, dilo y deja que lo lance el usuario. Es obligatorio antes de desplegar reglas.

## 4. Informe

Una lista corta para el usuario: qué entra, qué hay que desplegar aparte (reglas, índices, secretos), estado de cada
comando (verde/rojo con el error) y qué falta en el CHANGELOG. Termina recordando la «Checklist post-deploy» del
README, sobre todo `npm run audit:deploy` contra el dominio.
