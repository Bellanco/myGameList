import { TAB_IDS, type GameItem } from '../types/game';
import type { LocalMeta } from '../types/local';
import { getLocalMeta, patchLocalMeta, putDeletedRecord, putGameRecord } from './indexedDbRepository';
import { loadLocalStateAsync } from './localRepository';
import { getSyncConfig } from './gistRepository';

/**
 * Runner de migración one-time (Vía A: LOCAL, sin Google).
 *
 * ⚠️ INERTE: no está cableado en el arranque; se invoca explícitamente cuando se decida cablear (paso 11),
 * y tras probar. Soporta `dryRun` (no escribe). Es **idempotente** (guardado por `migrationVersion`) y
 * **NO destructivo**: nunca borra `appState`/localStorage; solo PREPARA el store `games` (v3) en paralelo,
 * de modo que la app actual sigue funcionando contra `appState` durante toda la transición.
 *
 * La Vía B (Firestore/social: profileId, backup de token cifrado) vive en `firebaseRepository.ts`
 * (`backupGithubToken`, etc.) y solo aplica con sesión Google; aquí no se fuerza el login.
 */

const TARGET_MIGRATION_VERSION = 3;

export interface MigrationResult {
  skipped: boolean;
  gamesImported: number;
  dryRun: boolean;
  errors: string[];
}

export async function isMigrationNeeded(): Promise<boolean> {
  const meta = await getLocalMeta();
  return (meta?.migrationVersion ?? 0) < TARGET_MIGRATION_VERSION;
}

export async function runMigration(options: { dryRun?: boolean } = {}): Promise<MigrationResult> {
  const dryRun = options.dryRun ?? false;
  const errors: string[] = [];

  if (!(await isMigrationNeeded())) {
    return { skipped: true, gamesImported: 0, dryRun, errors };
  }

  let gamesImported = 0;

  try {
    // Fuente de verdad actual: el payload combinado de localStorage + IndexedDB (appState).
    const { payload } = await loadLocalStateAsync();

    for (const tab of TAB_IDS) {
      const list = (payload[tab] || []) as GameItem[];
      for (const game of list) {
        if (!game || !(Number(game.id) > 0)) continue;
        gamesImported += 1;
        if (!dryRun) {
          await putGameRecord(game, tab);
        }
      }
    }

    // Migrar también los tombstones (borrados) al store `deleted`.
    if (!dryRun) {
      for (const tomb of payload.deleted || []) {
        if (!tomb || !(Number(tomb.id) > 0)) continue;
        const ts = Number(tomb._ts) || 0;
        await putDeletedRecord({ id: tomb.id, _ts: ts, deletedAt: ts });
      }
    }

    if (!dryRun) {
      // Sembrar LocalMeta con lo que tengamos sin Google (gistId/token desde SyncConfig) y marcar versión.
      const cfg = getSyncConfig();
      const patch: Partial<LocalMeta> = { migrationVersion: TARGET_MIGRATION_VERSION, gamesUpdatedAt: payload.updatedAt };
      if (cfg) {
        patch.gamesGistId = cfg.gistId;
        patch.githubToken = cfg.token;
        patch.gamesEtag = cfg.etag;
      }
      await patchLocalMeta(patch);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return { skipped: false, gamesImported, dryRun, errors };
}
