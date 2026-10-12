// Compartir tu resumen del año (docs/plan-resumen-del-ano.md, Fase 5): plegado no pregunta nada; crear el enlace
// avisa también a tus amistades; actualizar es a mano, solo si el resumen ha cambiado y con la fecha si aún no toca.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { YEAR_SUMMARY_UI } from '../../src/core/constants/yearSummaryLabels';
import { buildYearSummary } from '../../src/core/stats/yearSummary';
import { publicYearSummary } from '../../src/core/stats/publicYearSummary';
import type { FinishedGame } from '../../src/core/utils/finishDates';

const S = YEAR_SUMMARY_UI.share;
const DAY = 24 * 60 * 60 * 1000;

const listMyShares = vi.fn();
const publishYearShare = vi.fn();
const removeShare = vi.fn(async (_token: string) => {});
const lookupSharedReview = vi.fn();

vi.mock('../../src/model/repository/shareRepository', () => ({
  listMyShares: () => listMyShares(),
  publishYearShare: (year: number, summary: unknown) => publishYearShare(year, summary),
  removeShare: (token: string) => removeShare(token),
  isShareUnavailable: (error: { unavailable?: boolean }) => Boolean(error?.unavailable),
}));
vi.mock('../../src/model/repository/publicShareRepository', () => ({
  lookupSharedReview: (token: string) => lookupSharedReview(token),
  isSharedYearSummary: (article: { kind?: string }) => article?.kind === 'year',
}));

const { YearSummaryShare } = await import('../../src/view/components/socialhub/YearSummaryShare');

const game = (id: number, grade: number): FinishedGame => ({
  id, _ts: 1, name: `Juego ${id}`, platforms: ['PC'], genres: ['RPG'], steamDeck: false, review: '', years: [2026], grade,
});
const summaryOf = (games: FinishedGame[]) => publicYearSummary(buildYearSummary({ completed: games, year: 2026, precision: 'month' })!);
const now = new Date(2026, 11, 20, 12).getTime();
const summary = summaryOf([game(1, 90), game(2, 80)]);

function signal(announced = false) {
  return { isAnnounced: vi.fn(() => announced), announce: vi.fn(async () => true) };
}

function article(published = summary, updatedAt = now - DAY) {
  return { status: 'ready', article: { v: 1, kind: 'year', year: 2026, summary: published, authorNick: 'Yo', createdAt: updatedAt, updatedAt, expiresAt: Date.UTC(2027, 0, 16, 12) } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  listMyShares.mockReset().mockResolvedValue({ shares: [], yearShares: [], tier: 'gold' });
  publishYearShare.mockReset();
  lookupSharedReview.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function abrir(props: Partial<Parameters<typeof YearSummaryShare>[0]> = {}) {
  render(<YearSummaryShare year={2026} summary={summary} signal={signal()} {...props} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: S.open }));
  });
}

