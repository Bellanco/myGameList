/**
 * PEDIR QUE LO GUARDADO NO SE DESALOJE — y hacerlo sin que nadie se entere.
 *
 * Por largos que sean los plazos de caché, todos cuelgan de un supuesto que por defecto NO se cumple: que lo
 * guardado siga ahí. El almacenamiento de un origen es desechable mientras nadie diga lo contrario, así que el
 * navegador puede tirarlo ENTERO —no solo las carátulas: el shell, los chunks y la biblioteca guardada para
 * verla sin red— cuando le aprieta el disco. Y en Safari es peor que una posibilidad: los datos de un sitio que
 * no se visita en siete días se borran por política.
 *
 * ESTO NO VIVE YA CON LAS CARÁTULAS, y el sitio importa: lo que está en juego es el origen entero, no el cubo de
 * imágenes, así que se pide en el arranque de la aplicación y no dentro del recorrido de las portadas —donde
 * solo protegía a quien las tuviera encendidas—.
 *
 * A FIREFOX NO SE LE PIDE, y es la única regla de este módulo. `persist()` no enseña nada en Chromium ni en
 * WebKit: se concede o se deniega en silencio (medido en los tres motores, ver
 * `docs/plan-persistencia-caratulas.md`). Firefox es el único que abre un diálogo, y un permiso que aparece solo,
 * sin que nadie lo haya pedido, se rechaza por reflejo. Preguntarle es la única forma que tendría esta aplicación
 * de interrumpir a alguien por algo que no cambia nada de lo que ve, así que no se le pregunta.
 *
 * Y no se pierde gran cosa: Firefox no purga por inactividad, de modo que su único riesgo es la presión de disco
 * —unos 20 MB de carátulas frente a cuotas de decenas de gigas—. El navegador que exigía el aviso es el que menos
 * lo necesita. Si su dueño la concede a mano desde el candado, `persisted()` lo dirá igual: consultar no abre
 * ningún diálogo, solo pedir.
 */

/** Ya se ha hecho el intento de esta carga. No impide el reintento al instalar, que es otro momento y otra respuesta. */
let vigilado = false;
/** El oyente del `appinstalled` en curso, para poder retirarlo al reiniciar (ver el final del módulo). */
let alInstalar: (() => void) | null = null;

/** El único navegador que abre un diálogo al pedir la persistencia. `fxios` es Firefox en iOS. */
function esFirefox(): boolean {
  return typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);
}

/**
 * Pide la persistencia y devuelve si la hay. Nunca lanza: sin API, con la API a medias o en un contexto sin
 * permiso, se responde que no y la aplicación sigue igual que siempre.
 */
export async function pedirAlmacenamientoDuradero(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    // Primero preguntar: si ya está concedida no hay nada que pedir, y esta lectura es la que permite que
    // Firefox conteste la verdad sin que se le llegue a abrir el diálogo.
    if (await navigator.storage.persisted?.()) return true;
    if (esFirefox()) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * El enganche del arranque: pide una vez por carga y vuelve a pedirlo si la aplicación se instala.
 *
 * El reintento al instalar no es por insistir: instalar es JUSTO la señal que hace que Chromium conceda —y en
 * WebKit, lo que saca a los datos de la purga de los siete días—, así que quien lo haga por su cuenta obtiene la
 * persistencia en el acto y sin que nadie se lo haya ofrecido. La aplicación no propone instalar en ningún sitio;
 * solo aprovecha el momento si ocurre.
 */
export function vigilarAlmacenamientoDuradero(): void {
  if (vigilado || typeof window === 'undefined') return;
  vigilado = true;
  void pedirAlmacenamientoDuradero();
  alInstalar = () => { void pedirAlmacenamientoDuradero(); };
  window.addEventListener('appinstalled', alInstalar, { once: true });
}

/**
 * Solo para las pruebas: vuelve al estado de partida.
 *
 * Retira también el oyente, y no es una formalidad: en una pestaña de verdad cada carga trae su `window` nuevo,
 * pero en las pruebas se comparte, y sin esto los oyentes de un caso anterior seguirían vivos y contestando al
 * `appinstalled` del siguiente.
 */
export function reiniciarAlmacenamientoDuradero(): void {
  vigilado = false;
  if (alInstalar && typeof window !== 'undefined') {
    window.removeEventListener('appinstalled', alInstalar);
  }
  alInstalar = null;
}
