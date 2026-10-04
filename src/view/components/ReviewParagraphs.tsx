import '../../styles/review-paragraphs.scss';

/**
 * Trocea el texto de una reseña en párrafos (separados por una o más líneas en blanco) y cada párrafo en sus
 * líneas (separadas por un salto simple).
 *
 * Varias líneas en blanco seguidas cuentan como UN solo párrafo: el hueco entre párrafos lo pone el CSS, no el
 * número de saltos que se tecleó.
 */
export function splitReviewParagraphs(text: string): string[][] {
  const clean = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  return clean.split(/\n(?:[ \t]*\n)+/).map((paragraph) => paragraph.split('\n'));
}

/**
 * El CONTENIDO de una reseña con dos niveles de separación: medio renglón para el salto simple y un renglón
 * entero para la línea en blanco (ver `review-paragraphs.scss`).
 *
 * POR QUÉ NO BASTA CON `white-space: pre-wrap`: así el salto simple solo baja de renglón y, con la interlínea
 * prieta de las tarjetas, no se distingue del corte natural de una línea larga: se leía como un renglón que se
 * había quedado corto. Medido en una biblioteca real (04-10-2026): de 98 reseñas, 87 separan con línea en blanco,
 * 5 solo con saltos simples (y ahí el salto es «párrafo nuevo») y 2 mezclan, y en una de esas el salto simple es
 * deliberado (una retahíla de preguntas y respuestas, línea a línea, antes de un párrafo de cierre). Convertir todo
 * salto en párrafo la desmontaba; el medio renglón distingue los dos niveles.
 *
 * Devuelve solo el contenido: el contenedor (`<p>`, el botón de la ruleta…) lo pone quien lo usa, con su clase,
 * su recorte por líneas y el filo de cada tema. Sin saltos devuelve el texto tal cual, sin envoltorios.
 */
export function ReviewParagraphs({ text }: { text: string }) {
  const paragraphs = splitReviewParagraphs(text);
  if (paragraphs.length === 1 && paragraphs[0].length === 1) return <>{paragraphs[0][0]}</>;
  return (
    <>
      {paragraphs.map((lines, p) => (
        <span className="review-par" key={p}>
          {lines.map((line, l) => (
            <span className="review-line" key={l}>{line}</span>
          ))}
        </span>
      ))}
    </>
  );
}
