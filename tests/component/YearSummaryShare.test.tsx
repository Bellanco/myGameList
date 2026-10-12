// Compartir tu resumen del año (docs/plan-resumen-del-ano.md, Fase 5): UN botón al final del resumen, el que toque.
// «Compartir», que crea el enlace si no lo hay (y avisa a tus amistades) y abre el menú de compartir; o «Actualizar
// enlace» si el resumen cambió y ya toca. Nada más: ni retirar ni la fecha de la espera.
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
const lookupSharedReview = vi.fn();

vi.mock('../../src/model/repository/shareRepository', () => ({
  listMyShares: () => listMyShares(),
  publishYearShare: (year: number, summary: unknown) => publishYearShare(year, summary),
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
const closes = Date.UTC(2027, 0, 16, 12);
const row = (createdAt: number) => ({ shares: [], yearShares: [{ token: 'TOK', year: 2026, createdAt, expiresAt: closes }], tier: 'gold' });

function signal() {
  return { isAnnounced: vi.fn(() => false), announce: vi.fn(async () => true) };
}

function article(published = summary, updatedAt = now - DAY) {
  return { status: 'ready', article: { v: 1, kind: 'year', year: 2026, summary: published, authorNick: 'Yo', createdAt: updatedAt, updatedAt, expiresAt: closes } };
}

function published(updatedAt = now) {
  return { token: 'TOK', url: 'https://app.test/r/TOK', year: 2026, createdAt: now, updatedAt, expiresAt: closes, nextUpdateAt: updatedAt + 2 * DAY, renewed: false };
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
  vi.unstubAllGlobals();
});

async function pinta(sig = signal()) {
  await act(async () => {
    render(<YearSummaryShare year={2026} summary={summary} signal={sig} />);
  });
}

const buttons = () => screen.queryAllByRole('button').map((button) => button.textContent);

describe('compartir tu resumen', () => {
  it('sin enlace, un solo botón: «Compartir», que lo crea, avisa a tus amistades y abre el menú en el mismo gesto', async () => {
    const sig = signal();
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share });
    publishYearShare.mockResolvedValue(published());
    await pinta(sig);
    expect(buttons()).toEqual([S.share]);
    expect(screen.getByRole('button', { name: S.share }).querySelector('use')?.getAttribute('href')).toBe('#icon-share-nodes');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: S.share }));
    });
    expect(publishYearShare).toHaveBeenCalledWith(2026, summary);
    expect(sig.announce).toHaveBeenCalledWith(2026);
    expect(share).toHaveBeenCalledWith({ title: S.nativeTitle(2026), url: 'https://app.test/r/TOK' });
    expect(buttons()).toEqual([S.share]);
  });

  it('con el enlace al día, solo «Compartir»: el menú del sistema con la dirección del enlace', async () => {
    listMyShares.mockResolvedValue(row(now - DAY));
    lookupSharedReview.mockResolvedValue(article());
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share });
    await pinta();
    expect(buttons()).toEqual([S.share]);
    fireEvent.click(screen.getByRole('button', { name: S.share }));
    expect(share).toHaveBeenCalledWith({ title: S.nativeTitle(2026), url: `${window.location.origin}/r/TOK` });
  });

  it('sin menú de compartir, copia el enlace', async () => {
    listMyShares.mockResolvedValue(row(now - DAY));
    lookupSharedReview.mockResolvedValue(article());
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    await pinta();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: S.share }));
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/r/TOK`);
    expect(buttons()).toEqual([S.copied]);
  });

  it('si el resumen cambió y ya toca, solo «Actualizar enlace», sobre el mismo enlace', async () => {
    listMyShares.mockResolvedValue(row(now - 3 * DAY));
    lookupSharedReview.mockResolvedValue(article(summaryOf([game(1, 90)]), now - 3 * DAY));
    publishYearShare.mockResolvedValue({ ...published(), renewed: true });
    await pinta();
    expect(buttons()).toEqual([S.update]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: S.update }));
    });
    expect(publishYearShare).toHaveBeenCalledWith(2026, summary);
    expect(buttons()).toEqual([S.share]);
  });

  it('si cambió pero aún no toca por la espera, solo «Compartir», sin fecha ni rango', async () => {
    listMyShares.mockResolvedValue(row(now - DAY));
    lookupSharedReview.mockResolvedValue(article(summaryOf([game(1, 90)])));
    await pinta();
    // Oro espera 2 días: actualizado ayer, toca mañana. No se dice.
    expect(buttons()).toEqual([S.share]);
    expect(document.querySelector('.ys-share-text')).toBeNull();
  });

  it('si el servidor dice que aún no toca, pasa a «Compartir» sin mensaje', async () => {
    listMyShares.mockResolvedValue(row(now - 3 * DAY));
    lookupSharedReview.mockResolvedValue(article(summaryOf([game(1, 90)]), now - 3 * DAY));
    publishYearShare.mockRejectedValue(Object.assign(new Error('Todavía no puedes actualizar este enlace'), { status: 429, details: { nextUpdateAt: now + DAY } }));
    await pinta();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: S.update }));
    });
    expect(buttons()).toEqual([S.share]);
    expect(document.querySelector('.ys-share-text')).toBeNull();
  });
});
