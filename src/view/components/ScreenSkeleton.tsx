import { UI_MESSAGES } from '../../core/constants/labels';

/** Anchos de las líneas de cada tarjeta. Desiguales a propósito: cuatro barras idénticas se leen como una tabla
 *  vacía, y con anchos distintos se leen como párrafos que todavía no han llegado. */
const CARD_LINES = [
  ['92%', '74%', '84%'],
  ['88%', '62%', '79%'],
  ['80%', '90%', '58%'],
];

/**
 * LO QUE SE VE MIENTRAS BAJA EL CHUNK DE UNA PANTALLA.
 *
 * Casi todas las pantallas de la app llegan por `lazy()`, así que entre pulsar en la barra de abajo y el primer
 * píxel hay una descarga. El `fallback` de esas esperas era `null`: la pantalla anterior desaparecía y quedaba
 * un RECTÁNGULO EN BLANCO hasta que llegaba el chunk —entre nada y bastante, según la red—, que es la clase de
 * hueco que hace que una app parezca lenta aunque no lo sea. El hub social era el único que ya tenía esqueleto
 * (`SocialHubSkeleton`), y esto lleva esa misma decisión al resto.
 *
 * Vive FUERA de las pantallas que espera —por definición: es lo que se enseña mientras ellas no están—, así que
 * tiene que estar en el arranque. Por eso no importa nada: solo dos etiquetas, y sus estilos van en la hoja base
 * (`_motion.scss`).
 *
 * NO IMITA A NINGUNA PANTALLA EN CONCRETO. Son ocho y con formas muy distintas (la rejilla de ajustes, las
 * fichas del panel de administración, los bloques del perfil…): un esqueleto fiel a una sería engañoso en las
 * otras siete. Pinta lo que todas comparten —tarjetas en rejilla, cada una con su titular y unas líneas— para
 * que la pantalla real aterrice sobre algo con su mismo peso visual en vez de sobre el vacío.
 */
export function ScreenSkeleton() {
  return (
    <>
      {/* El hilo de progreso va aparte de las tarjetas y fijo al borde de arriba: es la parte que se ve incluso
          cuando la espera es de dos fotogramas, y no mueve nada de sitio al aparecer ni al irse. */}
      <div className="route-progress" aria-hidden="true" />
      <div className="screen-skeleton">
        {/* El esqueleto es decorativo (`aria-hidden`), así que la espera se anuncia por aquí: un lector de
            pantalla se quedaría si no sin saber que hay algo en camino. */}
        <p className="sr-only" role="status">{UI_MESSAGES.screenLoading}</p>
        {CARD_LINES.map((lines, index) => (
          <div key={index} className="screen-skeleton-card" aria-hidden="true">
            <span className="hub-skeleton screen-skeleton-title" />
            {lines.map((width) => (
              <span key={width} className="hub-skeleton hub-skeleton-line" style={{ width }} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
