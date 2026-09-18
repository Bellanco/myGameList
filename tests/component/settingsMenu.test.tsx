// LA PUERTA DE «DISEÑO», que es la única del menú.
//
// Ese grupo reúne lo que se guarda en la nube de quien tiene espacio social —la escala de nota, los enlaces
// publicados— junto a la apariencia, así que sin ese espacio no hay nada que enseñar y el punto no se pinta.
// Los otros dos no dependen de ninguna cuenta: la sincronización usa GitHub, no Google, y la aplicación se
// puede usar entera en local. Que esa regla se invierta por descuido es fácil y no se ve: el menú seguiría
// abriéndose igual, solo que con un punto que lleva a una pantalla vacía o sin uno que hacía falta.
//
// El comportamiento del `popover` (abrir, cerrar, apagar el fondo) NO se comprueba aquí: en jsdom no existe.
// Vive en `tests/e2e/settingsMenu.test.ts`. De ahí el `hidden: true` de las consultas: sin `showPopover`, el
// menú está cerrado y sus opciones no se exponen en el árbol de accesibilidad. Lo que se mira aquí es QUÉ se
// pinta, no si se ve.
//
// Y son ENLACES, no opciones de un menú ARIA: llevan a tres direcciones, así que se abren en otra pestaña y
// se copian como cualquier enlace. Un `role="menu"` habría prometido un teclado de flechas que no existe.
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
  /**
   * EL ORDEN ES LA FRECUENCIA DE USO, y por eso se fija aquí: arriba lo de todos los días —la apariencia y las
   * etiquetas—, debajo lo que se toca al empezar, cuando algo va mal o una vez al año. Y son TRES: «Integración»
   * y «Legal» gastaban dos puntos para lo mismo —tus datos— y comparten pantalla desde entonces.
   */
  it('con espacio social están los tres, en orden de uso', () => {
    pintar(true);
    expect(screen.getAllByRole('link', { hidden: true }).map((b) => b.textContent)).toEqual([
      'Diseño', 'Filtros', 'Datos',
    ]);
  });

  it('sin espacio social, Diseño no se pinta y el resto sigue', () => {
    pintar(false);
    expect(screen.getAllByRole('link', { hidden: true }).map((b) => b.textContent)).toEqual([
      'Filtros', 'Datos',
    ]);
  });

  /**
   * UN RANGO POR PUNTO, Y CADA UNO MENOR QUE EL ANTERIOR: la apariencia se cambia a menudo, las etiquetas de vez
   * en cuando y «Datos» al empezar, cuando algo va mal o una vez al año. Se les baja el rango, no el acceso:
   * todos siguen a un toque, que retirar el consentimiento de la analítica tiene que costar lo mismo que darlo.
   *
   * El rango sale del DATO y no de la posición: sin espacio social el primer punto es otro, y contándolo por
   * índice «Filtros» heredaría el tamaño del titular por ocupar un sitio que no es suyo.
   */
  it('reparte los rangos de mayor a menor', () => {
    pintar(true);
    const clase = (nombre: string) => screen.getByRole('link', { name: nombre, hidden: true }).className;

    expect(clase('Diseño')).not.toMatch(/is-second|is-third/);
    expect(clase('Filtros')).toContain('is-second');
    expect(clase('Datos')).toContain('is-third');
  });

  it('sin Diseño, el rango de cada punto no se mueve', () => {
    pintar(false);
    expect(screen.getByRole('link', { name: 'Filtros', hidden: true }).className).toContain('is-second');
    expect(screen.getByRole('link', { name: 'Datos', hidden: true }).className).toContain('is-third');
  });
});
