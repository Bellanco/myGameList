// LA APARIENCIA DEJA DE DEPENDER DE LA CUENTA.
//
// Vivía DENTRO de la tarjeta de la escala de nota, bajo su `inert`: quien no tenía sesión de Google se quedaba
// sin paleta, sin modo claro, sin mayúsculas y sin carátulas. Ninguna de esas preferencias necesita cuenta —se
// guardan en `localStorage` y solo se replican a la nube si hay sesión—, así que el bloqueo no protegía nada:
// simplemente apagaba media pantalla. Ahora son dos tarjetas y el candado se queda donde hace falta.
//
// Es un test de componente y no de recorrido a propósito: lo que se comprueba es QUÉ se pinta y qué queda
// habilitado según la sesión, y eso no necesita navegador.
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PersonalizationSettings } from '../../src/view/components/settings/PersonalizationSettings';

const pintar = (scoreScaleUid: string | null, hasSocialProfile = true) =>
  render(
    <MemoryRouter>
      <PersonalizationSettings scoreScaleUid={scoreScaleUid} hasSocialProfile={hasSocialProfile} />
    </MemoryRouter>,
  );

/** La tarjeta cuyo encabezado es este. */
const tarjeta = (titulo: string) => screen.getByRole('heading', { name: titulo, level: 2 }).closest('.settings-card') as HTMLElement;

describe('la pantalla de Personalización', () => {
  it('sin sesión, la apariencia sigue entera y solo se bloquea la escala de nota', () => {
    pintar(null);
    // Los selectores de apariencia responden: son preferencias locales.
    const apariencia = tarjeta('Apariencia');
    const botonesApariencia = within(apariencia).getAllByRole('button');
    expect(botonesApariencia.length).toBeGreaterThan(0);
    expect(botonesApariencia.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    expect(apariencia.closest('[inert]')).toBeNull();
    // La escala sí: se guarda en la nube contra el uid de Google, así que sin él no hay dónde escribirla.
    expect(within(tarjeta('Ajustes de cuenta')).getAllByRole('radio').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('con sesión, la escala de nota se puede elegir', () => {
    pintar('uid-1');
    expect(within(tarjeta('Ajustes de cuenta')).getAllByRole('radio').some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('no arrastra lo que se fue a otros grupos', () => {
    // La analítica, los documentos y el borrado de la cuenta viven en «Legal»: son las tres cosas que la ley
    // te reconoce sobre tus datos. Que no vuelvan a colarse aquí es lo que mantiene cada pantalla en un asunto.
    pintar('uid-1');
    expect(screen.queryByRole('heading', { name: /Analítica/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Zona de riesgo/i })).toBeNull();
  });
});
