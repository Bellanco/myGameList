import type { Page } from '@playwright/test';

/**
 * Siembra compartida por los recorridos end-to-end.
 *
 * Vive aparte porque la usan el smoke y la auditoría de accesibilidad, y porque la clave de almacenamiento y la
 * forma del estado son un contrato con `core/constants/storageKeys` y `model/repository/localRepository`: si
 * cambian, tiene que romperse en UN sitio y no en cada fichero de pruebas por su cuenta.
 */

export const JUEGOS = [
  { id: 1, name: 'Hollow Knight', grade: 96, score: 5 },
  { id: 2, name: 'Celeste', grade: 88, score: 4 },
  { id: 3, name: 'Hades', grade: 92, score: 5 },
];

/**
 * Biblioteca AMPLIA para las pantallas que necesitan volumen: el panel de estadísticas no dibuja casi nada con
 * tres juegos —la evolución del gusto pide una ventana de varios años, la constancia varias semanas— y auditar
 * una pantalla vacía no audita nada.
 *
 * Se genera con una cuenta fija (sin azar) para que el recorrido sea reproducible.
 */
export interface JuegoAmplio {
  id: number;
  name: string;
  grade: number;
  score: number;
  genres: string[];
  years: number[];
  semanasAtras: number;
}

const GENEROS = ['Acción', 'RPG', 'Plataformas', 'Aventura', 'Estrategia en tiempo real', 'Metroidvania', 'Puzzles'];

export const JUEGOS_AMPLIOS: JuegoAmplio[] = Array.from({ length: 36 }, (_unused, index) => {
  const anio = 2019 + (index % 8);
  return {
    id: 100 + index,
    name: `Juego de prueba ${index + 1}`,
    grade: 40 + ((index * 7) % 60),
    score: 1 + (index % 5),
    genres: [GENEROS[index % GENEROS.length]],
    // Dos años en uno de cada seis: hace falta para que la rejugabilidad tenga algo que contar.
    years: index % 6 === 0 ? [anio, anio + 1] : [anio],
    // Repartidos por semanas distintas del último año, para que la constancia tenga serie que dibujar.
    semanasAtras: index % 40,
  };
});

/**
 * Biblioteca de LOGROS: sembrada para conceder los TECHOS de las escaleras nuevas, y por eso es grande.
 *
 * No vale la biblioteca amplia para esto. Con 36 juegos, «Sé lo que me gusta VII» pide 200 virtudes iguales y
 * «Libro de cosechas VII» pide quince años con quince juegos terminados en cada uno: los umbrales altos solo se
 * pueden comprobar de verdad con una biblioteca que los alcance. Se genera con una cuenta fija —sin azar— para
 * que el recorrido diga lo mismo en cada ejecución, y cada regla de abajo está puesta para un escalón concreto.
 *
 * LO QUE CONCEDE, y es lo que comprueba `achievements.test.ts`:
 *  - 15 años × 15 terminados          → «Libro de cosechas VII» (el 15×15)
 *  - un juego jugado en 10 años        → «Otra oportunidad VIII»
 *  - 15 juegos retomados 10 años después → «Cuánto tiempo sin verte VI»
 *  - 225 juegos con la misma virtud    → «Sé lo que me gusta VII»
 *  - 80 etiquetas distintas de defecto → «Diccionario de a bordo IX»
 *  - 40 rejugables con dos vueltas     → «Dicho y hecho VIII»
 *  - 75 abandonos por el mismo motivo  → «Ya sé cómo acaba esto VI»
 */
const ANIOS_LOGROS = Array.from({ length: 15 }, (_unused, index) => 2005 + index);

