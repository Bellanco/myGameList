/**
 * QUÉ JUEGOS TIENEN YA SU CARÁTULA RESUELTA EN ESTE NAVEGADOR, y con qué plataformas se pidió cada uno.
 *
 * Es la lista que el recorrido de fondo (`useCoverBackfill`) va apuntando para no repetir la biblioteca en cada
 * visita. Vive AQUÍ, y no dentro de ese hook, porque tiene un segundo lector que no tiene nada que ver con el
 * recorrido: el listado, cuando pinta la biblioteca de OTRA persona.
 *
 * POR QUÉ ESE SEGUNDO LECTOR IMPORTA. La carátula se pide por `/cover?n=<título>&p=<plataformas>`, así que la
 * URL —y con ella las dos cachés del navegador y la clave del servidor— depende también de las plataformas. El
 * mismo juego en dos estanterías distintas es la misma imagen pero con URL distinta:
 *
 *   · tu «Hollow Knight» en Steam      → `/cover?n=Hollow+Knight&p=Steam`
 *   · el suyo en Nintendo Switch       → `/cover?n=Hollow+Knight&p=Nintendo+Switch`
 *
 * La segunda se descarga entera otra vez, ocupa su propio sitio en la caché del service worker y, si las
 * plataformas normalizan distinto (PC contra Switch), abre ADEMÁS un emparejamiento nuevo en el servidor: otra
 * consulta a IGDB y otra escritura de KV por un juego que ya estaba resuelto.
 *
 * Con este índice, una lista ajena pide la carátula con las plataformas que YA funcionaron, así que la URL es la
 * que el navegador tiene guardada y no sale ni una petición a la red.
 *
 * EL COMPROMISO, dicho claro: dos juegos distintos que se llamen igual comparten carátula. Es el mismo homónimo
 * que el emparejador desempata por plataforma en el servidor (el «Hook» de Mega Drive y el de móvil), y aquí se
 * resuelve al revés a propósito: entre pagar un catálogo entero por cada perfil que se visita y que un homónimo
 * raro salga con la portada del otro, se elige lo segundo.
 */

import { gameTitleKey } from './gameTitleKey';
import { topesLevantados } from './coverLimits';
import { MINIMO_TRAS_EDICION, olvidarQueNoTiene, tocaReintentar } from './coverMemory';
import { coverUrl } from './coverUrl';

/**
 * La `v2` de la clave es un CAMBIO DE FORMATO. Antes se guardaba la URL entera de cada juego
 * (`/cover?n=Hollow+Knight&p=Steam`) dentro de un JSON, o sea el prefijo, el escapado y las comillas repetidos
 * tres mil veces: ~180 kB que se vuelven a serializar cada pocos juegos, en el hilo principal y mientras el
 * listado se está pintando. Ahora se guarda lo único que distingue a un juego de otro y una entrada por línea,
 * que es un tercio del tamaño. Lo de la clave vieja no se tira: se convierte al leerla (ver `leerHechos`), para
 * que nadie tenga que volver a recorrer su biblioteca por un cambio de formato.
 */
const HECHOS_KEY = 'mis-listas-covers-done-v2';
const HECHOS_KEY_V1 = 'mis-listas-covers-done';
/** Tope de la lista de hechos: por encima de esto se olvida la más antigua (una biblioteca así no existe). */
const MAX_HECHOS = 3000;

/**
 * Separador entre las partes de una clave: un carácter de control, que no aparece ni en el título de un
 * juego ni en el nombre de una plataforma. Así no hay dos juegos distintos que puedan escribir la misma.
 */
const SEP = '';

/**
 * Lo que identifica a un juego para este recorrido: su nombre, sus plataformas y si se pidió en modo ampliado
 * —lo mismo que distingue una URL de otra, pero sin el envoltorio que no aporta nada aquí—.
 */
export function claveDeJuego(nombre: string, plataformas: readonly string[], ampliado: boolean): string {
  return `${nombre}${SEP}${plataformas.join(',')}${ampliado ? `${SEP}x` : ''}`;
}

/** La misma clave, a partir de una URL de `/cover`: es como se traduce lo apuntado con el formato anterior. */
function claveDesdeUrl(url: string): string | null {
  const consulta = url.split('?')[1];
  if (!consulta) return null;
  const parametros = new URLSearchParams(consulta);
  const nombre = parametros.get('n');
  if (!nombre) return null;
  return claveDeJuego(nombre, parametros.get('p')?.split(',').filter(Boolean) ?? [], parametros.get('x') === '1');
}

