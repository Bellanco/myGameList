import { describe, expect, it } from 'vitest';
import { resolveGateway } from '../../src/viewmodel/social/socialGateway';

/**
 * La pasarela es lo PRIMERO que ve quien todavía no tiene el hub montado, así que es justo donde más caro sale
 * que la pantalla mienta sobre lo que falta. Vivía suelta dentro de `useSocialViewModel`, sin un solo test.
 */
const state = (over: Partial<Parameters<typeof resolveGateway>[0]> = {}) => ({
  hasMainSync: false,
  hasSocialSession: false,
  hasSocialGist: false,
  ...over,
});

describe('pasarela del hub social', () => {
  it('empieza en el primer paso, sin nada hecho y con el progreso a cero', () => {
    const view = resolveGateway(state());

    expect(view.currentStep).toBe(1);
    expect(view.progress).toBe(0);
    expect(view.steps.map((s) => s.done)).toEqual([false, false, false]);
  });

  it('avanza paso a paso conforme se completan los requisitos', () => {
    expect(resolveGateway(state({ hasMainSync: true })).currentStep).toBe(2);
    expect(resolveGateway(state({ hasMainSync: true, hasSocialSession: true })).currentStep).toBe(3);
  });

  it('se queda en el último paso con todo hecho, sin pasar a uno que no existe', () => {
    const view = resolveGateway(state({ hasMainSync: true, hasSocialSession: true, hasSocialGist: true }));

    expect(view.currentStep).toBe(3);
    expect(view.steps).toHaveLength(3);
    expect(view.progress).toBe(100);
  });

  it('marca cada paso por SU propio requisito, no en cadena', () => {
    // Alguien puede tener sesión de Google sin haber conectado GitHub: son requisitos independientes, y la
    // pantalla tiene que enseñar cuál falta de verdad en vez de fingir que van en orden.
    const view = resolveGateway(state({ hasSocialSession: true }));

    expect(view.steps.map((s) => s.done)).toEqual([false, true, false]);
    expect(view.currentStep).toBe(1);
  });

  it('el progreso cuenta los pasos hechos, estén donde estén', () => {
    expect(resolveGateway(state({ hasSocialSession: true })).progress).toBe(33);
    expect(resolveGateway(state({ hasMainSync: true, hasSocialGist: true })).progress).toBe(67);
  });

  it('conserva los textos de cada paso', () => {
    const view = resolveGateway(state());

    expect(view.steps.every((s) => Boolean(s.id && s.title && s.subtitle))).toBe(true);
  });
});
