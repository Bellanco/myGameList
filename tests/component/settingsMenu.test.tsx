// LA PUERTA DE «PERSONALIZACIÓN», que es la única del menú.
//
// Ese grupo reúne lo que se guarda en la nube de quien tiene espacio social —la escala de nota, los enlaces
// publicados— junto a la apariencia, así que sin ese espacio no hay nada que enseñar y el punto no se pinta.
// Los otros tres no dependen de ninguna cuenta: la sincronización usa GitHub, no Google, y la aplicación se
// puede usar entera en local. Que esa regla se invierta por descuido es fácil y no se ve: el menú seguiría
// abriéndose igual, solo que con un punto que lleva a una pantalla vacía o sin uno que hacía falta.
//
// El comportamiento del `popover` (abrir, cerrar, apagar el fondo) NO se comprueba aquí: en jsdom no existe.
// Vive en `tests/e2e/settingsMenu.test.ts`. De ahí el `hidden: true` de las consultas: sin `showPopover`, el
// menú está cerrado y sus opciones no se exponen en el árbol de accesibilidad. Lo que se mira aquí es QUÉ se
// pinta, no si se ve.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsMenu } from '../../src/view/components/SettingsMenu';

const pintar = (hasSocialProfile: boolean) =>
  render(
    <MemoryRouter>
      <SettingsMenu hasSocialProfile={hasSocialProfile} onToggle={vi.fn()} />
    </MemoryRouter>,
  );

describe('los puntos del menú de Ajustes', () => {
  it('con espacio social están los cuatro', () => {
    pintar(true);
    expect(screen.getAllByRole('menuitem', { hidden: true }).map((b) => b.textContent)).toEqual([
      'Personalización', 'Integración', 'Filtros', 'Legal',
    ]);
  });

  it('sin espacio social, Personalización no se pinta y el resto sigue', () => {
    pintar(false);
    expect(screen.getAllByRole('menuitem', { hidden: true }).map((b) => b.textContent)).toEqual([
      'Integración', 'Filtros', 'Legal',
    ]);
  });

  it('Legal se pinta como pie, no como un punto más', () => {
    // Se consulta una vez al año pero tiene que seguir estando a un toque: se le baja el rango, no el acceso.
    pintar(true);
    expect(screen.getByRole('menuitem', { name: 'Legal', hidden: true }).className).toContain('is-foot');
    expect(screen.getByRole('menuitem', { name: 'Integración', hidden: true }).className).not.toContain('is-foot');
  });
});
