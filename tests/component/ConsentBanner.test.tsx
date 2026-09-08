import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ANALYTICS_UI } from '../../src/core/constants/labels';

// GA4 no se toca aquí: interesa lo que el banner le cuenta al resto de la pantalla, no lo que activa al aceptar.
vi.mock('../../src/model/repository/firebaseGateway', () => ({
  enableAnalyticsAfterConsent: vi.fn(async () => {}),
}));

import { ConsentBanner } from '../../src/view/components/ConsentBanner';

/**
 * LO QUE EL BANNER LE CUENTA AL CARRIL QUE COMPARTE.
 *
 * El aviso de logro y este banner viven en la misma esquina de abajo a la izquierda, y el que se aparta es el
 * aviso. Para apartarse necesita dos cosas de aquí: saber que el consentimiento está pendiente
 * (`data-consent="pending"`) y saber CUÁNTO mide (`--consent-h`). Lo segundo era una constante copiada a mano en
 * la hoja de estilos —la altura del banner medida una vez— y el banner mide lo que mide su texto: en cuanto el
 * párrafo envolvía una línea más, el aviso nacía debajo y el banner lo tapaba.
 *
 * La GEOMETRÍA de verdad la comprueba el recorrido e2e, que es el único sitio donde hay cajas con altura; esto
 * fija el CONTRATO: que las dos señales se publiquen mientras hace falta y se retiren cuando no.
 */
describe('ConsentBanner — las señales del carril compartido', () => {
  const root = () => document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    root().removeAttribute('data-consent');
    root().style.removeProperty('--consent-h');
  });

  const pintar = () => render(<MemoryRouter><ConsentBanner /></MemoryRouter>);

  it('mientras está pendiente, marca la raíz y publica su altura', () => {
    pintar();

    expect(screen.getByRole('region', { name: ANALYTICS_UI.bannerAria })).toBeInTheDocument();
    expect(root().getAttribute('data-consent')).toBe('pending');
    // En jsdom toda caja mide cero, así que lo que se comprueba es que la medida se PUBLICA (con su unidad), no
    // cuánto vale: el número real solo existe en un navegador.
    expect(root().style.getPropertyValue('--consent-h')).toMatch(/^\d+px$/);
  });

  it('al decidir, retira las dos señales: ya no hay nada que esquivar', () => {
    pintar();

    fireEvent.click(screen.getByRole('button', { name: ANALYTICS_UI.bannerReject }));

    expect(screen.queryByRole('region', { name: ANALYTICS_UI.bannerAria })).not.toBeInTheDocument();
    expect(root().hasAttribute('data-consent')).toBe(false);
    expect(root().style.getPropertyValue('--consent-h')).toBe('');
  });

  it('con la decisión ya tomada no publica nada: el carril es del aviso', () => {
    localStorage.setItem('mis-listas-analytics-consent', 'granted');
    pintar();

    expect(screen.queryByRole('region', { name: ANALYTICS_UI.bannerAria })).not.toBeInTheDocument();
    expect(root().hasAttribute('data-consent')).toBe(false);
    expect(root().style.getPropertyValue('--consent-h')).toBe('');
  });
});
