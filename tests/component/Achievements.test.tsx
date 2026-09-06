import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AchievementStrip } from '../../src/view/components/stats/AchievementStrip';
import {
  ProfileAchievementStrip,
  ProfileAchievementsScreen,
  ProfileGlobalAchievements,
} from '../../src/view/components/socialhub/ProfileAchievements';
import { AchievementsScreen } from '../../src/view/components/stats/AchievementsScreen';
import { ACHIEVEMENTS_BY_ID } from '../../src/core/achievements/catalog';
import { summarize } from '../../src/core/achievements/summary';
import { packAchievements } from '../../src/core/achievements/pack';
import { listForScreen } from '../../src/viewmodel/useAchievements';
import type { AchievementState } from '../../src/core/achievements/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2020, 0, 1);
/** El día 2311 desde 2020-01-01 es el 30 de abril de 2026, que es la fecha que buscan un par de tests. */
const dia = (n: number) => EPOCH + n * DAY_MS + 12 * 3600_000;

/**
 * Un espejo, empaquetado por el empaquetador de verdad.
 *
 * Se construye así y no a mano porque el espejo dejó de ser texto legible: es un mapa de bits cuyo índice sale
 * del orden del catálogo, y escribirlo literal en un test lo ataría a ese orden.
 */
function espejo(ids: readonly string[], featured: readonly string[] = [], day = 2311): string {
  const states: AchievementState[] = ids.map((id) => ({ id, level: 1, value: 0, next: null, unlockedAt: dia(day) }));
  return packAchievements(states, featured);
}

const ESPEJO = espejo(
  ['completados-10', 'completados-25', 'completados-50', 'plataformas-3', 'obra-maestra-1', 'tesis-5'],
  ['plataformas-3'],
);

