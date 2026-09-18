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
    expect(view.steps.map((s) => s.done)).toEqual([false, false]);
  });

  /**
   * DOS PASOS, NI UNO MÁS. El tercero de antes —«crear el espacio social»— no lo daba nadie: se crea solo en
   * cuanto hay sesión, así que anunciarlo ponía trabajo donde no lo hay.
   */
  it('son dos pasos: GitHub y Google', () => {
    expect(resolveGateway(state()).steps).toHaveLength(2);
    expect(resolveGateway(state({ hasMainSync: true })).currentStep).toBe(2);
  });

  it('se queda en el último paso con todo hecho, sin pasar a uno que no existe', () => {
    const view = resolveGateway(state({ hasMainSync: true, hasSocialSession: true, hasSocialGist: true }));

    expect(view.currentStep).toBe(2);
    expect(view.steps.every((s) => s.done)).toBe(true);
  });

  /**
   * EL ESPACIO SOCIAL CUENTA DONDE DE VERDAD ESTÁ: dentro del paso de Google. Entrar sin espacio donde publicar
   * no es haber terminado, y darlo por hecho pondría la barra al 100 % con el alta a medias.
   */
  it('el paso de Google no está hecho hasta que existe el espacio social', () => {
    const sinEspacio = resolveGateway(state({ hasMainSync: true, hasSocialSession: true }));

    expect(sinEspacio.steps.map((s) => s.done)).toEqual([true, false]);

    const conEspacio = resolveGateway(state({ hasMainSync: true, hasSocialSession: true, hasSocialGist: true }));
    expect(conEspacio.steps.map((s) => s.done)).toEqual([true, true]);
  });

  it('marca cada paso por SU propio requisito, no en cadena', () => {
    // Alguien puede tener sesión de Google sin haber conectado GitHub: son requisitos independientes, y la
    // pantalla tiene que enseñar cuál falta de verdad en vez de fingir que van en orden.
    const view = resolveGateway(state({ hasSocialSession: true, hasSocialGist: true }));

    expect(view.steps.map((s) => s.done)).toEqual([false, true]);
    expect(view.currentStep).toBe(1);
  });

  it('conserva los textos de cada paso', () => {
    const view = resolveGateway(state());

    expect(view.steps.every((s) => Boolean(s.id && s.title && s.subtitle))).toBe(true);
  });
});
