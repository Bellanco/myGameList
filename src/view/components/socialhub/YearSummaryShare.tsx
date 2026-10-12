import { memo, useCallback, useEffect, useState } from 'react';
import { YEAR_SUMMARY_UI } from '../../../core/constants/yearSummaryLabels';
import type { YearSummary } from '../../../core/stats/yearSummary';
import { useYearShareViewModel, type YearShareViewModel } from '../../../viewmodel/useYearShareViewModel';
import type { YearSummarySignal } from '../../../viewmodel/social/useYearSummarySignal';
import '../../../styles/yearSummary.scss';

const S = YEAR_SUMMARY_UI.share;

/**
 * COMPARTIR TU RESUMEN DEL AÑO, al final del resumen y solo en temporada (del 15 de diciembre al 15 de enero, ver
 * docs/plan-resumen-del-ano.md). UN botón, el que toque (decisión del usuario, 12-10-2026):
 *  - sin enlace: «Crear enlace», que además avisa a tus amistades (la tarjeta del feed, una vez por año);
 *  - con enlace y el resumen cambiado: «Actualizar enlace», sobre la misma dirección;
 *  - con enlace al día (o cuando aún no toca actualizar): «Compartir», que abre el menú de compartir del sistema o,
 *    donde no lo hay, copia el enlace.
 * Nada de retirar: el enlace desaparece solo el 16 de enero.
 *
 * Perezoso: fuera de temporada no se descarga.
 */
export const YearSummaryShare = memo(function YearSummaryShare({
  year,
  summary,
  signal,
}: {
  year: number;
  /** La proyección pública de tu resumen de ahora: lo que publicaría el enlace. */
  summary: YearSummary;
  signal?: YearSummarySignal;
}) {
  const vm = useYearShareViewModel({ year, summary, signal });
  return <YearSummarySharePanel year={year} vm={vm} />;
});

/** Lo que se pinta, con el modelo de vista ya hecho. Aparte para que la maqueta del social enseñe cada estado sin red. */
export const YearSummarySharePanel = memo(function YearSummarySharePanel({ year, vm }: { year: number; vm: YearShareViewModel }) {
  const [copied, setCopied] = useState(false);
  const { load } = vm;

  useEffect(() => {
    void load();
  }, [load]);

  const share = useCallback(() => {
    if (!vm.link) return;
    const url = vm.link.url;
    if (typeof navigator.share === 'function') {
      void navigator.share({ title: S.nativeTitle(year), url }).catch(() => undefined);
      return;
    }
    void navigator.clipboard?.writeText(url).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, [vm.link, year]);

  const waiting = vm.nextUpdateAt !== null && vm.nextUpdateAt > Date.now();
  const canUpdate = Boolean(vm.link) && vm.changed && !waiting;

  return (
    <div className="ys-share" aria-busy={vm.loading || vm.busy}>
      {vm.loading ? null : !vm.link ? (
        <button className="btn btn-primary" type="button" disabled={vm.busy || vm.serviceDown} onClick={() => void vm.publish()}>
          {vm.busy ? S.busy : S.create}
        </button>
      ) : canUpdate ? (
        <button className="btn btn-primary" type="button" disabled={vm.busy || vm.serviceDown} onClick={() => void vm.publish()}>
          {vm.busy ? S.busy : S.update}
        </button>
      ) : (
        <button className={`btn ${copied ? 'btn-done' : 'btn-social'}`} type="button" onClick={share}>
          {copied ? S.copied : S.share}
        </button>
      )}
      {vm.link && vm.changed && waiting && vm.nextUpdateAt ? <p className="ys-share-text">{S.waitUntil(S.date(vm.nextUpdateAt))}</p> : null}
      {vm.serviceDown ? (
        <p className="ys-share-text" role="status">
          {S.unavailable}
        </p>
      ) : vm.error ? (
        <p className="ys-share-text ys-share-error" role="alert">
          {vm.error}
        </p>
      ) : null}
    </div>
  );
});
