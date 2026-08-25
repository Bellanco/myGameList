/**
 * Herramientas de diagnóstico de FECHAS DE RESEÑA, solo para desarrollo.
 *
 * Se lanzan desde la consola del navegador. Existen porque el feed, la pestaña Reseñas y el gist social pueden
 * discrepar en la fecha de una misma reseña, y averiguar por qué exige mirar a la vez el historial de revisiones
 * del gist, la caché del directorio y los sellos locales: nada de eso se ve desde la interfaz.
 *
 * POR QUÉ ESTÁ EN SU PROPIO FICHERO: esto vivía dentro de `main.tsx`, en tres bloques `import.meta.env.DEV`
 * seguidos que sumaban más de la mitad del punto de entrada de la aplicación —y con tres copias del mismo
 * ayudante de formato—. No pesaba en producción (el bundler se lleva por delante lo que cuelga de un `DEV` falso),
 * pero el fichero que arranca la app dedicaba más líneas a depurar fechas que a arrancarla. Aquí es un módulo que
 * `main.tsx` carga con un solo `import()` dinámico, así que sigue sin entrar en producción y deja de estorbar.
 *
 * Para añadir una herramienta nueva: exportarla abajo y registrarla en `installSocialDateTools`.
 */
import {
  auditPublishedReviewDates,
  inspectReviewDates,
  repairUndatedHistoryDates,
} from '../model/repository/socialActivityHistory';

/**
 * Instante legible (`AAAA-MM-DD hh:mm`), o un guion si no hay fecha.
 *
 * Único para las tres herramientas: había una copia por bloque y solo la tercera trataba el 0, así que las otras
 * dos pintaban «1970-01-01 00:00» donde no había fecha en absoluto.
 */
const fecha = (ms: number): string => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '—');

/** Mensaje común cuando no hay con qué trabajar en este dispositivo. */
const SIN_CANAL = '[social] sin sesión de Google o sin canal social en este dispositivo';

/**
 * Audita, SIN ESCRIBIR NADA, qué fechas de publicación de mis reseñas sobreviven en el historial de revisiones
 * del gist social. `__socialDateAudit()`.
 */
async function auditarFechas(options?: { maxRevisions?: number }): Promise<unknown> {
  const report = await auditPublishedReviewDates(options);
  if (!report) {
    console.warn(`${SIN_CANAL} (auditoría)`);
    return null;
  }
  console.warn(
    `[social] auditoría de fechas — gist ${report.gistId}: ${report.publishedNow} reseñas publicadas, ` +
      `${report.scannedRevisions}/${report.totalRevisions} revisiones recorridas → ` +
      `${report.recoverable.length} con fecha original recuperable, ${report.withoutOlderDate} sin fecha anterior`,
  );
  report.inspected.forEach((gist) => {
    console.warn(
      `   gist ${gist.gistId.slice(0, 10)}${gist.isCurrent ? ' (ACTUAL)' : ' (abandonado)'}: ` +
        `${gist.scannedRevisions}/${gist.revisions} revisiones, ${gist.reviewEntries} reseñas vistas, ` +
        `más antigua ${gist.oldestDate ? fecha(gist.oldestDate) : '—'}`,
    );
  });
  console.warn('   día        | en el gist | en el listado');
  report.datesByDay.forEach((row) => {
    console.warn(`   ${row.day} | ${String(row.enGist).padStart(10)} | ${String(row.enListado).padStart(13)}`);
  });
  report.recoverable.forEach((item) => {
    console.warn(
      `   ${item.gameName}: ${fecha(item.currentUpdatedAt)} → ${fecha(item.originalUpdatedAt)} ` +
        `(gist ${item.fromGistId.slice(0, 10)}, rev ${item.fromRevision.slice(0, 8)})`,
    );
  });
  return report;
}

/**
 * Reasigna a una fecha ancla el histórico de reseñas que se publicó con un `_ts` sellado en bloque (importación
 * o sobrescritura), dejando intactas las publicadas en su día.
 *
 * SIMULACRO POR DEFECTO: `__socialFixHistoryDates({ date: '2026-05-12' })` no escribe nada; hay que pedirlo
 * explícitamente con `apply: true`.
 */
async function repararFechasHistoricas(options: { date: string; apply?: boolean }): Promise<unknown> {
  const plan = await repairUndatedHistoryDates(options);
  if (!plan) {
    console.warn(SIN_CANAL);
    return null;
  }
  console.warn(
    `[social] histórico ${plan.applied ? 'REASIGNADO' : '(simulacro, sin escribir)'} a ${options.date}: ` +
      `${plan.toMove.length} entradas se mueven, ${plan.keeping.length} conservan su fecha. ` +
      `Días sellados en bloque detectados: ${plan.bulkDays.join(', ') || 'ninguno'}`,
  );
  plan.keeping
    .slice()
    .sort((a, b) => a.date - b.date)
    .forEach((item) => console.warn(`   conserva  ${fecha(item.date)}  ${item.gameName}`));
  return plan;
}

/**
 * Por qué el feed y la pestaña Reseñas pueden mostrar fechas distintas: compara la fecha publicada en el gist con
 * la de la caché del directorio (que es lo que sirve el hub) y con los sellos locales. `__socialReviewDates()`.
 */
async function compararFechasDeResena(): Promise<unknown> {
  const report = await inspectReviewDates();
  if (!report) {
    console.warn(SIN_CANAL);
    return null;
  }
  console.warn(
    `[social] fechas de reseña — gist ${report.gistId}: ${report.rows.length} publicadas | ` +
      `entrada propia en la caché del directorio: ${report.cacheEntryFound ? 'sí' : 'NO'} ` +
      `(${report.cacheActivityCount} actividades) | discrepancias gist vs caché: ${report.mismatchesGistVsCache}`,
  );
  console.warn('   juego | en gist | en caché | _ts local | reviewedAt');
  report.rows.slice(0, 12).forEach((row) => {
    console.warn(
      `   ${row.gameName} | ${fecha(row.enGist)} | ${fecha(row.enCache)} | ${fecha(row.ts)} | ${fecha(row.reviewedAt)}`,
    );
  });
  return report;
}

/** Superficie que estas herramientas cuelgan de `window`. Nombrada para no repetir el `as unknown as` en cada una. */
interface VentanaConHerramientas {
  __socialDateAudit?: typeof auditarFechas;
  __socialFixHistoryDates?: typeof repararFechasHistoricas;
  __socialReviewDates?: typeof compararFechasDeResena;
}

/** Cuelga las tres herramientas de `window`. Lo llama `main.tsx` únicamente en desarrollo. */
export function installSocialDateTools(): void {
  const ventana = window as unknown as VentanaConHerramientas;
  ventana.__socialDateAudit = auditarFechas;
  ventana.__socialFixHistoryDates = repararFechasHistoricas;
  ventana.__socialReviewDates = compararFechasDeResena;
  console.warn(
    '[dev] herramientas de fechas sociales listas: __socialDateAudit(), __socialFixHistoryDates({ date }), __socialReviewDates()',
  );
}