export const JUEGOS_LOGROS = {
  /** 225 terminados: quince años con quince juegos cada uno. El resto de reglas se cuelga de estos. */
  terminados: ANIOS_LOGROS.flatMap((anio, a) => Array.from({ length: 15 }, (_unused, n) => {
    const index = a * 15 + n;
    const years = [anio];
    // Los quince primeros vuelven diez años después: es el hueco que mide «Cuánto tiempo sin verte».
    if (index < 15) years.push(anio + 10);
    // Cuarenta con dos vueltas Y la casilla de rejugable: es lo que pide «Dicho y hecho».
    else if (index < 55) years.push(anio + 1);
    // Y uno solo se juega diez años distintos, que es el techo de «Otra oportunidad».
    if (index === 200) years.push(...Array.from({ length: 9 }, (_u, k) => anio + k + 1));
    return {
      id: 1000 + index,
      name: `Terminado ${index + 1}`,
      grade: index % 40 === 0 ? 20 : 60 + (index % 40),   // uno de cada cuarenta suspende: «Ni con un palo»
      score: 3,
      genres: ['Acción'],
      platforms: ['PC'],
      years,
      replayable: index >= 15 && index < 55,
      strengths: ['Jugabilidad'],
      // Una etiqueta propia en los ochenta primeros: el vocabulario cuenta ETIQUETAS DISTINTAS, no juegos.
      weaknesses: index < 80 ? [`Defecto ${index + 1}`] : [],
      hours: 20,
      review: 'Una reseña de prueba con unas cuantas palabras dentro.',
    };
  })),
  /** 75 abandonos por el mismo motivo: el techo de «Ya sé cómo acaba esto». */
  abandonados: Array.from({ length: 75 }, (_unused, index) => ({
    id: 5000 + index,
    name: `Abandonado ${index + 1}`,
    grade: 30,
    score: 2,
    genres: ['Acción'],
    platforms: ['PC'],
    years: [2020],
    replayable: false,
    strengths: [],
    weaknesses: [],
    reasons: ['Frustración'],
    hours: 3,
    review: 'La dejé pronto.',
  })),
};

/**
 * Biblioteca AL BORDE de un logro: nueve terminados y uno en curso, para que UN CLIC lo cruce.
 *
 * Existe para probar el AVISO DEL INSTANTE (§7.4), que es lo que no se puede comprobar con una biblioteca ya
 * hecha: el aviso solo cuenta lo que sube EN ESA escritura, así que hace falta una biblioteca que esté a un
 * juego del umbral y una transición que lo cruce. El juego va en «en curso» y no en Próximos porque desde
 * Próximos la única transición que ofrece la app es a «en curso» (ver `MOVES` en `core/constants/labels`).
 *
 * Dos variantes, que son las dos ramas del aviso:
 *  - `uno`: el juego en curso repite género, así que al completarlo sube SOLO «Créditos finales I»;
 *  - `varios`: trae dos géneros nuevos, así que la misma escritura sube «Créditos finales I» Y «Mundo abierto I»
 *    (cinco géneros distintos cerrados) — y el aviso tiene que decir «2 logros conseguidos», no uno de los dos.
 */
export function juegosAlBorde(variante: 'uno' | 'varios' | 'hito' | 'casi') {
  /* LA VARIANTE `hito` NO CRUZA NINGÚN UMBRAL: son CUATRO cerrados, así que al completar el quinto la escalera
     de «Créditos finales» pasa a 5 de 10 —la mitad exacta— sin conceder nada. Y van sin reseña y sin horas a
     propósito: con reseña, el quinto cerrado subiría «Con tus palabras I» (cinco reseñas) y con horas empataría
     el hito de «El contador de horas» (5 de 10), y un desbloqueo TAPA al hito por diseño. */
  // `hito` deja la escalera de «Créditos finales» a la mitad (5 de 10) y `casi` en su recta final (9 de 10),
  // que son los dos rótulos distintos que el aviso sabe decir.
  const cuantos = variante === 'hito' ? 4 : variante === 'casi' ? 8 : 9;
  const generos = variante === 'varios'
    ? ['Acción', 'Acción', 'Acción', 'RPG', 'RPG', 'RPG', 'Puzles', 'Puzles', 'Puzles']
    : Array.from({ length: cuantos }, () => 'Acción');
  const pelado = variante === 'hito' || variante === 'casi';
  return {
    terminados: generos.map((genero, index) => ({
      id: 200 + index,
      name: `Cerrado ${index + 1}`,
      grade: 70 + index,
      score: 4,
      genres: [genero],
      platforms: ['PC'],
      years: [2024],
      hours: pelado ? null : 12,
      review: pelado ? '' : 'Reseña de prueba.',
      strengths: ['Ritmo'],
      weaknesses: ['Duración'],
    })),
    enCurso: {
      id: 299,
      name: 'El que cruza el umbral',
      grade: 80,
      score: 4,
      genres: variante === 'varios' ? ['Estrategia', 'Cartas'] : ['Acción'],
      platforms: ['PC'],
      years: [2026],
      hours: pelado ? null : 9,
      review: pelado ? '' : 'Reseña de prueba.',
      strengths: ['Ritmo'],
      weaknesses: ['Duración'],
    },
  };
}

