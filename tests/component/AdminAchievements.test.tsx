import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAchievements, suggestStep } from '../../src/view/components/AdminAchievements';
import { ADMIN_ACHIEVEMENTS_UI as A } from '../../src/core/constants/adminLabels';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_LADDER, LADDERS, SCORING_ACHIEVEMENTS } from '../../src/core/achievements/catalog';
import { MIRROR_ORDER, packAchievements } from '../../src/core/achievements/pack';
import type { AchievementState } from '../../src/core/achievements/types';

/** Un espejo de verdad, empaquetado por el empaquetador: el bitmap se indexa por `MIRROR_ORDER`, no a mano. */
function espejo(ids: readonly string[]): string {
  const states: AchievementState[] = ids.map((id) => ({ id, level: 1, value: 0, next: null, unlockedAt: 0 }));
  return packAchievements(states, []);
}

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

  /**
   * SIN MUESTRA NO SE INVENTA UN 0 %. Mientras la publicación del espejo esté apagada nadie publica, y una
   * columna llena de ceros diría «nadie tiene ningún logro», que es falso: lo que pasa es que no hay con qué
   * medir. La diferencia importa porque esta pantalla existe para DECIDIR si sobra o falta un escalón.
   */
  it('sin espejos publicados dice que no hay muestra, en vez de pintar ceros', () => {
    render(<AdminAchievements onBack={() => {}} />);
    expect(screen.getByText(/Todavía no hay espejos publicados/)).toBeInTheDocument();
    expect(screen.queryByText(/·\s*\d+\/\d+$/)).not.toBeInTheDocument();
    // «Dormido» sale en el esquema como término explicado; lo que no puede haber es ninguna FILA marcada.
    expect(document.querySelectorAll('tbody .admin-ach-warn-soft')).toHaveLength(0);
  });

  it('con muestra da el porcentaje SIEMPRE con su denominador', () => {
    // Tres perfiles: los tres tienen el primer escalón, uno solo tiene el segundo.
    const mirrors = [espejo(['completados-10', 'completados-25']), espejo(['completados-10']), espejo(['completados-10'])];
    render(<AdminAchievements onBack={() => {}} mirrors={mirrors} />);
    expect(screen.getByText('Medido sobre 3 espejos publicados del censo.')).toBeInTheDocument();

    const primero = screen.getByText('Créditos finales I').closest('tr') as HTMLElement;
    expect(within(primero).getByText('100 % · 3/3')).toBeInTheDocument();
    const segundo = screen.getByText('Créditos finales II').closest('tr') as HTMLElement;
    expect(within(segundo).getByText('33 % · 1/3')).toBeInTheDocument();
  });

  /** Las dos decisiones que la pantalla tiene que servir en bandeja: sobra escalón o falta uno. */
  it('marca el escalón que se regala', () => {
    const mirrors = [espejo(['completados-10']), espejo(['completados-10']), espejo(['completados-10'])];
    render(<AdminAchievements onBack={() => {}} mirrors={mirrors} />);
    const regalado = screen.getByText('Créditos finales I').closest('tr') as HTMLElement;
    expect(within(regalado).getByText('Regalado')).toBeInTheDocument();
    // Y la cabecera lleva la cuenta de los dormidos, que es lo que se mira de un vistazo.
    expect(screen.getByText('Dormidos')).toBeInTheDocument();
  });

  /**
   * «DORMIDO» ES LA FRONTERA, no todos los ceros. Por encima del primero al que nadie llega, todos están a cero
   * por definición: marcarlos los diez tapaba justo la línea que se busca —hasta dónde llega hoy la gente— con
   * nueve repeticiones de lo mismo.
   */
  it('solo marca «Dormido» en el primer escalón al que nadie llega', () => {
    const mirrors = [espejo(['completados-10']), espejo(['completados-10']), espejo(['completados-10'])];
    render(<AdminAchievements onBack={() => {}} mirrors={mirrors} />);

    const frontera = screen.getByText('Créditos finales II').closest('tr') as HTMLElement;
    expect(within(frontera).getByText('Dormido')).toBeInTheDocument();
    // Y los de más arriba, con su 0 % pero sin la marca.
    for (const nombre of ['Créditos finales III', 'Créditos finales IV', 'Créditos finales XI']) {
      const fila = screen.getByText(nombre).closest('tr') as HTMLElement;
      expect(within(fila).getByText('0 % · 0/3'), nombre).toBeInTheDocument();
      expect(within(fila).queryByText('Dormido'), nombre).not.toBeInTheDocument();
    }
  });

  /**
   * EL SALTO SALE DE LOS UMBRALES, así que se ve aunque no haya nadie a quien medir: es la señal de «entre estos
   * dos escalones hay un trayecto largo sin ninguna medalla», que es la pregunta de los intermedios.
   */
  it('señala el salto de umbrales sin necesidad de muestra', () => {
    render(<AdminAchievements onBack={() => {}} />);
    // «Créditos finales II» pide 25 tras 10: dos veces y media el anterior.
    const fila = screen.getByText('Créditos finales II').closest('tr') as HTMLElement;
    expect(within(fila).getByText('Salto ×2.5')).toBeInTheDocument();
    // Y de 300 a 400 no hay salto que avisar (×1,33).
    const suave = screen.getByText('Créditos finales X').closest('tr') as HTMLElement;
    expect(within(suave).queryByText(/^Salto/)).not.toBeInTheDocument();
  });

  it('el retirado deja de ofrecerse, y se dice', async () => {
    render(<AdminAchievements onBack={() => {}} />);
    // «Speedrun» es retirado Y oculto, así que primero hay que destaparlo.
    await userEvent.click(screen.getByRole('button', { name: 'Revelar ocultos' }));
    const fila = screen.getByText('Speedrun I').closest('tr') as HTMLElement;
    expect(within(fila).getByText('No')).toBeInTheDocument();
  });

  /**
   * LOS OCULTOS, TAPADOS COMO LOS VE LA GENTE. Es una pantalla de revisión: si enseña de entrada lo que el §6.7
   * manda esconder, no se puede comprobar que el secreto se guarda bien. El interruptor los destapa SOLO aquí.
   */
  it('tapa los ocultos como los ve la gente, y el interruptor los destapa', async () => {
    render(<AdminAchievements onBack={() => {}} />);
    expect(screen.queryByText('Obra maestra I')).not.toBeInTheDocument();
    expect(screen.getAllByText('Logro oculto').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Revelar ocultos' }));
    expect(screen.getByText('Obra maestra I')).toBeInTheDocument();
    expect(screen.getByText('Ponle un 100 a un juego')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tapar los ocultos como se ven' }));
    expect(screen.queryByText('Obra maestra I')).not.toBeInTheDocument();
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

  it('no se edita nada: el único campo es la búsqueda', async () => {
    const onBack = vi.fn();
    render(<AdminAchievements onBack={onBack} />);
    // La búsqueda y nada más: ni un campo de texto donde escribir un umbral, un nombre o una condición. El
    // catálogo vive en el código, y lo que el panel hace es DECIR qué escribir, no escribirlo.
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: A.back }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  /**
   * PREPARAR UN ESCALÓN es la única acción de la pantalla, y no escribe nada: deja el cambio redactado. Los tres
   * pasos van juntos porque olvidarse del segundo —el `id` en `MIRROR_IDS`— es lo que deja un logro que no se
   * publica, en silencio.
   */
  it('prepara el escalón del hueco con los tres pasos y las cifras de hoy', async () => {
    render(<AdminAchievements onBack={() => {}} />);
    // Entre 10 y 25 hay «salto ×2.5»; la media geométrica redondeada son 15. (El mismo hueco sale en varias
    // escaleras, así que el botón se busca DENTRO de la fila de esta.)
    const fila = screen.getByText('Créditos finales II').closest('tr') as HTMLElement;
    await userEvent.click(within(fila).getByRole('button', { name: 'Preparar escalón 15' }));

    expect(screen.getByText('Insertar 15 en «completados»')).toBeInTheDocument();
    expect(screen.getByText(/steps: \[10, 15, 25, 50/)).toBeInTheDocument();
    expect(screen.getByText(/al FINAL de MIRROR_IDS: 'completados-15',/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`total ${SCORING_ACHIEVEMENTS.length} → ${SCORING_ACHIEVEMENTS.length + 1}`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`MIRROR_ORDER ${MIRROR_ORDER.length} → ${MIRROR_ORDER.length + 1}`))).toBeInTheDocument();
    // Y avisa de lo único que no se puede evitar: los de arriba corren de romano.
    expect(screen.getByText(/corren de romano \(Créditos finales II/)).toBeInTheDocument();
  });

  it('el umbral propuesto parte el hueco en dos, no por la mitad aritmética', () => {
    // Entre 10 y 100, la media aritmética (55) deja el primer tramo diez veces más corto que el segundo.
    expect(suggestStep(10, 100)).toBe(30);
    expect(suggestStep(10, 25)).toBe(15);
    expect(suggestStep(100, 500)).toBe(225);
    // Y donde no cabe ningún entero —las escaleras que empiezan en 1, 2, 3…— no propone nada.
    expect(suggestStep(1, 2)).toBe(0);
  });
});
