// LA APARIENCIA DEJA DE DEPENDER DE LA CUENTA.
//
// Vivía DENTRO de la tarjeta de la escala de nota, bajo su `inert`: quien no tenía sesión de Google se quedaba
// sin paleta, sin modo claro, sin mayúsculas y sin carátulas. Ninguna de esas preferencias necesita cuenta —se
// guardan en `localStorage` y solo se replican a la nube si hay sesión—, así que el bloqueo no protegía nada:
// simplemente apagaba media pantalla. Ahora el candado alcanza SOLO a la escala, que es lo único que se escribe
// en la nube, y convive en la misma tarjeta con cinco interruptores que siguen funcionando sin sesión.
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
      <PersonalizationSettings
        scoreScaleUid={scoreScaleUid}
        hasSocialProfile={hasSocialProfile}
        games={{ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 }}
      />
    </MemoryRouter>,
  );

/** La tarjeta cuyo encabezado es este. */
const tarjeta = (titulo: string) => screen.getByRole('heading', { name: titulo, level: 2 }).closest('.settings-card') as HTMLElement;

describe('la pantalla de Personalización', () => {
  it('sin sesión, el tema y los interruptores siguen enteros', () => {
    pintar(null);
    // El selector de tema tiene bloque propio y ninguna condición: es una preferencia de este dispositivo.
    const temas = within(tarjeta('Temas')).getAllByRole('radio');
    expect(temas.length).toBeGreaterThan(1);
    expect(temas.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    // Y los cinco interruptores, que comparten tarjeta con la escala, tampoco se bloquean por vecindad: ese
    // contagio —la apariencia apagada por estar dentro del `inert` de la escala— es el fallo que cierra esto.
    const interruptores = within(tarjeta('Preferencias')).getAllByRole('button', { pressed: false });
    expect(interruptores.length).toBeGreaterThan(0);
    expect(interruptores.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    expect(tarjeta('Preferencias').closest('[inert]')).toBeNull();
    // La escala sí: se guarda en la nube contra el uid de Google, así que sin él no hay dónde escribirla.
    expect(within(tarjeta('Preferencias')).getAllByRole('radio').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('con sesión, la escala de nota se puede elegir', () => {
    pintar('uid-1');
    expect(within(tarjeta('Preferencias')).getAllByRole('radio').some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('los tres bloques van en su orden: tema, preferencias y lo publicado', () => {
    // El orden es el de uso: lo que cambia la pantalla entera primero, lo que has publicado al final.
    pintar('uid-1');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent))
      .toEqual(['Temas', 'Preferencias', 'Reseñas compartidas']);
  });

  it('no arrastra lo que se fue a otros grupos', () => {
    // La analítica, los documentos y el borrado de la cuenta viven en «Legal»: son las tres cosas que la ley
    // te reconoce sobre tus datos. Que no vuelvan a colarse aquí es lo que mantiene cada pantalla en un asunto.
    pintar('uid-1');
    expect(screen.queryByRole('heading', { name: /Analítica/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Zona de riesgo/i })).toBeNull();
  });
});
