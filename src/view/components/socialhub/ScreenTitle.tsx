/** Tres tintas que se alternan: negro, blanco y el rojo del tema (`.rc-n`, `.rc-b`, `.rc-r` en el skin). */
const TINTAS = ['n', 'b', 'r', 'n', 'b'] as const;
/** Tamaños relativos que se repiten, para que ninguna letra recortada mida igual que su vecina. */
const TAMANOS = [1, 1.12, .92, 1.05] as const;

/**
 * El texto del título de una pantalla del hub (el `<h2>` de su cabecera).
 *
 * CON PERSONA, CADA LETRA RECORTADA DE UNA REVISTA (09-10-2026), como las tarjetas de aviso de los Ladrones
 * Fantasma: cada letra en su recuadro —negro, blanco o rojo— con su tamaño y un pelo girada. Elegido con
 * `docs/maquetas/persona-letras.html`. Solo en el TÍTULO de pantalla: en cualquier otra pieza sería ilegible.
 *
 * El reparto de tinta, tamaño y giro sale de la POSICIÓN de la letra, no del azar: el mismo título se ve igual cada
 * vez, y no salta al volver a pintar. Las letras van agrupadas por palabra, así que si el título no cabe parte entre
 * palabras y no a media palabra.
 *
 * SE PINTAN LAS DOS FORMAS Y EL TEMA ELIGE (CSS, `persona.scss`): el texto tal cual (`.rc-plain`) y las letras
 * (`.rc-letters`, que la base esconde). Así no depende de cómo se fije la paleta —también en la maqueta, que la
 * pone en el `<html>` sin pasar por las preferencias— ni cambia nada en los demás temas, que solo ven el texto.
 * Accesible: las letras son `aria-hidden`; con Persona el texto se queda solo para lectores de pantalla, que lo
 * leen de corrido y no letra a letra.
 */
export function ScreenTitle({ text }: { text: string }) {
  let index = 0;
  const palabras = text.split(' ').filter(Boolean);
  return (
    <>
      <span className="rc-plain">{text}</span>
      <span className="rc-letters" aria-hidden="true">
        {palabras.map((palabra, p) => (
          <span key={p} className="rc-word">
            {[...palabra].map((letra) => {
              const i = index++;
              return (
                <span
                  key={i}
                  className={`rc rc-${TINTAS[(i * 7) % TINTAS.length]}`}
                  style={{ transform: `rotate(${((i * 37) % 9) - 4}deg)`, fontSize: `${TAMANOS[i % TAMANOS.length]}em` }}
                >
                  {letra}
                </span>
              );
            })}
          </span>
        ))}
      </span>
    </>
  );
}