export function leerHechos(): Set<string> {
  try {
    const crudo = localStorage.getItem(HECHOS_KEY);
    if (crudo !== null) return new Set(crudo.split('\n').filter(Boolean));

    // Sin lista nueva: se traduce la vieja, si la hay. Recorrer trescientos juegos otra vez son cinco minutos
    // de peticiones en segundo plano que no hacen falta solo porque haya cambiado cómo se apuntan.
    const antigua = localStorage.getItem(HECHOS_KEY_V1);
    if (!antigua) return new Set();
    const urls = JSON.parse(antigua) as unknown;
    if (!Array.isArray(urls)) return new Set();
    return new Set(
      urls
        .filter((x): x is string => typeof x === 'string')
        .map(claveDesdeUrl)
        .filter((clave): clave is string => clave !== null),
    );
  } catch {
    return new Set(); // sin memoria de lo hecho se repite el trabajo, que es molesto pero no rompe nada
  }
}

export function guardarHechos(hechos: Set<string>): void {
  try {
    // Al rango más alto no se le recorta la lista mientras haya sitio de sobra (ver `coverLimits`).
    const lista = topesLevantados() ? [...hechos] : [...hechos].slice(-MAX_HECHOS);
    localStorage.setItem(HECHOS_KEY, lista.join('\n'));
    // La lista del formato anterior ya está traducida y guardada: quedarse con las dos sería ocupar el doble
    // para decir lo mismo.
    localStorage.removeItem(HECHOS_KEY_V1);
  } catch {
    // Almacenamiento lleno o bloqueado: se sigue sin memoria, no se interrumpe el llenado.
  }
  indice = null; // lo apuntado ha cambiado: el índice se vuelve a derivar cuando alguien lo pida
}

/**
 * Índice título → plataformas con las que ese título ya se pidió. Se deriva de la lista de hechos y se guarda en
 * memoria: la lista llega a tres mil entradas y recorrerla por cada caja del mosaico sería rehacer el mismo
 * trabajo decenas de veces por fotograma.
 *
 * `null` = todavía no se ha construido. Se construye la primera vez que alguien pregunta —una lista ajena, en la
 * práctica—, así que quien nunca abre el hub social no lo paga nunca.
 */
let indice: Map<string, PortadaPedida> | null = null;

/** Cómo se pidió un título que ya se resolvió aquí: el nombre TAL CUAL se escribió y sus plataformas. */
export interface PortadaPedida {
  nombre: string;
  plataformas: string[];
}

function construirIndice(): Map<string, PortadaPedida> {
  const mapa = new Map<string, PortadaPedida>();
  for (const apunte of leerHechos()) {
    const [nombre, plataformas, ampliado] = apunte.split(SEP);
    // El modo ampliado vive en otro espacio de claves y da PEORES emparejamientos: no sirve de alias para nadie.
    if (ampliado || !nombre) continue;
    const clave = gameTitleKey(nombre);
    // Se queda la PRIMERA combinación vista de cada título. Cuál gana da igual mientras sea estable: lo que
    // importa es que todas las listas pidan la misma URL, no cuál de ellas.
    if (clave && !mapa.has(clave)) {
      mapa.set(clave, { nombre, plataformas: plataformas ? plataformas.split(',').filter(Boolean) : [] });
    }
  }
  return mapa;
}

/**
 * Las plataformas con las que este título ya se pidió en este navegador, o `null` si no consta.
 *
 * Quien la use compone la URL con ellas en vez de con las del juego que tiene delante, y así reaprovecha la
 * carátula que ya está descargada en vez de abrir una segunda por el mismo juego.
 */
export function plataformasYaPedidas(nombre: string): string[] | null {
  return portadaYaPedida(nombre)?.plataformas ?? null;
}

/** Lo mismo, con el nombre con el que se pidió: es el que, junto a esas plataformas, da la URL ya resuelta. */
export function portadaYaPedida(nombre: string): PortadaPedida | null {
  const clave = gameTitleKey(nombre || '');
  if (!clave) return null;
  indice ??= construirIndice();
  return indice.get(clave) ?? null;
}

