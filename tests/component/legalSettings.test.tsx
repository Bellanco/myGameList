// LAS TRES COSAS QUE LA LEY TE RECONOCE SOBRE TUS DATOS, EN UNA PANTALLA.
//
// Saber qué se recoge (los documentos), dejar de darlo (el interruptor de la analítica) y hacer que desaparezca
// (el borrado de la cuenta). Estaban repartidas entre la pantalla de «Cuenta» y el fondo de Ajustes, y el
// borrado llegó a quedarse en el grupo de integración, donde no lo buscaba nadie.
//
// Y NADA DE ESTO DEPENDE DE TENER SESIÓN: retirar un consentimiento tiene que costar lo mismo que darlo, así
// que esta pantalla no lleva puerta. Es la única de las cuatro sin condiciones.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LegalSettings } from '../../src/view/components/settings/LegalSettings';

describe('la pantalla Legal', () => {
  it('reúne analítica, documentos y borrado de la cuenta', () => {
    render(<MemoryRouter><LegalSettings /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /Analítica/i, level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^Legal$/, level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Zona de riesgo/i, level: 2 })).toBeTruthy();
  });

  it('el borrado va el último, detrás de todo lo demás', () => {
    // Es la acción más seria de la pantalla y la única irreversible: no puede quedar por encima de un enlace.
    render(<MemoryRouter><LegalSettings /></MemoryRouter>);
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titulos[titulos.length - 1]).toMatch(/Zona de riesgo/i);
  });
});
