import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAchievements, measuredFrontier, unseenSteps } from '../../src/view/components/AdminAchievements';
import { ADMIN_ACHIEVEMENTS_UI as A } from '../../src/core/constants/adminLabels';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_LADDER, LADDERS, SCORING_ACHIEVEMENTS, applyExtraSteps } from '../../src/core/achievements/catalog';
import { MIRROR_ORDER, packAchievements } from '../../src/core/achievements/pack';
import type { AchievementState } from '../../src/core/achievements/types';

/**
 * EL LÍMITE DE 5 s NO MIDE NADA EN ESTE FICHERO. La pantalla pinta las 64 escaleras con sus 400 escalones —dos
 * textos por escalón, miles de nodos— en CADA test, así que un render cuesta cientos de milisegundos con la máquina desahogada y se acerca al
 * límite en cuanto va cargada: en el CI, con los procesos compitiendo, es donde saltó. Aquí no hay nada asíncrono
 * de verdad que esperar, o sea que el temporizador solo está para cazar un cuelgue, y para eso 20 s sobran. Sin
 * esto, una máquina ocupada tumba media docena de tests sin que nada esté roto.
 */
vi.setConfig({ testTimeout: 20_000 });

/** Un espejo de verdad, empaquetado por el empaquetador: el bitmap se indexa por `MIRROR_ORDER`, no a mano. */
function espejo(ids: readonly string[]): string {
  const states: AchievementState[] = ids.map((id) => ({ id, level: 1, value: 0, next: null, unlockedAt: 0 }));
  return packAchievements(states, []);
}

/**
 * Abre la ficha de «preparar un escalón» desde el PIE de una escalera, que es el único sitio desde el que se
 * abre: los enlaces por fila («Preparar escalón 15») se retiraron con la señal de salto de umbrales que los
 * acompañaba. El botón propone alargar la escalera, así que el umbral de partida es el doble del último.
 */
async function abrirPlan(escalera: string): Promise<void> {
  const ficha = screen.getByText(escalera).closest('.admin-card') as HTMLElement;
  await userEvent.click(within(ficha).getByRole('button', { name: A.prepareAny }));
}