describe('compartir tu resumen', () => {
  it('plegado no pregunta nada al servidor', () => {
    render(<YearSummaryShare year={2026} summary={summary} signal={signal()} />);
    expect(listMyShares).not.toHaveBeenCalled();
  });

  it('crear el enlace lo publica con tu resumen y avisa a tus amistades', async () => {
    const sig = signal();
    publishYearShare.mockResolvedValue({ token: 'TOK', url: 'https://app.test/r/TOK', year: 2026, createdAt: now, updatedAt: now, expiresAt: Date.UTC(2027, 0, 16, 12), nextUpdateAt: now + 2 * DAY, renewed: false });
    await abrir({ signal: sig });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: S.create }));
    });
    expect(publishYearShare).toHaveBeenCalledWith(2026, summary);
    expect(sig.announce).toHaveBeenCalledWith(2026);
    expect(screen.getByLabelText(S.urlLabel)).toHaveValue('https://app.test/r/TOK');
    expect(screen.getByText(S.upToDate)).toBeInTheDocument();
  });

  it('avisar a tus amistades sin crear enlace', async () => {
    const sig = signal();
    await abrir({ signal: sig });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: S.announce }));
    });
    expect(sig.announce).toHaveBeenCalledWith(2026);
    expect(screen.getByText(S.announced)).toBeInTheDocument();
    expect(publishYearShare).not.toHaveBeenCalled();
  });

  it('con el enlace ya creado y el resumen igual, no ofrece actualizar', async () => {
    listMyShares.mockResolvedValue({ shares: [], yearShares: [{ token: 'TOK', year: 2026, createdAt: now - DAY, expiresAt: Date.UTC(2027, 0, 16, 12) }], tier: 'gold' });
    lookupSharedReview.mockResolvedValue(article());
    await abrir();
    expect(screen.getByText(S.upToDate)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: S.update })).toBeNull();
  });

  it('si el resumen cambió, ofrece actualizar; mientras no toque por la espera, desactivado y con la fecha', async () => {
    listMyShares.mockResolvedValue({ shares: [], yearShares: [{ token: 'TOK', year: 2026, createdAt: now - DAY, expiresAt: Date.UTC(2027, 0, 16, 12) }], tier: 'gold' });
    lookupSharedReview.mockResolvedValue(article(summaryOf([game(1, 90)])));
    await abrir();
    expect(screen.getByText(S.changed)).toBeInTheDocument();
    // Oro espera 2 días: actualizado ayer, toca mañana. Sin nombrar el rango.
    expect(screen.getByRole('button', { name: S.update })).toBeDisabled();
    expect(screen.getByText(S.waitUntil(S.date(now + DAY)))).toBeInTheDocument();
  });

  it('pasada la espera, actualizar reescribe el mismo enlace', async () => {
    listMyShares.mockResolvedValue({ shares: [], yearShares: [{ token: 'TOK', year: 2026, createdAt: now - 3 * DAY, expiresAt: Date.UTC(2027, 0, 16, 12) }], tier: 'gold' });
    lookupSharedReview.mockResolvedValue(article(summaryOf([game(1, 90)]), now - 3 * DAY));
    publishYearShare.mockResolvedValue({ token: 'TOK', url: 'https://app.test/r/TOK', year: 2026, createdAt: now - 3 * DAY, updatedAt: now, expiresAt: Date.UTC(2027, 0, 16, 12), nextUpdateAt: now + 2 * DAY, renewed: true });
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: S.update }));
    });
    expect(publishYearShare).toHaveBeenCalledWith(2026, summary);
    expect(screen.getByText(S.upToDate)).toBeInTheDocument();
  });

  it('si el servidor dice que aún no toca, enseña su fecha', async () => {
    listMyShares.mockResolvedValue({ shares: [], yearShares: [{ token: 'TOK', year: 2026, createdAt: now - 3 * DAY, expiresAt: Date.UTC(2027, 0, 16, 12) }], tier: 'gold' });
    lookupSharedReview.mockResolvedValue(article(summaryOf([game(1, 90)]), now - 3 * DAY));
    publishYearShare.mockRejectedValue(Object.assign(new Error('Todavía no puedes actualizar este enlace'), { status: 429, details: { nextUpdateAt: now + DAY } }));
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: S.update }));
    });
    expect(screen.getByText(S.waitUntil(S.date(now + DAY)))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: S.update })).toBeDisabled();
  });

  it('retirar el enlace lo borra y vuelve a ofrecer crearlo', async () => {
    listMyShares.mockResolvedValue({ shares: [], yearShares: [{ token: 'TOK', year: 2026, createdAt: now - DAY, expiresAt: Date.UTC(2027, 0, 16, 12) }], tier: 'gold' });
    lookupSharedReview.mockResolvedValue(article());
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: S.remove }));
    });
    expect(removeShare).toHaveBeenCalledWith('TOK');
    expect(screen.getByRole('button', { name: S.create })).toBeInTheDocument();
  });
});
