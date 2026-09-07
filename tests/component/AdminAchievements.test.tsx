import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAchievements } from '../../src/view/components/AdminAchievements';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_LADDER, LADDERS } from '../../src/core/achievements/catalog';

describe('catálogo de logros — la vista de revisión del panel de administración', () => {
  it('enseña TODAS las escaleras con sus escalones: es una revisión, no una muestra', () => {
    render(<AdminAchievements onBack={() => {}} />);
    for (const ladder of LADDERS) {
      expect(screen.getByText(`key: ${ladder.key}`), ladder.key).toBeInTheDocument();
    }
    // Una fila por escalón del catálogo, más una cabecera por escalera.
    expect(screen.getAllByRole('row')).toHaveLength(ACHIEVEMENTS.length + LADDERS.length);
  });

  /**
   * LOS DOS TEXTOS, UNO AL LADO DEL OTRO. Es la razón de ser de la pantalla: repartidos por la app no se pueden
   * comparar —el listado enseña uno u otro según lo tengas— y es comparándolos como se ve que un escalón desafina.
   */
  it('cada escalón enseña su meta y su hecho en la misma fila', () => {
    render(<AdminAchievements onBack={() => {}} />);
    const def = (ACHIEVEMENTS_BY_LADDER.get('completados') || [])[2];
    const fila = screen.getByText(def.labels.name).closest('tr') as HTMLElement;
    expect(within(fila).getByText(def.labels.condition)).toBeInTheDocument();
    expect(within(fila).getByText(def.labels.done)).toBeInTheDocument();
    // Y no son la misma frase: si lo fueran, la escalera se habría dejado su `done`.
    expect(def.labels.done).not.toBe(def.labels.condition);
  });

  /**
   * EL AVISO QUE JUSTIFICA LA PANTALLA. Si una escalera se deja el `done`, el respaldo copia la meta y en la app
   * queda un «Termina 100 juegos» debajo de una medalla ya ganada. No lo caza ningún test de tipos —el campo
   * existe y trae una cadena—, así que se caza mirando: aquí sale marcado, y hoy no debe salir ninguno.
   */
  it('marca las escaleras que repiten la meta como hecho, y hoy no hay ninguna', () => {
    render(<AdminAchievements onBack={() => {}} />);
    expect(screen.queryAllByText('Sin texto propio: repite la meta')).toHaveLength(0);
    for (const def of ACHIEVEMENTS) {
      expect(def.labels.done, `${def.id} repite su meta como hecho`).not.toBe(def.labels.condition);
    }
  });

  it('el buscador recorta por nombre y por texto, y dice cuántas quedan', async () => {
    render(<AdminAchievements onBack={() => {}} />);
    await userEvent.type(screen.getByRole('searchbox'), 'plataformas');
    expect(screen.getByText('key: plataformas')).toBeInTheDocument();
    expect(screen.queryByText('key: completados')).not.toBeInTheDocument();
    expect(screen.getByText(/de 50 escaleras$/)).toBeInTheDocument();
  });

  it('una búsqueda sin resultados lo dice, en vez de dejar la página en blanco', async () => {
    render(<AdminAchievements onBack={() => {}} />);
    await userEvent.type(screen.getByRole('searchbox'), 'zzzz');
    expect(screen.getByText('Ningún logro coincide con esa búsqueda.')).toBeInTheDocument();
  });

  it('es SOLO LECTURA: no hay más campo que la búsqueda ni más botón que el de volver', async () => {
    const onBack = vi.fn();
    render(<AdminAchievements onBack={onBack} />);
    // Un solo campo (la búsqueda) y un solo botón: el catálogo vive en el código, aquí no se edita nada.
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    const botones = screen.getAllByRole('button');
    expect(botones).toHaveLength(1);
    await userEvent.click(botones[0]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