interface SeedOptions {
  /** Tema con el que arranca la app. Lo lee el script de arranque ANTES del primer render. */
  theme?: 'dark' | 'light';
  /** Paleta de color activa (ver `core/constants/palettes`). */
  palette?: string;
  /**
   * Siembra la biblioteca amplia en vez de las tres fichas. Para el panel de estadísticas, que con tres juegos
   * enseña estados vacíos en casi todos sus bloques.
   */
  amplia?: boolean;
  /**
   * Siembra la biblioteca de LOGROS (`JUEGOS_LOGROS`): la única que alcanza los umbrales altos del catálogo.
   * Manda sobre `amplia` si se pasan las dos.
   */
  logros?: boolean;
  /** Siembra la biblioteca AL BORDE de un logro, en su variante de uno o de varios (`juegosAlBorde`). */
  alBorde?: 'uno' | 'varios' | 'hito' | 'casi';
  /**
   * Marca de agua PREVIA, como la que dejaría una versión anterior de la app en este aparato: los `id` que ya
   * estaban reconocidos la última vez que se abrió. Es lo que distingue «primera vez aquí» de «he vuelto y hay
   * logros nuevos», y sin ella no se puede probar el aviso de estreno.
   */
  marcaPrevia?: readonly string[];
}

/** Siembra la biblioteca ANTES de que cargue la app (la clave la fija `core/constants/storageKeys`). */
export async function sembrarBiblioteca(page: Page, options: SeedOptions = {}): Promise<void> {
  await page.addInitScript(
    ({ juegos, amplios, amplia, deLogros, logros, borde, marca, theme, palette }) => {
      const now = Date.now();
      const SEMANA = 7 * 24 * 60 * 60 * 1000;
      const ajustes = () => {
        localStorage.setItem('mis-listas-analytics-consent', 'denied');
        if (theme) localStorage.setItem('mis-listas-theme', theme);
        if (palette) localStorage.setItem('mis-listas-palette', palette);
        // La marca de agua se guarda tal y como la escribe `nextPeak`: `id:1,id:1`.
        if (marca && marca.length > 0) {
          localStorage.setItem('mis-listas-achievements-peak-2', marca.map((id) => `${id}:1`).join(','));
        }
      };
      if (borde) {
        /* LOS SELLOS ESTÁN ELEGIDOS PARA QUE EL CIERRE NO CRUCE NADA DEL CALENDARIO, y esto es la mitad del
           montaje. Con los nueve cierres repartidos «hace treinta días», el mes anterior y el actual quedaban
           encadenados y completar el décimo juego subía TAMBIÉN «Sin prisa pero sin pausa I» —dos meses seguidos
           cerrando algo—: la escritura subía dos logros y la rama de uno solo no se podía probar.

           Así que la racha ya viene hecha: tres cierres en cada uno de los tres últimos meses, uno de ellos hace
           una hora. La racha de meses vale 3 ANTES de mover, el mes en curso ya tiene cierres y la semana en
           curso ya tiene actividad, así que el décimo juego no encadena ningún mes ni estrena ninguna semana. */
        const mesAtras = (n: number) => {
          const d = new Date(now);
          return new Date(d.getFullYear(), d.getMonth() - n, 15, 12, 0, 0, 0).getTime();
        };
        const sellos = [now - 3600_000, mesAtras(1), mesAtras(2)];
        const hace = (i: number) => sellos[i % 3];
        localStorage.setItem('mis-listas-v12-unified', JSON.stringify({
          c: borde.terminados.map((j, i) => ({
            ...j, _ts: hace(i), listedAt: hace(i), steamDeck: false, replayable: false, retry: false,
            reasons: [], reviewedAt: hace(i), enteredAt: { c: hace(i) },
          })),
          v: [], p: [],
          e: [{
            ...borde.enCurso, _ts: sellos[0], listedAt: sellos[0], steamDeck: false, replayable: false,
            retry: false, reasons: [], reviewedAt: sellos[0], enteredAt: { e: sellos[0] },
          }],
          deleted: [], updatedAt: now, schemaVersion: 1,
        }));
        ajustes();
        return;
      }
      // La de LOGROS manda: es la única que alcanza los umbrales altos, y mezclarla con otra falsearía las
      // cuentas que el recorrido comprueba.
      if (logros) {
        const sello = (j: { years: number[] }) => Date.UTC(Math.min(...j.years), 5, 15, 12);
        localStorage.setItem('mis-listas-v12-unified', JSON.stringify({
          c: deLogros.terminados.map((j) => ({
            ...j, _ts: sello(j), listedAt: sello(j), steamDeck: false, retry: false, reasons: [],
            reviewedAt: sello(j), enteredAt: { c: sello(j) },
          })),
          v: deLogros.abandonados.map((j) => ({
            ...j, _ts: sello(j), listedAt: sello(j), steamDeck: false, retry: false,
            reviewedAt: sello(j), enteredAt: { v: sello(j) },
          })),
          e: [], p: [], deleted: [], updatedAt: now, schemaVersion: 1,
        }));
        ajustes();
        return;
      }
      const c = amplia
        ? amplios.map((j, index) => {
            const entrada = now - j.semanasAtras * SEMANA;
            return {
              id: j.id, name: j.name, grade: j.grade, score: j.score, _ts: entrada,
              listedAt: entrada, genres: j.genres, platforms: ['PC'], steamDeck: false,
              years: j.years, strengths: ['Ritmo'], weaknesses: [], reasons: [],
              replayable: index % 3 === 0, retry: false, hours: 10 + index,
              review: 'Reseña de prueba.', reviewedAt: entrada,
              // Sellos de las tres listas: es lo que hace que la constancia y el reparto tengan serie.
              enteredAt: { p: entrada - 20 * SEMANA, e: entrada - 4 * SEMANA, c: entrada },
              gradedAt: entrada,
            };
          })
        : juegos.map((j) => ({
            ...j, _ts: now, listedAt: now, genres: ['Acción'], platforms: ['PC'], steamDeck: false,
            years: [2024], strengths: ['Ritmo'], weaknesses: [], reasons: [], replayable: true, retry: false,
            hours: 20, review: 'Reseña de prueba.',
          }));
      localStorage.setItem('mis-listas-v12-unified', JSON.stringify({
        c, v: [], e: [], p: [], deleted: [], updatedAt: now, schemaVersion: 1,
      }));
      // Decidido el consentimiento para que el banner no tape la interfaz durante el test.
      ajustes();
    },
    {
      juegos: JUEGOS, amplios: JUEGOS_AMPLIOS, deLogros: JUEGOS_LOGROS,
      amplia: Boolean(options.amplia), logros: Boolean(options.logros),
      borde: options.alBorde ? juegosAlBorde(options.alBorde) : null,
      marca: options.marcaPrevia ?? null,
      theme: options.theme, palette: options.palette,
    },
  );
}