describe('la tira — solo imagen, el nombre al pasar por encima', () => {
  it('no pinta rótulos: cada medalla es una imagen con su nombre accesible', () => {
    render(
      <AchievementStrip
        items={[{ id: 'completados-50', level: 1, date: '12 mar 2026' }]}
      />,
    );

    // El nombre existe para quien no ve el cuadro: lo lleva la medalla, no un `title`.
    expect(screen.getByRole('img', { name: /Créditos finales III, conseguido el 12 mar 2026/ })).toBeInTheDocument();
    // Y el rótulo que sale al pasar por encima es DECORATIVO: si se anunciara, un lector de pantalla diría el
    // nombre dos veces por medalla. Que esté oculto a la vista lo hace el CSS (`:hover`/`:focus-visible`), que
    // aquí no se carga; lo que sí se puede fijar es que no entre en el árbol de accesibilidad.
    expect(screen.getByText('Créditos finales III')).toHaveAttribute('aria-hidden', 'true');
  });

  it('el rótulo se alcanza CON EL TABULADOR, no solo con el ratón', () => {
    // Un `title` de HTML no sale con teclado ni en táctil, y los lectores de pantalla lo tratan de forma
    // desigual. Por eso el rótulo es un elemento propio que responde también a `:focus-visible`.
    render(<AchievementStrip items={[{ id: 'completados-10', level: 1, date: '' }]} />);
    const control = screen.getByRole('img', { name: /Créditos finales/ }).parentElement as HTMLElement;
    expect(control.tabIndex).toBe(0);
  });

  it('SIN tope las pinta todas: es lo que se viene a mirar', () => {
    const items = ['completados-10', 'plataformas-3', 'generos-5', 'horas-10', 'resenas-5']
      .map((id) => ({ id, level: 1, date: '' }));
    render(<AchievementStrip items={items} />);
    expect(screen.getAllByRole('img')).toHaveLength(5);
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it('con tope recorta y dice cuántas quedan fuera (la ficha, donde la cabecera no puede crecer)', () => {
    const items = ['completados-10', 'plataformas-3', 'generos-5', 'horas-10', 'resenas-5']
      .map((id) => ({ id, level: 1, date: '' }));
    render(<AchievementStrip items={items} limit={2} />);
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('un `id` desconocido se ignora en silencio, sin romper la fila', () => {
    // Un amigo con una versión más nueva publicará logros que este cliente no conoce.
    render(<AchievementStrip items={[{ id: 'inventado-del-futuro', level: 2, date: '' }, { id: 'completados-10', level: 1, date: '' }]} />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });
});

describe('la ficha de una amistad', () => {
  it('pinta la tira desde el espejo, ordenada por rareza', () => {
    render(<ProfileAchievementStrip mirror={ESPEJO} onOpen={() => {}} />);
    const medallas = screen.getAllByRole('img');
    // El destacado va primero aunque sea el más común: es lo que esa persona quiere enseñar de sí misma.
    expect(medallas[0]).toHaveAccessibleName(/Guerra de consolas/);
    // Y detrás, por rareza: el excepcional antes que el raro y que el infrecuente.
    expect(medallas[1]).toHaveAccessibleName(/Obra maestra/);
    expect(medallas[2]).toHaveAccessibleName(/Créditos finales/);
  });

  it('si esa persona no publica logros, NO se pinta nada', () => {
    // Ni marco vacío ni «este usuario no tiene logros»: no hay nada que decir.
    const { container } = render(<ProfileAchievementStrip mirror="" onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('un espejo corrupto deja la vitrina vacía, nunca lanza', () => {
    const { container } = render(<ProfileAchievementStrip mirror=",,;;basura.x.y,,," onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tocar una medalla lleva al listado de esa persona', async () => {
    const abrir = vi.fn();
    render(<ProfileAchievementStrip mirror={ESPEJO} onOpen={abrir} />);
    await userEvent.click(screen.getAllByRole('button')[0]);
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('su listado enseña SOLO lo conseguido, con su día', () => {
    render(
      <ProfileAchievementsScreen
        mirror={ESPEJO}
        directoryMirrors={[]}
        owner="Fulano"
        onBack={() => {}}
      />,
    );

    // `h2`, como el título de cualquier otra pantalla de la app: el armazón es el mismo (`hub-screen`).
    expect(screen.getByRole('heading', { name: 'Logros de Fulano', level: 2 })).toBeInTheDocument();
    // Seis conseguidos y ni un bloqueado: el progreso de otra persona hacia lo que no tiene no es asunto de nadie.
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByText('Bloqueado')).not.toBeInTheDocument();
    expect(screen.getAllByText('30 abr 2026').length).toBe(6);
  });

  it('el porcentaje comparado NO se pinta sin muestra suficiente', () => {
    render(<ProfileAchievementsScreen mirror={ESPEJO} directoryMirrors={[espejo(['completados-10'])]} owner="Fulano" onBack={() => {}} />);
    expect(screen.queryByText(/lo tiene el/)).not.toBeInTheDocument();
  });

  it('con muestra suficiente, el porcentaje va SIEMPRE con su denominador', () => {
    // Sin denominador es lo único de esta pantalla que se puede leer como una afirmación global, y no lo es.
    const muestra = Array.from({ length: 25 }, (_unused, index) => espejo([index < 10 ? 'completados-10' : 'horas-10']));
    render(<ProfileAchievementsScreen mirror={ESPEJO} directoryMirrors={muestra} owner="Fulano" onBack={() => {}} />);
    expect(screen.getAllByText('lo tiene el 40 % · 10 de 25').length).toBeGreaterThan(0);
  });
});

describe('el listado propio', () => {
  const lista = [
      {
        def: ACHIEVEMENTS_BY_ID.get('completados-25')!,
        state: { id: 'completados-25', level: 1, value: 60, next: null, unlockedAt: Date.parse('2026-03-12T10:00:00Z') },
      },
      {
        def: ACHIEVEMENTS_BY_ID.get('speedrun-1')!,
        state: { id: 'speedrun-1', level: 0, value: 0, next: 1, unlockedAt: 0 },
      },
      {
        def: ACHIEVEMENTS_BY_ID.get('paciencia-1')!,
        state: { id: 'paciencia-1', level: 0, value: 0, next: 1, unlockedAt: 0 },
      },
  ];

  it('cada fila lleva imagen, nombre, condición y día', () => {
    render(<AchievementsScreen items={lista} summary={summarize([])} rarity={null} />);
    const fila = screen.getByText('Créditos finales II').closest('li') as HTMLElement;
    expect(within(fila).getByRole('img')).toBeInTheDocument();
    expect(within(fila).getByText('Juegos que has terminado: 25')).toBeInTheDocument();
    expect(within(fila).getByText('12 mar 2026')).toBeInTheDocument();
  });

  it('el oculto sin conseguir no da NINGUNA pista, ni siquiera su rareza', () => {
    // «Logro oculto · EXCEPCIONAL» reduce la adivinanza a las seis casillas excepcionales del catálogo.
    render(<AchievementsScreen items={lista} summary={summarize([])} rarity={null} />);
    const fila = screen.getByText('Logro oculto').closest('li') as HTMLElement;
    expect(within(fila).getByText('Se revela al conseguirlo.')).toBeInTheDocument();
    expect(within(fila).queryByText('EXCEPCIONAL')).not.toBeInTheDocument();
    expect(within(fila).queryByText('Speedrun')).not.toBeInTheDocument();
  });

  it('los avisos de «empieza a contar desde que instalaste la app» NO salen nunca', () => {
    // Se retiraron del catálogo entero, no solo de la vista: el campo `note` ya no existe.
    render(<AchievementsScreen items={lista} summary={summarize([])} rarity={null} />);
    expect(screen.queryByText(/empieza a contar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sello de las dos listas/)).not.toBeInTheDocument();
  });

  it('la cabecera dice cuántos del catálogo, con esas palabras', () => {
    const summary = summarize([{ id: 'completados-25', level: 1, value: 60, next: null, unlockedAt: 0 }]);
    render(<AchievementsScreen items={lista} summary={summary} rarity={null} />);
    expect(screen.getByText('1/251')).toBeInTheDocument();
    // «del catálogo actual» no es un adorno: añadir logros baja la fracción de todo el mundo, y eso se dice.
    expect(screen.getByText('0% del catálogo actual')).toBeInTheDocument();
  });

  it('el NIVEL de perfil no se enseña, aunque siga calculándose', () => {
    // Retirada deliberada mientras no esté decidido cómo se presenta: `summary.level` y los puntos siguen ahí
    // (y probados en tests/unit/achievements.test.ts), pero no salen a pantalla.
    const summary = summarize([{ id: 'completados-25', level: 1, value: 60, next: null, unlockedAt: 0 }]);
    expect(summary.level).toBeGreaterThan(0);
    render(<AchievementsScreen items={lista} summary={summary} rarity={null} />);
    expect(screen.queryByText('Nivel')).not.toBeInTheDocument();
    expect(screen.queryByText(/pts para el/)).not.toBeInTheDocument();
  });
});

describe('logros globales — el catálogo por lo común que es cada uno', () => {
  /** Muestra de 25 espejos: el primer escalón de `completados` lo tienen 20, el de `horas` 15, el de `obra-maestra` 2. */
  const MUESTRA = [
    ...Array.from({ length: 2 }, () => espejo(['completados-10', 'horas-10', 'obra-maestra-1'])),
    ...Array.from({ length: 13 }, () => espejo(['completados-10', 'horas-10'])),
    ...Array.from({ length: 5 }, () => espejo(['completados-10'])),
    ...Array.from({ length: 5 }, () => espejo(['plataformas-3'])),
  ];

  it('ordena de MAYOR a menor porcentaje', () => {
    render(<ProfileGlobalAchievements mirror="" directoryMirrors={MUESTRA} owner="Fulano" self={false} onBack={() => {}} />);
    const nombres = screen.getAllByRole('listitem').map((fila) => fila.querySelector('.ach-row-name')?.textContent);
    // Arriba lo que casi todo el mundo tiene: un hueco ahí se ve enseguida.
    expect(nombres[0]).toBe('Créditos finales I');
    expect(nombres[1]).toBe('Tiempo jugado I');
    // Y lo menos común, más abajo. (Un OCULTO no se puede buscar por su nombre aquí: sigue tapado mientras no se
    // consiga, también en esta lista — lo comprueba el último test de este bloque.)
    expect(nombres.indexOf('Guerra de consolas I')).toBeGreaterThan(1);
    // Lo que nadie de la muestra tiene queda al final, con su 0 %.
    expect(nombres[nombres.length - 1]).not.toBe('Créditos finales I');
  });

  it('lista el catálogo ENTERO, no solo lo que alguien tiene', () => {
    render(<ProfileGlobalAchievements mirror={espejo(['completados-10'])} directoryMirrors={MUESTRA} owner="Fulano" self={false} onBack={() => {}} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(251);
  });

  it('marca con recuadro lo que tiene el perfil que se está mirando', () => {
    render(<ProfileGlobalAchievements mirror={espejo(['completados-10', 'horas-10'])} directoryMirrors={MUESTRA} owner="Fulano" self={false} onBack={() => {}} />);
    const conseguidos = document.querySelectorAll('.ach-row.is-owned');
    expect(conseguidos).toHaveLength(2);
    // Y el recuadro NO es la única señal: va también en texto, porque forma y color no bastan.
    expect(screen.getAllByText('Conseguido')).toHaveLength(2);
  });

  it('en tu propia ficha cambia la voz', () => {
    render(<ProfileGlobalAchievements mirror={espejo(['completados-10'])} directoryMirrors={MUESTRA} owner="Yo" self onBack={() => {}} />);
    expect(screen.getAllByText('Lo tienes').length).toBe(1);
    expect(screen.queryByText('Conseguido')).not.toBeInTheDocument();
  });

  it('sin muestra suficiente NO se pinta la lista: una lista ordenada por una cifra que no existe no está ordenada', () => {
    render(<ProfileGlobalAchievements mirror={espejo(['completados-10'])} directoryMirrors={[espejo(['completados-10'])]} owner="Fulano" self={false} onBack={() => {}} />);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText(/Todavía no hay gente suficiente/)).toBeInTheDocument();
  });

  it('no pinta barras de progreso: aquí no se mide un camino, se mide una pertenencia', () => {
    render(<ProfileGlobalAchievements mirror="" directoryMirrors={MUESTRA} owner="Fulano" self={false} onBack={() => {}} />);
    expect(document.querySelectorAll('.ach-row-bar')).toHaveLength(0);
  });

  it('el oculto que no se tiene sigue tapado también aquí', () => {
    render(<ProfileGlobalAchievements mirror="" directoryMirrors={MUESTRA} owner="Fulano" self={false} onBack={() => {}} />);
    expect(screen.queryByText('Speedrun')).not.toBeInTheDocument();
    expect(screen.getAllByText('Logro oculto').length).toBeGreaterThan(0);
  });
});

describe('logros globales — el relleno y el progreso parcial', () => {
  const MUESTRA = [
    ...Array.from({ length: 20 }, () => espejo(['completados-10'])),
    ...Array.from({ length: 5 }, () => espejo(['resenas-5'])),
  ];

  it('el fondo de cada fila se llena con su porcentaje', () => {
    // La lista está ordenada por esa cifra, así que el relleno convierte el orden en algo que se ve sin leer.
    render(<ProfileGlobalAchievements mirror="" directoryMirrors={MUESTRA} owner="Fulano" self={false} onBack={() => {}} />);
    const fila = screen.getByText('Créditos finales I').closest('li') as HTMLElement;
    expect(fila.style.getPropertyValue('--fill')).toBe('80%');
  });

  it('en TU perfil enseña el progreso de lo que aún no tienes, como Steam', () => {
    const estados = new Map([
      ['resenas-5', { id: 'resenas-5', level: 0, value: 4, next: 5, unlockedAt: 0 }],
    ]);
    render(
      <ProfileGlobalAchievements
        mirror=""
        directoryMirrors={MUESTRA}
        owner="Yo"
        self
        ownStates={estados}
        onBack={() => {}}
      />,
    );
    // Lo que llevas, lo que hace falta y qué parte es eso, como en Steam.
    expect(screen.getByText('4 de 5 · 80 %')).toBeInTheDocument();
  });

  it('de una AMISTAD no se enseña progreso: el espejo solo lleva lo conseguido', () => {
    // Y no es una limitación técnica que haya que sortear: por dónde va otra persona no es asunto de nadie.
    render(<ProfileGlobalAchievements mirror="" directoryMirrors={MUESTRA} owner="Fulano" self={false} onBack={() => {}} />);
    expect(document.querySelectorAll('.ach-row-bar')).toHaveLength(0);
  });
});

describe('la baldosa que lleva al listado', () => {
  it('va al final de la tira, con el tamaño de una medalla', async () => {
    const verTodos = vi.fn();
    render(<AchievementStrip items={[{ id: 'completados-10', level: 1, date: '' }]} onSeeAll={verTodos} />);

    const baldosa = screen.getByRole('button', { name: 'Ver todos los logros' });
    // El mismo lado que la medalla de su tamaño: es una casilla más de la fila, no un enlace aparte.
    expect(baldosa.style.getPropertyValue('--sz')).toBe('48px');
    await userEvent.click(baldosa);
    expect(verTodos).toHaveBeenCalledTimes(1);
  });

  it('cuenta lo que no cabe, y esa cuenta ES el acceso al listado', async () => {
    // Antes el «+3» era un texto suelto sin destino: si hay medallas que no se ven, lo lógico es que la cosa que
    // las cuenta sea la que lleva a verlas.
    const verTodos = vi.fn();
    const items = ['completados-10', 'plataformas-3', 'generos-5', 'horas-10', 'resenas-5']
      .map((id) => ({ id, level: 1, date: '' }));
    render(<AchievementStrip items={items} limit={2} onSeeAll={verTodos} />);

    const baldosa = screen.getByRole('button', { name: 'Ver todos los logros' });
    expect(baldosa).toHaveTextContent('+3');
    await userEvent.click(baldosa);
    expect(verTodos).toHaveBeenCalledTimes(1);
  });

  it('sin `onSeeAll` no aparece: la tira sigue pudiendo ser solo lectura', () => {
    render(<AchievementStrip items={[{ id: 'completados-10', level: 1, date: '' }]} />);
    expect(screen.queryByRole('button', { name: 'Ver todos los logros' })).not.toBeInTheDocument();
  });
});

describe('la cifra en la vista global', () => {
  const MUESTRA = [
    ...Array.from({ length: 20 }, () => espejo(['completados-10'])),
    ...Array.from({ length: 5 }, () => espejo(['resenas-5'])),
  ];

  it('sale también ahí, calculada sobre lo que tiene ese perfil', () => {
    render(<ProfileGlobalAchievements mirror={espejo(['completados-10', 'resenas-5'])} directoryMirrors={MUESTRA} owner="Fulano" self={false} onBack={() => {}} />);
    expect(screen.getByText('2/251')).toBeInTheDocument();
    expect(screen.getByText('1% del catálogo actual')).toBeInTheDocument();
  });

  it('en tu perfil se calcula con tus estados, no con el espejo', () => {
    // El espejo va un paso por detrás del evaluador: si mandara él, tu propia cifra saldría vieja.
    const estados = new Map([
      ['completados-10', { id: 'completados-10', level: 1, value: 60, next: null, unlockedAt: 0 }],
      ['resenas-5', { id: 'resenas-5', level: 0, value: 4, next: 5, unlockedAt: 0 }],
    ]);
    render(<ProfileGlobalAchievements mirror="" directoryMirrors={MUESTRA} owner="Yo" self ownStates={estados} onBack={() => {}} />);
    expect(screen.getByText('1/251')).toBeInTheDocument();
  });
});

describe('/logros — un solo listado, conseguidos primero', () => {
  const lista = [
    {
      def: ACHIEVEMENTS_BY_ID.get('completados-25')!,
      state: { id: 'completados-25', level: 1, value: 60, next: null, unlockedAt: Date.parse('2026-03-12T10:00:00Z') },
    },
    {
      def: ACHIEVEMENTS_BY_ID.get('paciencia-1')!,
      state: { id: 'paciencia-1', level: 0, value: 0, next: 1, unlockedAt: 0 },
    },
  ];

  it('no agrupa por categorías', () => {
    // Las categorías partían el listado en cinco tramos y dentro de cada uno volvía a empezar el orden: para
    // saber qué llevas había que recorrer la pantalla entera.
    render(<AchievementsScreen items={lista} summary={summarize([])} rarity={null} />);
    for (const rotulo of ['Lo que ya haces', 'Tus fichas', 'Con los demás', 'Año a año']) {
      expect(screen.queryByText(rotulo)).not.toBeInTheDocument();
    }
  });

  it('lo conseguido va antes que lo que falta', () => {
    const byId = new Map([
      ['completados-10', { id: 'completados-10', level: 0, value: 3, next: 10, unlockedAt: 0 }],
      ['resenas-5', { id: 'resenas-5', level: 1, value: 30, next: null, unlockedAt: Date.parse('2026-05-01') }],
      ['horas-10', { id: 'horas-10', level: 1, value: 20, next: null, unlockedAt: Date.parse('2026-08-01') }],
    ]);
    const items = listForScreen(byId);
    const conseguidos = items.filter((entry) => entry.state.level >= 1).map((entry) => entry.def.id);
    const pendientes = items.filter((entry) => entry.state.level < 1).map((entry) => entry.def.id);

    // Los dos conseguidos abren la lista, y entre ellos manda la fecha: lo último, primero.
    expect(items.slice(0, 2).map((entry) => entry.def.id)).toEqual(['horas-10', 'resenas-5']);
    expect(conseguidos).toHaveLength(2);
    // Y `completados-10`, sin conseguir, cae en la segunda mitad.
    expect(pendientes).toContain('completados-10');
  });

  it('entre lo que falta, lo que está más cerca va arriba', () => {
    // Es la información útil de esa mitad: qué estás a punto de sacar.
    const byId = new Map([
      ['completados-10', { id: 'completados-10', level: 0, value: 9, next: 10, unlockedAt: 0 }],
      ['resenas-5', { id: 'resenas-5', level: 0, value: 0, next: 5, unlockedAt: 0 }],
    ]);
    const items = listForScreen(byId).filter((entry) => ['completados-10', 'resenas-5'].includes(entry.def.id));
    expect(items[0].def.id).toBe('completados-10');
  });

  it('un logro sin conseguir enseña su dibujo y qué escalón es', () => {
    // El dibujo es lo ÚNICO que dice de qué va algo que aún no tienes, y el numeral dice por dónde va la
    // escalera. Antes el numeral salía del NIVEL, así que un bloqueado no tenía ninguno; ahora sale del escalón,
    // que es un dato del catálogo y no del progreso.
    render(<AchievementsScreen items={lista} summary={summarize([])} rarity={null} />);
    const fila = screen.getByText('Ya iba siendo hora I').closest('li') as HTMLElement;
    const medalla = within(fila).getByRole('img');
    expect(medalla.className).toContain('is-locked');
    expect(medalla.querySelector('.ach-art')).not.toBeNull();
    expect(medalla.querySelector('.ach-num')?.textContent).toBe('I');
  });
});