/** Cómo pedir la carátula de un juego: con qué nombre, con qué plataformas y si con la marca de «solo caché». */
export interface PeticionDeCaratula {
  nombre: string;
  plataformas: readonly string[];
  soloCache: boolean;
}

/**
 * LA CARÁTULA DE UN JUEGO AJENO, pedida con lo que ya funcionó aquí. Si la lista quiere reaprovechar lo ya
 * descargado (`preferirConocidas`) y de ese título consta una petición anterior, se repite AQUELLA —su nombre y
 * sus plataformas—, que es la URL que el navegador tiene guardada.
 *
 * Y entonces se pide sin `c=1` aunque la lista lo pida: esa URL la resolvió el recorrido de tu propia biblioteca,
 * así que el servidor la tiene y no hay nada que gastar. Salvo en modo ampliado, que vive en otro espacio de
 * claves y del que este índice no dice nada.
 *
 * EL NOMBRE TAMBIÉN SE CAMBIA, no solo las plataformas, y es lo que hace segura la regla anterior. El índice
 * agrupa con `gameTitleKey`, que borra el apóstrofe y quita el «The» inicial; la clave del servidor sale de
 * `normalizarTitulo` (`functions/_lib/igdbCover.ts`), que hace otras cosas. Con el nombre ajeno, «Marvel's X»
 * contra tu «Marvels X» era una clave que el servidor no tenía, y sin la marca se resolvía: consulta a IGDB y
 * escritura de KV por mirar una lista ajena, que es justo lo que `c=1` existe para impedir.
 */
export function peticionDeCaratula(
  nombre: string,
  plataformas: readonly string[],
  ampliado: boolean,
  { preferirConocidas, soloCache }: { preferirConocidas: boolean; soloCache: boolean },
): PeticionDeCaratula {
  const conocida = preferirConocidas ? portadaYaPedida(nombre) : null;
  if (!conocida) return { nombre, plataformas, soloCache };
  return { nombre: conocida.nombre, plataformas: conocida.plataformas, soloCache: soloCache && ampliado };
}

/** Solo para las pruebas: olvida el índice derivado para que el siguiente acceso relea el almacenamiento. */
export function reiniciarIndiceDeCaratulas(): void {
  indice = null;
}

/**
 * VOLVER A BUSCARLE LA CARÁTULA A UN JUEGO, porque quien lo está editando se ha fijado en que le falta.
 *
 * Guardar la ficha de un juego sin portada es la forma natural de decir «mira otra vez»: se está mirando ESE
 * juego, y muchas veces lo que se acaba de corregir es justo lo que fallaba (el título, la plataforma). Esto
 * adelanta esa revisión sin esperar a los noventa días del plazo general.
 *
 * NO LO HACE SIEMPRE, y ahí está la gracia: solo si el «no» tiene ya un día. Sin ese mínimo, cada guardado sería
 * una petición y ordenar la biblioteca una tarde se convertiría en una ráfaga. Y solo si consta un «no»: a un
 * juego que ya tiene carátula, editarlo no le cuesta nada.
 *
 * Borra las DOS memorias —la del «no tiene» y la de lo ya recorrido— porque hacen falta las dos: sin la primera
 * el listado no vuelve a pedir la imagen, y sin la segunda el recorrido de fondo no vuelve a preguntar por ella,
 * que es el único que aprende de la respuesta. Y lo hace en los dos modos, normal y ampliado, porque cada uno
 * tiene su propio espacio de claves y quien edita no tiene por qué saber en cuál está mirando.
 */
export function reabrirLaPregunta(nombre: string, plataformas: readonly string[]): boolean {
  if (!nombre) return false;
  let reabierto = false;
  for (const ampliado of [false, true]) {
    const url = coverUrl(nombre, plataformas, ampliado);
    if (!tocaReintentar(url, MINIMO_TRAS_EDICION)) continue;
    olvidarQueNoTiene(url);
    reabierto = true;
  }
  if (!reabierto) return false;

  const hechos = leerHechos();
  let cambiado = false;
  for (const ampliado of [false, true]) {
    if (hechos.delete(claveDeJuego(nombre, plataformas, ampliado))) cambiado = true;
  }
  if (cambiado) guardarHechos(hechos);
  return true;
}