describe('catálogo de logros — la vista de revisión del panel de administración', () => {
  it('enseña TODAS las escaleras con sus escalones: es una revisión, no una muestra', () => {
    render(<AdminAchievements onBack={() => {}} />);
    // De una pasada: buscar las 50 por separado recorre el documento entero 50 veces y se come el test.
    const pintadas = new Set(screen.getAllByText(/^key: /).map((node) => node.textContent));
    for (const ladder of LADDERS) {
      expect(pintadas.has(`key: ${ladder.key}`), ladder.key).toBe(true);
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
    // «Nadie ha llegado» sale en el esquema como término explicado; lo que no puede haber es una FILA marcada.
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

    // Y LA MISMA CIFRA, DIBUJADA: la barra es lo que deja ver de un vistazo dónde se queda la gente al subir la
    // escalera. Sale de la cifra, no de un cálculo aparte, así que no pueden decir cosas distintas.
    const barra = (fila: HTMLElement) => (fila.querySelector('.admin-ach-meter-fill') as HTMLElement).style.width;
    expect(barra(primero)).toBe('100%');
    expect(barra(segundo)).toBe('33%');
    // Repite lo que ya dice el texto de al lado, así que no se anuncia dos veces.
    expect(primero.querySelector('.admin-ach-meter')).toHaveAttribute('aria-hidden', 'true');
  });

  /** Sin muestra no hay barra: dibujar un canal vacío afirmaría un 0 % que nadie ha medido. */
  it('sin espejos publicados no pinta ninguna barra', () => {
    render(<AdminAchievements onBack={() => {}} />);
    expect(document.querySelectorAll('.admin-ach-meter')).toHaveLength(0);
  });

  /** Las dos decisiones que la pantalla tiene que servir en bandeja: sobra escalón o falta uno. */
  it('marca el escalón que tiene casi todo el mundo', () => {
    const mirrors = [espejo(['completados-10']), espejo(['completados-10']), espejo(['completados-10'])];
    render(<AdminAchievements onBack={() => {}} mirrors={mirrors} />);
    const regalado = screen.getByText('Créditos finales I').closest('tr') as HTMLElement;
    expect(within(regalado).getByText(A.gift)).toBeInTheDocument();
    // Y la cabecera lleva la cuenta de los escalones sin nadie, que es lo que se mira de un vistazo.
    expect(screen.getByText(A.asleepTotal)).toBeInTheDocument();
  });

  /**
   * «NADIE HA LLEGADO» ES LA FRONTERA, no todos los ceros. Por encima del primero al que no llega nadie, todos
   * están a cero por definición: marcarlos los diez tapaba justo la línea que se busca —hasta dónde llega hoy la
   * gente— con nueve repeticiones de lo mismo.
   */
  it('solo marca «nadie ha llegado» en el primer escalón al que no llega nadie', () => {
    const mirrors = [espejo(['completados-10']), espejo(['completados-10']), espejo(['completados-10'])];
    render(<AdminAchievements onBack={() => {}} mirrors={mirrors} />);

    const frontera = screen.getByText('Créditos finales II').closest('tr') as HTMLElement;
    expect(within(frontera).getByText(A.asleep)).toBeInTheDocument();
    // Y los de más arriba, con su 0 % pero sin la marca.
    for (const nombre of ['Créditos finales III', 'Créditos finales IV', 'Créditos finales XI']) {
      const fila = screen.getByText(nombre).closest('tr') as HTMLElement;
      expect(within(fila).getByText('0 % · 0/3'), nombre).toBeInTheDocument();
      expect(within(fila).queryByText(A.asleep), nombre).not.toBeInTheDocument();
    }
  });

  /**
   * LA LÍNEA HASTA DONDE LLEGA LA ESCALERA HOY. Es la regla de la zanahoria leída sobre la muestra, y el caso que
   * la fija es el de «Un verano entero»: al 25 no ha llegado nadie y aun así SE VE —es el siguiente reto de los
   * dos que tienen el 15—, mientras que del 40 para arriba no le aparecen a una sola persona, porque para que un
   * escalón te salga tienes que tener el de debajo.
   */
  describe('los escalones que hoy no ve nadie', () => {
    const maraton = ACHIEVEMENTS_BY_LADDER.get('maraton') || [];
    const conGente = (porEscalon: Record<number, number>) =>
      unseenSteps(maraton, (def) => porEscalon[def.step] ?? 0, false);

    it('deja fuera la frontera y marca lo que hay por encima', () => {
      const fuera = conGente({ 1: 6, 3: 5, 5: 4, 10: 3, 15: 2 });
      // El 25 se ve: nadie ha llegado, pero es el siguiente de quien tiene el 15.
      expect(fuera.has('maraton-25')).toBe(false);
      expect([...fuera]).toEqual(['maraton-40', 'maraton-60', 'maraton-75']);
    });

    it('la línea sube sola en cuanto alguien alcanza el escalón de debajo', () => {
      const fuera = conGente({ 1: 6, 3: 5, 5: 4, 10: 3, 15: 2, 25: 1 });
      expect([...fuera]).toEqual(['maraton-60', 'maraton-75']);
    });

    /** Sin nadie en toda la escalera se sigue viendo el primero: es la zanahoria de quien no tiene nada. */
    it('el primer escalón lo ve todo el mundo aunque no lo tenga nadie', () => {
      const fuera = conGente({});
      expect(fuera.has('maraton-1')).toBe(false);
      expect(fuera.size).toBe(maraton.length - 1);
    });

    /**
     * OCULTA NO HAY ZANAHORIA: `withoutHidden` se lleva todo lo que no esté conseguido, así que la frontera deja
     * de verse también. Es la consecuencia del interruptor, y aquí se ve dibujada.
     */
    it('con la escalera oculta, lo que nadie tiene no lo ve nadie', () => {
      const porEscalon: Record<number, number> = { 1: 6, 3: 5, 5: 4, 10: 3, 15: 2 };
      const oculta = unseenSteps(maraton, (def) => porEscalon[def.step] ?? 0, true);
      expect([...oculta]).toEqual(['maraton-25', 'maraton-40', 'maraton-60', 'maraton-75']);
    });

    /** Un retirado no se ofrece a nadie, y tampoco gasta el turno: el siguiente ocupa su sitio. */
    it('los retirados no se ven, y dejan pasar el turno al siguiente', () => {
      const speedrun = ACHIEVEMENTS_BY_LADDER.get('speedrun') || [];
      expect(speedrun.every((def) => def.retired)).toBe(true);
      expect(unseenSteps(speedrun, () => 0, false).size).toBe(speedrun.length);
    });

    it('lo marca en la fila, y solo con muestra que lo sostenga', () => {
      const mirrors = [espejo(['maraton-1']), espejo(['maraton-1', 'maraton-3'])];
      const { unmount } = render(<AdminAchievements onBack={() => {}} mirrors={mirrors} />);
      // El 5 es la frontera y se ve; el 10 ya no lo tiene nadie delante.
      const frontera = screen.getByText('Un verano entero III').closest('tr') as HTMLElement;
      expect(within(frontera).queryByText(A.unseen)).not.toBeInTheDocument();
      const muerto = screen.getByText('Un verano entero IV').closest('tr') as HTMLElement;
      expect(within(muerto).getByText(A.unseen)).toBeInTheDocument();
      expect(muerto).toHaveClass('is-unseen');
      // El rótulo va UNA vez, en la primera del tramo: el raíl del canto une el resto. Las de más arriba llevan
      // la marca de fila pero no repiten el texto.
      const siguiente = screen.getByText('Un verano entero V').closest('tr') as HTMLElement;
      expect(siguiente).toHaveClass('is-unseen');
      expect(within(siguiente).queryByText(A.unseen)).not.toBeInTheDocument();
      unmount();

      // Sin espejos no hay con qué saberlo, así que no se marca ninguna FILA. (El término sigue saliendo en el
      // esquema, que es una lista de definiciones: por eso se mira el cuerpo de la tabla y no la pantalla.)
      render(<AdminAchievements onBack={() => {}} />);
      expect(document.querySelectorAll('tbody tr.is-unseen')).toHaveLength(0);
      expect(document.querySelectorAll('tbody .admin-ach-unseen')).toHaveLength(0);
    });
  });

  /**
   * LA APERTURA COMUNITARIA es lo único de esta pantalla que cambia lo que ve TODO EL MUNDO sin tocar el
   * interruptor de una escalera, así que se publica a mano: mirar el panel no puede escribir nada.
   */
  describe('publicar la apertura', () => {
    const mirrors = [espejo(['completados-10', 'completados-25']), espejo(['completados-10'])];

    it('mide la frontera de cada escalera y ofrece publicarla cuando no es la que hay', async () => {
      const onPublishFrontier = vi.fn().mockResolvedValue(undefined);
      render(<AdminAchievements onBack={() => {}} mirrors={mirrors} openFrontier={{}} onPublishFrontier={onPublishFrontier} />);

      await userEvent.click(screen.getByRole('button', { name: A.frontierPublish }));
      // El `id` del escalón más alto al que ha llegado alguien, por escalera. Nada de escaleras sin nadie.
      expect(onPublishFrontier).toHaveBeenCalledWith({ completados: 'completados-25' });
      expect(screen.getByText(A.frontierPublished)).toBeInTheDocument();
    });

    it('con la apertura ya publicada no ofrece publicar nada', () => {
      render(<AdminAchievements onBack={() => {}} mirrors={mirrors} openFrontier={{ completados: 'completados-25' }} onPublishFrontier={vi.fn()} />);
      expect(screen.getByText(A.frontierSame(1))).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: A.frontierPublish })).not.toBeInTheDocument();
    });

    it('sin espejos no hay nada que abrir, y se dice', () => {
      render(<AdminAchievements onBack={() => {}} onPublishFrontier={vi.fn()} />);
      expect(screen.getByText(A.frontierNone)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: A.frontierPublish })).not.toBeInTheDocument();
    });

    it('si la publicación falla, lo dice', async () => {
      const onPublishFrontier = vi.fn().mockRejectedValue(new Error('permission-denied'));
      render(<AdminAchievements onBack={() => {}} mirrors={mirrors} openFrontier={{}} onPublishFrontier={onPublishFrontier} />);
      await userEvent.click(screen.getByRole('button', { name: A.frontierPublish }));
      expect(screen.getByText(A.frontierFailed)).toBeInTheDocument();
    });

    /** Una escalera descendente ordena al revés, así que «lo más lejos» es la POSICIÓN, no el número mayor. */
    it('en una escalera descendente toma el escalón más avanzado, no el umbral más alto', () => {
      const grupos = [{
        ladder: LADDERS.find((l) => l.key === 'estanteria-cero')!,
        steps: ACHIEVEMENTS_BY_LADDER.get('estanteria-cero') || [],
      }];
      // Umbrales [50, 25, 10, 5, 1]: alguien ha bajado hasta 25, que es el SEGUNDO escalón.
      const alcanzado = new Set(['estanteria-cero-50', 'estanteria-cero-25']);
      expect(measuredFrontier(grupos, (def) => (alcanzado.has(def.id) ? 1 : 0)))
        .toEqual({ 'estanteria-cero': 'estanteria-cero-25' });
    });
  });

  /**
   * BORRAR TODAS LAS VITRINAS es la acción más destructiva de la pantalla y la única que toca a todo el censo, así
   * que va en DOS PASOS: el primer botón solo enseña el aviso, y hasta que no se confirma no se escribe nada.
   */
  describe('borrar todos los logros publicados', () => {
    it('no borra nada hasta que se confirma, y dice a cuántos afecta', async () => {
      const onResetAll = vi.fn().mockResolvedValue(7);
      render(<AdminAchievements onBack={() => {}} onResetAll={onResetAll} censusSize={7} />);

      await userEvent.click(screen.getByRole('button', { name: A.resetAll }));
      expect(onResetAll, 'ha borrado sin confirmar').not.toHaveBeenCalled();
      // El aviso dice el alcance y las dos cosas que hay que saber: nadie pierde un logro, y vuelve solo.
      expect(screen.getByText(A.resetAllConfirm(7))).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: A.resetAll }));
      expect(onResetAll).toHaveBeenCalledTimes(1);
      expect(await screen.findByText(A.resetAllDone(7))).toBeInTheDocument();
    });

    it('se puede echar atrás sin borrar nada', async () => {
      const onResetAll = vi.fn();
      render(<AdminAchievements onBack={() => {}} onResetAll={onResetAll} censusSize={3} />);
      await userEvent.click(screen.getByRole('button', { name: A.resetAll }));
      await userEvent.click(screen.getByRole('button', { name: A.prepareClose }));
      expect(onResetAll).not.toHaveBeenCalled();
      expect(screen.queryByText(A.resetAllConfirm(3))).not.toBeInTheDocument();
    });

    it('si falla, lo dice y no se traga el error', async () => {
      const onResetAll = vi.fn().mockRejectedValue(new Error('permission-denied'));
      render(<AdminAchievements onBack={() => {}} onResetAll={onResetAll} censusSize={2} />);
      await userEvent.click(screen.getByRole('button', { name: A.resetAll }));
      await userEvent.click(screen.getByRole('button', { name: A.resetAll }));
      expect(await screen.findByText(A.resetAllFailed)).toBeInTheDocument();
    });

    /** Sin la acción no hay botón: la pantalla se monta también en pruebas que no le pasan el hub. */
    it('sin la acción, el botón no existe', () => {
      render(<AdminAchievements onBack={() => {}} />);
      expect(screen.queryByRole('button', { name: A.resetAll })).not.toBeInTheDocument();
    });
  });

  /**
   * LAS SEÑALES DE ESTA COLUMNA HABLAN DE GENTE Y DE NADA MÁS. La que salía de los umbrales («Salto ×2.5») se
   * retiró: en una columna titulada «quién ha llegado» era el único dato que no medía a nadie, y decía lo mismo
   * que la caída con otra unidad. Este test defiende que no vuelva a colarse.
   */
  it('no mezcla señales de umbrales en la columna de gente', () => {
    render(<AdminAchievements onBack={() => {}} />);
    expect(screen.queryByText(/^Salto ×/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Preparar escalón \d/ })).not.toBeInTheDocument();
  });

  /**
   * LO QUE VE EL USUARIO NO SE DEDUCE DE LA MUESTRA, y era la confusión que se llevaba la pantalla por delante:
   * un escalón al que no ha llegado nadie se sigue ofreciendo igual. Lo único que decide qué se enseña es el
   * interruptor de la escalera, y por eso las dos cosas se dicen con palabras que no se parecen.
   */
  it('dice qué ve cada usuario sin mezclarlo con lo que mide la muestra', () => {
    const mirrors = [espejo(['completados-10']), espejo(['completados-10'])];
    render(<AdminAchievements onBack={() => {}} mirrors={mirrors} onToggleHidden={vi.fn()} />);

    // La escalera se ofrece, y la línea de estado dice la regla entera: lo tuyo, y UNO más.
    const creditos = screen.getByText('Créditos finales').closest('.admin-card') as HTMLElement;
    expect(within(creditos).getByText(A.visibleNow)).toBeInTheDocument();
    // Aunque a su segundo escalón no haya llegado nadie: eso no lo esconde.
    const frontera = screen.getByText('Créditos finales II').closest('tr') as HTMLElement;
    expect(within(frontera).getByText(A.asleep)).toBeInTheDocument();
    expect(within(creditos).queryByText(A.hiddenNow)).not.toBeInTheDocument();

    // Y una oculta dice justo lo contrario, incluida la consecuencia: quien no la tiene se queda sin ese reto.
    const oculta = screen.getByText('Obra maestra').closest('.admin-card') as HTMLElement;
    expect(within(oculta).getByText(A.hiddenNow)).toBeInTheDocument();
  });

  /**
   * SE MARCA LA EXCEPCIÓN, NO LA REGLA. Era una columna «Ofrecido» que decía «Sí» en 259 de los 261 escalones:
   * una columna entera de ruido para señalar dos filas. Ahora la marca va junto al nombre del que no se ofrece, y
   * lo que este test defiende es justo eso — que la marca solo salga donde toca.
   */
  /**
   * LOS DOS TEXTOS LLEVAN SU RÓTULO EN LA CELDA, y no solo en la cabecera de la tabla: en móvil esta tabla se lee
   * como fichas —cinco columnas no caben en 390 px— y ahí la cabecera no está, así que el rótulo de cada línea
   * sale de este atributo (`admin.scss`). Sin él, las dos frases quedan una debajo de otra sin saber cuál es cuál.
   */
  it('cada texto lleva su rótulo encima, que es lo que lo salva en móvil', () => {
    render(<AdminAchievements onBack={() => {}} />);
    const fila = screen.getByText('Termina 10 juegos').closest('td') as HTMLElement;
    expect(fila).toHaveAttribute('data-col', A.colGoalShort);
    expect(screen.getByText('Has terminado 10 juegos').closest('td')).toHaveAttribute('data-col', A.colDoneShort);
  });

  it('el retirado deja de ofrecerse, y se dice en su fila', () => {
    render(<AdminAchievements onBack={() => {}} />);
    const fila = screen.getByText('Speedrun I').closest('tr') as HTMLElement;
    expect(within(fila).getByText(A.notOffered)).toBeInTheDocument();
    // Y el que sí se ofrece no lleva nada: la regla se calla.
    const vigente = screen.getByText('Créditos finales I').closest('tr') as HTMLElement;
    expect(within(vigente).queryByText(A.notOffered)).not.toBeInTheDocument();
  });

  /**
   * EL LISTADO SE PARTE POR FAMILIAS, y el orden de los tramos sale del catálogo: una familia nueva aparece sola
   * y donde se declaró, en vez de caerse en silencio de una lista escrita a mano en la vista.
   */
  it('agrupa las escaleras por familia, en el orden en que el catálogo las declara', () => {
    render(<AdminAchievements onBack={() => {}} />);
    const declarado = [...new Set(LADDERS.map((ladder) => ladder.family))].map((family) => A.families[family]);
    const pintado = [...document.querySelectorAll('.admin-ach-family-head > span')].map((node) => node.textContent);
    expect(pintado).toEqual(declarado);
    // Y cada tramo dice cuántas escaleras trae, que es lo que permite situarse sin contarlas.
    const espejo = LADDERS.filter((ladder) => ladder.family === 'mirror').length;
    expect(screen.getAllByText(A.familyCount(espejo)).length).toBeGreaterThan(0);
  });

  /**
   * AQUÍ NO SE TAPA NADA. Es la pantalla donde hay que LEER los textos de cada escalón, y un «?» no se revisa:
   * taparlos convertía la única vista que puede auditarlos en la misma adivinanza que ve el usuario.
   */
  it('los ocultos se leen enteros: es la pantalla donde hay que revisarlos', () => {
    render(<AdminAchievements onBack={() => {}} />);
    expect(screen.getByText('Obra maestra I')).toBeInTheDocument();
    expect(screen.getByText('Ponle un 100 a un juego')).toBeInTheDocument();
    expect(screen.queryByText('Logro oculto')).not.toBeInTheDocument();
    expect(screen.queryByText('Se revela al conseguirlo.')).not.toBeInTheDocument();
  });

  /**
   * EL INTERRUPTOR QUE SÍ AFECTA A LA GENTE. La pantalla no habla con Firestore: pide el cambio y cuenta lo que
   * pasó. Eso es lo que permite probarlo sin emulador, y lo que hace que un fallo de reglas se vea EN SU FICHA
   * —no en un aviso global— porque lo que hay que saber es cuál no se guardó.
   */
  it('muestra el estado de ocultación y pide el cambio contrario', async () => {
    const onToggleHidden = vi.fn().mockResolvedValue(undefined);
    render(<AdminAchievements onBack={() => {}} onToggleHidden={onToggleHidden} />);

    // «Obra maestra» nace oculta en el catálogo, así que el botón ofrece mostrarla.
    const oculta = screen.getByText('Obra maestra').closest('.admin-card') as HTMLElement;
    expect(within(oculta).getByText(A.hiddenNow)).toBeInTheDocument();
    await userEvent.click(within(oculta).getByRole('button', { name: A.show }));
    expect(onToggleHidden).toHaveBeenCalledWith('obra-maestra', false);
    // Y se dice que el usuario lo verá al abrir sus logros, porque no es instantáneo.
    expect(within(oculta).getByText(/Cada usuario lo verá al abrir sus logros/)).toBeInTheDocument();
  });

  it('respeta el interruptor guardado: una escalera revelada ofrece volver a ocultarla', () => {
    render(<AdminAchievements onBack={() => {}} onToggleHidden={vi.fn()} hiddenOverrides={{ 'obra-maestra': false }} />);
    const revelada = screen.getByText('Obra maestra').closest('.admin-card') as HTMLElement;
    expect(within(revelada).getByText(A.visibleNow)).toBeInTheDocument();
    expect(within(revelada).getByRole('button', { name: 'Ocultar hasta conseguirlo' })).toBeInTheDocument();
  });

  it('si el guardado falla, lo dice en la ficha de esa escalera', async () => {
    const onToggleHidden = vi.fn().mockRejectedValue(new Error('permission-denied'));
    render(<AdminAchievements onBack={() => {}} onToggleHidden={onToggleHidden} />);
    const oculta = screen.getByText('Obra maestra').closest('.admin-card') as HTMLElement;
    await userEvent.click(within(oculta).getByRole('button', { name: A.show }));
    expect(within(oculta).getByText(/No se ha podido guardar/)).toBeInTheDocument();
  });

  it('el buscador recorta por nombre y por texto, y dice cuántas quedan', async () => {
    render(<AdminAchievements onBack={() => {}} />);
    await userEvent.type(screen.getByRole('searchbox'), 'plataformas');
    expect(screen.getByText('key: plataformas')).toBeInTheDocument();
    expect(screen.queryByText('key: completados')).not.toBeInTheDocument();
    expect(screen.getByText(/de 64 escaleras$/)).toBeInTheDocument();
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
   * AÑADIR UN ESCALÓN A UNA ESCALERA, sin desplegar y para todo el mundo (§6.4bis). El panel lo guarda en
   * `appConfig`, el catálogo se reconstruye con él dentro y desde ahí es un logro como cualquier otro. Estos
   * tests fijan la CONDUCTA DE LA PANTALLA —abre vacía, entra al pulsar, se recoloca, se puede quitar— y el
   * camino completo (evaluar, contar y publicar) va en `tests/unit/achievementsExtraSteps.test.ts`.
   */
  describe('preparar un escalón nuevo', () => {
    const fichaDe = (escalera: string) =>
      screen.getByText(escalera).closest('.admin-card') as HTMLElement;

    /** El escritor de añadidos, con la misma forma que el del hub: guarda la lista entera de esa escalera. */
    function conAñadidos(iniciales: Record<string, readonly number[]> = {}) {
      let guardados: Record<string, readonly number[]> = { ...iniciales };
      const onSetExtraSteps = vi.fn(async (key: string, steps: readonly number[]) => {
        guardados = { ...guardados, [key]: [...steps].sort((a, b) => a - b) };
        if (steps.length === 0) delete guardados[key];
        vista.rerender(<AdminAchievements onBack={() => {}} extraSteps={guardados} onSetExtraSteps={onSetExtraSteps} />);
      });
      const vista = render(
        <AdminAchievements onBack={() => {}} extraSteps={guardados} onSetExtraSteps={onSetExtraSteps} />,
      );
      return { onSetExtraSteps, guardados: () => guardados };
    }

    /**
     * ABRE VACÍA Y NO TOCA NADA. Proponía el doble del último escalón, y proponerlo era meterlo: el 1000
     * aparecía en la tabla sin que nadie lo hubiera pedido y había que borrarlo para escribir otro.
     */
    it('abre con el campo vacío y sin añadir ningún escalón', async () => {
      conAñadidos();
      const ficha = fichaDe('Créditos finales');
      const filasAntes = within(ficha).getAllByRole('row').length;

      await abrirPlan('Créditos finales');

      expect(within(ficha).getByRole('spinbutton')).toHaveValue(null);
      expect(within(ficha).getAllByRole('row')).toHaveLength(filasAntes);
      expect(within(ficha).queryByText(A.extraFlag)).not.toBeInTheDocument();
      // Y sin nada escrito no se puede añadir: no hay error, simplemente no hay umbral.
      expect(within(ficha).getByRole('button', { name: A.prepareAdd })).toBeDisabled();
      expect(within(ficha).queryByText(A.prepareInvalid)).not.toBeInTheDocument();
    });

    /** ESCRIBIR NO AÑADE: el escalón entra al pulsar, y hasta entonces la tabla se queda como está. */
    it('escribir el umbral no toca la tabla; añadir sí', async () => {
      const { onSetExtraSteps } = conAñadidos();
      await abrirPlan('Créditos finales');
      const ficha = fichaDe('Créditos finales');
      const filasAntes = within(ficha).getAllByRole('row').length;

      await userEvent.type(within(ficha).getByRole('spinbutton'), '125');
      expect(within(ficha).getAllByRole('row')).toHaveLength(filasAntes);
      expect(onSetExtraSteps).not.toHaveBeenCalled();

      await userEvent.click(within(ficha).getByRole('button', { name: A.prepareAdd }));

      expect(onSetExtraSteps).toHaveBeenCalledWith('completados', [125]);
      // Guardado: una fila más, en su sitio y marcada como pendiente. Y el campo se vacía para el siguiente.
      expect(within(fichaDe('Créditos finales')).getAllByRole('row')).toHaveLength(filasAntes + 1);
      expect(within(fichaDe('Créditos finales')).getByText(A.extraFlag)).toBeInTheDocument();
      expect(within(fichaDe('Créditos finales')).getByRole('spinbutton')).toHaveValue(null);
    });

    /** Y SE RECOLOCA: el 15 entra como segundo escalón y los romanos de encima corren, cada uno con lo que era. */
    it('el escalón añadido se coloca en su sitio y corre los romanos de encima', async () => {
      conAñadidos({ completados: [15] });
      const ficha = fichaDe('Créditos finales');

      expect(within(ficha).getByText('Créditos finales II')).toBeInTheDocument();
      expect(within(ficha).getByText(A.previewMoved('Créditos finales II'))).toBeInTheDocument();
      expect(within(ficha).getByText('Créditos finales III')).toBeInTheDocument();
      // La tabla lo enseña SIN abrir la ficha: está guardado, no es una previsualización de lo que escribes.
      expect(within(ficha).queryByRole('spinbutton')).not.toBeInTheDocument();
    });

    it('los tres pasos de consolidación salen con TODOS los añadidos de esa escalera dentro', async () => {
      conAñadidos({ completados: [125, 350] });
      await abrirPlan('Créditos finales');
      const ficha = fichaDe('Créditos finales');

      expect(within(ficha).getByText(A.prepareTitleOf('completados'))).toBeInTheDocument();
      expect(within(ficha).getByText(/steps: \[10, 25, 50, .*125, 150, .*350, 400, 500\]/)).toBeInTheDocument();
      expect(within(ficha).getByText(/al FINAL de MIRROR_IDS: 'completados-125', 'completados-350',/)).toBeInTheDocument();
      // Dos escalones nuevos, dos casillas más en el total y dos bits más en el orden del espejo.
      expect(within(ficha).getByText(new RegExp(`total ${SCORING_ACHIEVEMENTS.length} → ${SCORING_ACHIEVEMENTS.length + 2}`))).toBeInTheDocument();
      expect(within(ficha).getByText(new RegExp(`MIRROR_ORDER ${MIRROR_ORDER.length} → ${MIRROR_ORDER.length + 2}`))).toBeInTheDocument();
      // Y el aviso de romanos, que es el único efecto que insertar un escalón no puede evitar.
      expect(within(ficha).getByText(/corren de romano/)).toBeInTheDocument();
    });

    /** Alargando por arriba no se renumera nadie: el aviso de romanos no debe salir. */
    it('alargar la escalera por arriba no avisa de romanos', async () => {
      conAñadidos({ completados: [1000] });
      await abrirPlan('Créditos finales');
      expect(within(fichaDe('Créditos finales')).queryByText(/corren de romano/)).not.toBeInTheDocument();
    });

    it('cada añadido se quita por separado', async () => {
      const { onSetExtraSteps } = conAñadidos({ completados: [125, 350] });
      await abrirPlan('Créditos finales');

      await userEvent.click(within(fichaDe('Créditos finales')).getByRole('button', { name: A.extraRemove(125) }));

      expect(onSetExtraSteps).toHaveBeenCalledWith('completados', [350]);
      const ficha = fichaDe('Créditos finales');
      expect(within(ficha).getByRole('button', { name: A.extraRemove(350) })).toBeInTheDocument();
      expect(within(ficha).queryByRole('button', { name: A.extraRemove(125) })).not.toBeInTheDocument();
    });

    /** Las dos formas de repetirse, y se distinguen: en el código ya está puesto y en los pendientes, apuntado. */
    it('no deja repetir un umbral, ni del código ni de lo ya añadido', async () => {
      const { onSetExtraSteps } = conAñadidos({ completados: [125] });
      await abrirPlan('Créditos finales');
      const campo = within(fichaDe('Créditos finales')).getByRole('spinbutton');

      await userEvent.type(campo, '50');
      expect(within(fichaDe('Créditos finales')).getByText(A.prepareTaken(50))).toBeInTheDocument();
      expect(within(fichaDe('Créditos finales')).getByRole('button', { name: A.prepareAdd })).toBeDisabled();

      await userEvent.clear(campo);
      await userEvent.type(campo, '125');
      expect(within(fichaDe('Créditos finales')).getByText(A.extraTaken(125))).toBeInTheDocument();
      expect(onSetExtraSteps).not.toHaveBeenCalled();
    });

    /**
     * CUANDO EL AÑADIDO YA ESTÁ EN EL CÓDIGO su entrada de configuración ya no hace nada —el catálogo se queda
     * con el escalón declarado— así que se dice en su línea y se puede retirar. No se borra sola, que sería
     * hacerlo a espaldas de quien mira, y no se cuenta dos veces en la tabla.
     */
    it('un añadido que ya llegó al código se dice, y no duplica su fila', async () => {
      conAñadidos({ completados: [50] });
      await abrirPlan('Créditos finales');
      const ficha = fichaDe('Créditos finales');

      expect(within(ficha).getByText(A.extraInCode)).toBeInTheDocument();
      expect(within(ficha).queryByText(A.extraFlag)).not.toBeInTheDocument();
      // Y no hay nada que consolidar: sin añadidos fuera del código, no hay tres pasos.
      expect(within(ficha).queryByText(/steps: \[/)).not.toBeInTheDocument();
    });

    it('la ficha sale dentro de la tarjeta de esa escalera, no fuera', async () => {
      conAñadidos();
      await abrirPlan('Créditos finales');

      const ficha = fichaDe('Créditos finales');
      expect(within(ficha).getByText(A.prepareTitleOf('completados'))).toBeInTheDocument();
      // Y el botón que la abre dice que está abierta, que es lo que la convierte en un interruptor.
      expect(within(ficha).getByRole('button', { name: A.prepareAny })).toHaveAttribute('aria-expanded', 'true');
      // Ninguna otra escalera se entera.
      expect(within(fichaDe('Retirada táctica')).queryByRole('spinbutton')).not.toBeInTheDocument();
    });

    it('cerrar la ficha no se lleva lo guardado', async () => {
      conAñadidos({ completados: [125] });
      const ficha = fichaDe('Créditos finales');
      const conPendiente = within(ficha).getAllByRole('row').length;

      await abrirPlan('Créditos finales');
      await userEvent.click(within(ficha).getByRole('button', { name: A.prepareClose }));

      expect(within(ficha).queryByRole('spinbutton')).not.toBeInTheDocument();
      // La fila del añadido sigue puesta: está guardada, no era una previsualización de la ficha abierta.
      expect(within(ficha).getAllByRole('row')).toHaveLength(conPendiente);
      expect(within(ficha).getByText(A.extraFlag)).toBeInTheDocument();
    });

    /**
     * CORREGIR UN UMBRAL QUE SE ESCRIBIÓ MAL. Es lo que más falta hace de esta pantalla —equivocarse tecleando un
     * número es lo más fácil que hay aquí— y por debajo es quitar y añadir: el `id` de un escalón ES su umbral.
     * De ahí las dos propiedades que fijan estos tests: **un solo guardado** (o el catálogo se queda un rato con
     * el umbral equivocado dentro) y **la misma guarda que quitar** (con alguien detrás, ni tocarlo).
     */
    describe('corregir un añadido', () => {
      // El catálogo se deja como estaba: el test de la guarda lo amplía para poder EMPAQUETAR un espejo con el
      // escalón dentro, y un catálogo ampliado a espaldas del resto del fichero desordena los que vienen detrás.
      afterEach(() => applyExtraSteps());

      it('cambia el umbral en un solo guardado', async () => {
        const { onSetExtraSteps } = conAñadidos({ completados: [125, 350] });
        await abrirPlan('Créditos finales');

        await userEvent.click(within(fichaDe('Créditos finales')).getByRole('button', { name: A.extraEdit(125) }));
        // Abre con su valor dentro: no se propone nada, se enseña lo que hay para cambiarle un dígito.
        const campo = within(fichaDe('Créditos finales')).getByRole('spinbutton', { name: A.extraEditLabel('completados-125') });
        expect(campo).toHaveValue(125);

        await userEvent.clear(campo);
        await userEvent.type(campo, '175');
        await userEvent.click(within(fichaDe('Créditos finales')).getByRole('button', { name: A.extraEditSave }));

        // UNA sola escritura, con la lista entera ya corregida: el otro añadido sigue donde estaba.
        expect(onSetExtraSteps).toHaveBeenCalledTimes(1);
        expect(onSetExtraSteps).toHaveBeenCalledWith('completados', [175, 350]);
        const ficha = fichaDe('Créditos finales');
        expect(within(ficha).getByRole('button', { name: A.extraEdit(175) })).toBeInTheDocument();
        expect(within(ficha).queryByRole('button', { name: A.extraEdit(125) })).not.toBeInTheDocument();
      });

      it('no deja repetir un umbral, y el suyo propio no cuenta como repetido', async () => {
        const { onSetExtraSteps } = conAñadidos({ completados: [125, 350] });
        await abrirPlan('Créditos finales');
        await userEvent.click(within(fichaDe('Créditos finales')).getByRole('button', { name: A.extraEdit(125) }));
        const campo = within(fichaDe('Créditos finales')).getByRole('spinbutton', { name: A.extraEditLabel('completados-125') });

        // Uno del código.
        await userEvent.clear(campo);
        await userEvent.type(campo, '50');
        expect(within(fichaDe('Créditos finales')).getByText(A.prepareTaken(50))).toBeInTheDocument();
        expect(within(fichaDe('Créditos finales')).getByRole('button', { name: A.extraEditSave })).toBeDisabled();

        // Y otro añadido de la misma escalera.
        await userEvent.clear(campo);
        await userEvent.type(campo, '350');
        expect(within(fichaDe('Créditos finales')).getByText(A.extraTaken(350))).toBeInTheDocument();

        // El suyo, en cambio, no es un error: es no haber cambiado nada, así que no hay nada que guardar.
        await userEvent.clear(campo);
        await userEvent.type(campo, '125');
        expect(within(fichaDe('Créditos finales')).queryByText(A.extraTaken(125))).not.toBeInTheDocument();
        expect(within(fichaDe('Créditos finales')).getByRole('button', { name: A.extraEditSave })).toBeDisabled();
        expect(onSetExtraSteps).not.toHaveBeenCalled();
      });

      it('cancelar lo deja como estaba', async () => {
        const { onSetExtraSteps } = conAñadidos({ completados: [125] });
        await abrirPlan('Créditos finales');
        await userEvent.click(within(fichaDe('Créditos finales')).getByRole('button', { name: A.extraEdit(125) }));
        const campo = within(fichaDe('Créditos finales')).getByRole('spinbutton', { name: A.extraEditLabel('completados-125') });
        await userEvent.clear(campo);
        await userEvent.type(campo, '150');

        await userEvent.click(within(fichaDe('Créditos finales')).getByRole('button', { name: A.extraEditCancel }));

        expect(onSetExtraSteps).not.toHaveBeenCalled();
        expect(within(fichaDe('Créditos finales')).getByRole('button', { name: A.extraEdit(125) })).toBeInTheDocument();
      });

      /**
       * LA MISMA GUARDA QUE QUITAR (§6.4): corregir cambia el `id`, así que a quien ya tuviera el escalón se le
       * retiraría la medalla. Con la muestra diciendo que alguien lo tiene, no hay ni botón.
       */
      it('no se puede corregir lo que ya tiene alguien', async () => {
        const onSetExtraSteps = vi.fn(async () => {});
        // El escalón tiene que EXISTIR en el catálogo para que su espejo se pueda empaquetar: es lo que hace el
        // repositorio al leer la configuración, y aquí se hace a mano porque la pantalla no habla con Firestore.
        applyExtraSteps({ completados: [125] });
        render(
          <AdminAchievements
            onBack={() => {}}
            mirrors={[espejo(['completados-125'])]}
            extraSteps={{ completados: [125] }}
            onSetExtraSteps={onSetExtraSteps}
          />,
        );
        await abrirPlan('Créditos finales');
        const ficha = fichaDe('Créditos finales');

        expect(within(ficha).getByText(A.extraLocked)).toBeInTheDocument();
        expect(within(ficha).queryByRole('button', { name: A.extraEdit(125) })).not.toBeInTheDocument();
        expect(within(ficha).queryByRole('button', { name: A.extraRemove(125) })).not.toBeInTheDocument();
      });
    });

    /** Si la escritura falla, se dice en la ficha de esa escalera y el campo NO se vacía. */
    it('dice que no se ha guardado, y no pierde lo escrito', async () => {
      const onSetExtraSteps = vi.fn(async () => { throw new Error('permission-denied'); });
      render(<AdminAchievements onBack={() => {}} onSetExtraSteps={onSetExtraSteps} />);
      await abrirPlan('Créditos finales');
      const ficha = fichaDe('Créditos finales');

      await userEvent.type(within(ficha).getByRole('spinbutton'), '125');
      await userEvent.click(within(ficha).getByRole('button', { name: A.prepareAdd }));

      expect(within(ficha).getByText(A.extraFailed)).toBeInTheDocument();
      expect(within(ficha).getByRole('spinbutton')).toHaveValue(125);
    });
  });
});
