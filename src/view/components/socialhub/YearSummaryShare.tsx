import { memo, useCallback, useEffect, useState } from 'react';
import { YEAR_SUMMARY_UI } from '../../../core/constants/yearSummaryLabels';
import type { YearSummary } from '../../../core/stats/yearSummary';
import { useYearShareViewModel, type YearShareViewModel } from '../../../viewmodel/useYearShareViewModel';
import type { YearSummarySignal } from '../../../viewmodel/social/useYearSummarySignal';
import '../../../styles/yearSummary.scss';

const S = YEAR_SUMMARY_UI.share;

/**
 * COMPARTIR TU RESUMEN DEL AÑO, encima del resumen y solo en temporada (del 15 de diciembre al 15 de enero, ver
 * docs/plan-resumen-del-ano.md). Plegado de entrada: abrir tu resumen no cuesta ni una petición; desplegarlo
 * pregunta una vez si ya lo compartiste.
 *
 * Dos gestos y un enlace:
 *  - «Avisar a mis amistades»: la tarjeta en su feed, una vez por año (va por Firestore, sin cupo de KV);
 *  - «Crear enlace público»: avisa también, y deja un enlace que cualquiera puede abrir;
 *  - «Actualizar enlace», A MANO: solo si tu resumen ha cambiado desde que lo compartiste, y con la fecha a partir
 *    de la cual se puede si aún no toca. La espera es por rango, pero aquí solo se dice la fecha.
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

/**
 * Lo que se pinta, con el modelo de vista ya hecho. Aparte para que la maqueta del social
 * (`docs/maquetas/social.tsx`) enseñe cada estado sin red; `initiallyOpen` es para eso mismo.
 */
export const YearSummarySharePanel = memo(function YearSummarySharePanel({
  year,
  vm,
  initiallyOpen = false,
}: {
  year: number;
  vm: YearShareViewModel;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [copied, setCopied] = useState(false);
  const { load } = vm;

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const copy = useCallback(() => {
    if (!vm.link) return;
    void navigator.clipboard?.writeText(vm.link.url).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, [vm.link]);

  const nativeShare = useCallback(() => {
    if (!vm.link || typeof navigator.share !== 'function') return;
    void navigator.share({ title: S.nativeTitle(year), url: vm.link.url }).catch(() => undefined);
  }, [vm.link, year]);

  if (!open) {
    return (
      <div className="ys-share-toggle">
        <button className="btn btn-secondary" type="button" aria-expanded={false} onClick={() => setOpen(true)}>
          {S.open}
        </button>
      </div>
    );
  }

  const lastDay = S.date(new Date(year + 1, 0, 15).getTime());
  const waiting = vm.nextUpdateAt !== null && vm.nextUpdateAt > Date.now();

  return (
    <section className="ys-share" aria-label={S.title}>
      <div className="ys-share-head">
        <h4 className="ys-share-title">{S.title}</h4>
        <button className="btn btn-quiet" type="button" aria-expanded onClick={() => setOpen(false)}>
          {S.close}
        </button>
      </div>
      <p className="ys-share-text">{S.intro(lastDay)}</p>

      <div className="ys-share-actions">
        {vm.announced ? (
          <p className="ys-share-text ys-share-done">{S.announced}</p>
        ) : (
          <button className="btn btn-social" type="button" disabled={vm.busy} onClick={() => void vm.announce()}>
            {S.announce}
          </button>
        )}
        {vm.loading ? (
          <p className="ys-share-text">{S.loading}</p>
        ) : !vm.link ? (
          <button className="btn btn-primary" type="button" disabled={vm.busy || vm.serviceDown} onClick={() => void vm.publish()}>
            {vm.busy ? S.busy : S.create}
          </button>
        ) : null}
      </div>

      {vm.link ? (
        <div className="ys-share-link">
          <label className="ys-share-text" htmlFor="ys-share-url">
            {S.urlLabel}
          </label>
          <div className="ys-share-actions">
            <input id="ys-share-url" className="finput ys-share-url" type="text" readOnly value={vm.link.url} onFocus={(event) => event.currentTarget.select()} />
            <button className={`btn ${copied ? 'btn-done' : 'btn-secondary'}`} type="button" onClick={copy}>
              {copied ? S.copied : S.copy}
            </button>
            {typeof navigator.share === 'function' ? (
              <button className="btn btn-secondary" type="button" onClick={nativeShare}>
                {S.native}
              </button>
            ) : null}
          </div>
          {vm.changed ? (
            <div className="ys-share-actions">
              <p className="ys-share-text">{S.changed}</p>
              <button className="btn btn-primary" type="button" disabled={vm.busy || waiting || vm.serviceDown} onClick={() => void vm.publish()}>
                {vm.busy ? S.busy : S.update}
              </button>
            </div>
          ) : (
            <p className="ys-share-text">{S.upToDate}</p>
          )}
          {vm.changed && waiting && vm.nextUpdateAt ? <p className="ys-share-text">{S.waitUntil(S.date(vm.nextUpdateAt))}</p> : null}
          <div className="ys-share-actions">
            <p className="ys-share-text">{S.expires(S.date(vm.link.expiresAt))}</p>
            <button className="btn btn-exit" type="button" disabled={vm.busy} onClick={() => void vm.remove()}>
              {S.remove}
            </button>
          </div>
        </div>
      ) : null}

      {vm.serviceDown ? (
        <p className="ys-share-text" role="status">
          {S.unavailable}
        </p>
      ) : vm.error ? (
        <p className="ys-share-text ys-share-error" role="alert">
          {vm.error}
        </p>
      ) : null}
    </section>
  );
});
