// F5 — LAS LÍNEAS BASE DEL FEED DE LOGROS. Ver docs/plan-logros.md §5.4 y §8.4, y `achievementFeedEntries`.
//
// Una por persona (`uid → espejo`), guardada en `LocalMeta` y tomada la PRIMERA vez que este dispositivo ve su
// espejo. Lo que ya estaba en esa foto no se anuncia nunca; lo que aparece después, sí, en su día.
import { useEffect, useState } from 'react';
import { getLocalMeta, seedAchievementsPeerSeen } from '../../model/repository/indexedDbRepository';

export interface AchievementBaselineSource {
  /** uid de Firebase: es estable, al contrario que el `profileId` del directorio, que puede quedar desfasado. */
  key: string;
  mirror: string;
}

/**
 * Carga las líneas base y SIEMBRA las que falten con el espejo que se ve ahora.
 *
 * Devuelve `null` mientras no se han leído: quien pinte el feed no debe enseñar logros hasta entonces, o saldría un
 * anuncio que se retira un instante después. Y una fuente sin línea base todavía tampoco se anuncia: es su primera
 * foto, que se siembra y calla (§8.4).
 *
 * `keep` poda las líneas base de quien ya no está. Solo con el grafo de amistad RESUELTO: pasar `null` mientras
 * carga, porque un grafo a medio cargar está vacío y podar contra él lo borraría todo.
 */
export function useAchievementBaselines(
  sources: readonly AchievementBaselineSource[],
  keep: ReadonlySet<string> | null,
): Readonly<Record<string, string>> | null {
  const [seen, setSeen] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLocalMeta().then((meta) => {
      if (!cancelled) setSeen(meta?.achievementsPeerSeen || {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!seen) return;
    const additions: Record<string, string> = {};
    for (const source of sources) {
      if (source.key && source.mirror && seen[source.key] === undefined) additions[source.key] = source.mirror;
    }
    const prune = Boolean(keep) && Object.keys(seen).some((key) => !keep!.has(key));
    if (Object.keys(additions).length === 0 && !prune) return;

    let cancelled = false;
    void seedAchievementsPeerSeen(additions, keep ?? undefined)
      .then((next) => {
        if (!cancelled) setSeen(next);
      })
      .catch(() => {
        // Sin IndexedDB, la siembra vale para la sesión: en la próxima, la primera pasada vuelve a callar, que es
        // lo seguro. Lo que ya estaba gana, igual que en la escritura.
        if (!cancelled) setSeen((previous) => ({ ...additions, ...previous }));
      });
    return () => {
      cancelled = true;
    };
  }, [seen, sources, keep]);

  return seen;
}
