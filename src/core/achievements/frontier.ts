// LA FRONTERA COMUNITARIA VISTA DESDE EL CLIENTE. Ver `visibility.ts` y docs/plan-logros.md §6.7.
//
// LA REGLA YA ESTABA ESCRITA Y APLICADA: en cuanto un usuario ve un escalón, ese escalón queda abierto para
// TODOS, y lo que distingue a dos personas es lo que llevan conseguido, no lo que ven (`openThrough`). Lo que
// faltaba era quién mantiene el mapa al día: solo lo rellenaba el panel de administración a mano, así que
// mientras nadie pulsara «publicar» cada cliente abría sus escaleras con su PROPIO progreso y el denominador
// dejaba de ser común — uno contaba sobre 249 y quien empezaba, sobre 55, con el mismo catálogo delante.
//
// AQUÍ ESTÁ LA OTRA MITAD: tu cliente publica hasta dónde has llegado TÚ, que es exactamente lo que la regla
// promete abrir para los demás. Se DERIVA, no se registra: la frontera de uno son los escalones que ya tiene
// conseguidos, los mismos que calcula el evaluador.
//
// LO QUE SALE DEL APARATO ES UN MAPA `escalera → id de escalón`, sin identidad, sin fechas y sin cifras: dice
// que ALGUIEN llegó ahí, no quién ni cuándo. Es el mismo dato que publicaba el panel midiendo el censo.
import { ACHIEVEMENTS_BY_LADDER } from './catalog';
import type { OpenFrontier } from './visibility';
import type { AchievementState } from './types';

/**
 * HASTA DÓNDE HAS LLEGADO TÚ: por cada escalera, el `id` del escalón CONSEGUIDO más alto.
 *
 * Solo lo conseguido, no lo que se te ofrece: `openThrough` ya añade el escalón siguiente al aplicar el mapa, así
 * que publicar la zanahoria la adelantaría dos veces y abriría escaleras por delante de donde ha llegado alguien.
 *
 * Una escalera sin nada conseguido no entra en el mapa: «no se sabe de nadie» y «alguien llegó al primero» no son
 * lo mismo, y meterla con un valor vacío obligaría a distinguirlo al leer.
 */
export function ownFrontier(byId: ReadonlyMap<string, AchievementState>): OpenFrontier {
  const frontier: Record<string, string> = {};
  for (const [ladder, steps] of ACHIEVEMENTS_BY_LADDER) {
    let furthest = '';
    for (const def of steps) {
      if ((byId.get(def.id)?.level ?? 0) >= 1) furthest = def.id;
    }
    if (furthest) frontier[ladder] = furthest;
  }
  return frontier;
}

/**
 * LA UNIÓN DE DOS FRONTERAS: por cada escalera gana la que llega más lejos. Nunca retrocede, que es la propiedad
 * que sostiene la promesa —un escalón abierto no se cierra— aunque dos aparatos publiquen en cualquier orden.
 *
 * Se compara por POSICIÓN en la escalera y no por umbral: en una escalera descendente «más lejos» es un número
 * más pequeño, y la posición ordena en las dos direcciones.
 *
 * Un `id` que este catálogo no conoce se ignora en vez de propagarse (puede venir de una versión posterior, y el
 * lado seguro es no abrir nada por él); si el que no se reconoce es el PUBLICADO, gana el propio, que sí se puede
 * situar. Es lo mismo que hace `openThrough` al aplicarlo: lo que no se sabe colocar, no abre.
 */
export function mergeFrontiers(published: OpenFrontier, mine: OpenFrontier): OpenFrontier {
  const merged: Record<string, string> = { ...published };

  for (const [ladder, step] of Object.entries(mine)) {
    const steps = ACHIEVEMENTS_BY_LADDER.get(ladder);
    if (!steps) continue;
    const index = steps.findIndex((def) => def.id === step);
    if (index < 0) continue;
    const current = merged[ladder];
    const currentIndex = current ? steps.findIndex((def) => def.id === current) : -1;
    if (index > currentIndex) merged[ladder] = step;
  }

  return merged;
}

/**
 * Huella canónica de una frontera, para decidir si hay algo nuevo que publicar sin comparar mapas a mano.
 *
 * Ordenada por clave: dos mapas con las mismas entradas en otro orden de inserción tienen que dar la misma
 * cadena, o cada apertura de la pantalla creería que hay un avance y escribiría lo mismo otra vez.
 */
export function frontierKey(open: OpenFrontier): string {
  return Object.keys(open)
    .sort()
    .map((ladder) => `${ladder}:${open[ladder]}`)
    .join('|');
}
