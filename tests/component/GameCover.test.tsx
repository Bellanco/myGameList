// La ranura de la carátula y su memoria.
//
// Lo que se protege aquí no es el aspecto, es el CONTRATO que sostiene al resto: que la portada de casa está
// siempre debajo (por eso una imagen que no llega no deja un hueco), que el componente no marca nada como roto
// —`onError` no distingue «no existe» de «se ha cancelado», y la rejilla virtualizada cancela cargas sin parar—,
// y que de un juego del que ya se sabe que no tiene carátula no se vuelve a pedir la imagen.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameCover } from '../../src/view/components/GameCover';
import { coverUrl } from '../../src/core/utils/coverUrl';
import {
  olvidarQueNoTiene,
  recordarQueNoTiene,
  reiniciarMemoriaDeCaratulas,
  sabemosQueNoTiene,
} from '../../src/core/utils/coverMemory';

describe('URL de la carátula', () => {
  it('siempre es del propio dominio: el navegador nunca conoce a IGDB', () => {
    const url = coverUrl('Hollow Knight', ['Steam']);
    expect(url.startsWith('/cover?')).toBe(true);
    expect(url).not.toContain('igdb');
    expect(url).not.toContain('http');
  });

  it('lleva el nombre y las plataformas, que son el desempate entre homónimos', () => {
    const url = coverUrl('Hook', ['Sega Mega Drive']);
    expect(new URL(url, 'https://x').searchParams.get('n')).toBe('Hook');
    expect(new URL(url, 'https://x').searchParams.get('p')).toBe('Sega Mega Drive');
  });

  it('escapa lo que rompería la URL (hay un juego llamado «Half Life / Black Mesa»)', () => {
    const url = coverUrl('Half Life / Black Mesa', ['Steam']);
    expect(url).not.toMatch(/\/cover\?.*\/.*Black/);
    expect(new URL(url, 'https://x').searchParams.get('n')).toBe('Half Life / Black Mesa');
  });

  it('omite el parámetro de plataformas cuando no hay ninguna', () => {
    expect(new URL(coverUrl('Inside', []), 'https://x').searchParams.has('p')).toBe(false);
  });
});

describe('memoria de los que no tienen carátula', () => {
  beforeEach(() => { localStorage.clear(); reiniciarMemoriaDeCaratulas(); });
  afterEach(() => { localStorage.clear(); reiniciarMemoriaDeCaratulas(); });

  it('de un juego desconocido no se sabe nada', () => {
    expect(sabemosQueNoTiene(coverUrl('Celeste', ['Steam']))).toBe(false);
  });

  it('lo apuntado se recuerda, y sobrevive a recargar la página', () => {
    const url = coverUrl('Max Paine 3', ['Steam']);
    recordarQueNoTiene(url);
    reiniciarMemoriaDeCaratulas(); // como si se recargara: se relee del almacenamiento
    expect(sabemosQueNoTiene(url)).toBe(true);
  });

  it('se puede desapuntar, que es lo que pasa al corregir una errata del título', () => {
    const url = coverUrl('Jotum', ['Steam']);
    recordarQueNoTiene(url);
    olvidarQueNoTiene(url);
    reiniciarMemoriaDeCaratulas();
    expect(sabemosQueNoTiene(url)).toBe(false);
  });
});

describe('la ranura', () => {
  it('pinta la portada de casa con el título aunque no haya imagen', () => {
    render(<GameCover name="Hollow Knight" />);
    expect(screen.getByText('Hollow Knight')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('con `src` pone la imagen ENCIMA, sin quitar la portada de debajo', () => {
    render(<GameCover name="Portal" src="/cover?n=Portal" />);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('loading')).toBe('lazy'); // 300 juegos no pueden pedirse de golpe
    // La portada sigue ahí: es lo que hace que no haya parpadeo mientras carga ni hueco si falla.
    expect(screen.getByText('Portal')).toBeInTheDocument();
  });

  it('no se anuncia a los lectores de pantalla: el nombre ya lo dicen la caja y su botón', () => {
    const { container } = render(<GameCover name="Celeste" src="/cover?n=Celeste" />);
    expect(container.querySelector('.game-cover')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('el mismo juego recibe siempre el mismo tono, en esta y en la próxima sesión', () => {
    const { container: a } = render(<GameCover name="Nine Sols" />);
    const { container: b } = render(<GameCover name="Nine Sols" />);
    const tono = (c: HTMLElement) => c.querySelector<HTMLElement>('.game-cover')?.style.getPropertyValue('--cat');
    expect(tono(a)).toBe(tono(b));
    expect(tono(a)).toMatch(/var\(--cat-\d\)/);
  });
});
