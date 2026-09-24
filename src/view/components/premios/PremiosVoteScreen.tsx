import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { getCategoryTitle, getOptionId, tField } from '../../../core/premios/localize';
import { getGridColumns } from '../../../core/premios/gridDensity';
import { PREMIOS_ROUTES, votePath } from '../../../viewmodel/premios/premiosRoutes';
import type { PremiosCategory, PremiosOption } from '../../../model/types/premios';
import type { PremiosVotes } from '../../../viewmodel/premios/usePremiosVoting';
import { NomineeCard } from './NomineeCard';
import { usePosicionSuperior } from './usePosicionSuperior';
import { PremiosProgress } from './PremiosProgress';

const L = PREMIOS_UI.votar;

/**
 * Pausa tras elegir, para que la marca de seleccionado llegue a verse antes de pasar a la siguiente categoría.
 * Es el ÚNICO retardo del flujo: los botones del pie navegan al instante.
 */
const FEEDBACK_MS = 140;

export interface PremiosVoteScreenProps {
  categories: PremiosCategory[];
  /** Paso pedido en la dirección, 1..n. */
  paso: number;
  votes: PremiosVotes;
  onChoose: (categoryId: string, option: PremiosOption) => void;
}

/**
 * Una categoría por pantalla, a pantalla completa.
 *
 * EL PASO VIENE DE LA DIRECCIÓN, no del estado: avanzar es navegar. Eso es lo que hace que el botón «atrás» del
 * navegador funcione sin que nadie lo programe, que se pueda enlazar una categoría y que recargar no devuelva al
 * principio.
 *
 * TRES FRANJAS FIJAS, como en la porra de origen: el progreso arriba, la rejilla en medio repartiéndose el alto
 * que sobre, y la navegación abajo —anterior, siguiente y finalizar— siempre a la vista. Que el pie no se vaya de
 * la pantalla es lo que permite salir a la revisión en cualquier momento sin recorrer las veintisiete
 * categorías.
 *
 * Un paso fuera de rango se trata sin drama: por encima del total se va a la revisión —es lo que quiere quien
 * escribe un número grande— y por debajo, a la primera.
 */
export function PremiosVoteScreen({
  categories,
  paso,
  votes,
  onChoose,
}: PremiosVoteScreenProps) {
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState(0);
  /* CARÁTULAS SIEMPRE, con el check de imágenes encendido o no. Lo que ese check protege en tus listas es que el
     servidor pregunte por TUS títulos; aquí los nominados los escribe el administrador y son los mismos para
     todos, así que se resuelven una vez por edición y no por votante. Decidido el 24-09-2026. */
  const covers = true;
  const top = usePosicionSuperior(sectionRef);

  // SE MIDE EL CONTENEDOR, NO LA VENTANA, que es como mide el resto de esta app (ver `GameTable`,
  // `BottomNavigation`). Importa más de lo que parece: el ancho útil no es el del viewport —hay márgenes, y en
  // Linux la barra de desplazamiento se come unos quince píxeles—, así que calibrar contra la ventana da
  // repartos que en la máquina de al lado no salen. El módulo de densidad recibe por tanto ANCHO REAL DISPONIBLE.
  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const medir = () => setAncho(node.getBoundingClientRect().width);
    medir();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);

  // El temporizador de la selección muere con la pantalla: si no, salir rápido dispara una navegación sobre un
  // árbol que ya no está.
  const saltoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saltoRef.current) clearTimeout(saltoRef.current); }, []);

  const total = categories.length;
  const indice = Math.min(Math.max(paso, 1), total) - 1;
  const category = categories[indice];

  const nominados = useMemo<PremiosOption[]>(
    () =>
      (category?.options || []).map((option, i) => ({
        id: getOptionId(option, category.id, i),
        name: tField(option),
      })),
    [category],
  );

  const columnas = useMemo(() => {
    if (!ancho) return 0; // primer render: aún no hay medida, así que no se decide nada
    return getGridColumns({
      width: ancho,
      optionCount: nominados.length || 1,
      // Con el ancho del CONTENEDOR, «móvil» deja de ser un tipo de aparato y pasa a ser lo que de verdad importa
      // aquí: que la columna es estrecha. Un móvil apaisado y una ventana pequeña en un monitor reparten igual.
      isMobile: ancho < 640,
      isLandscape: typeof window !== 'undefined' && window.innerWidth > window.innerHeight,
      // La caja cambia de forma con la preferencia de imágenes, y con ella el reparto: estrecha y alta con
      // portada, ancha y baja cuando solo hay un título.
      withCovers: covers,
    });
  }, [ancho, covers, nominados.length]);

  const irA = useCallback(
    (destino: string) => {
      if (saltoRef.current) clearTimeout(saltoRef.current);
      navigate(destino);
    },
    [navigate],
  );

  if (!category) return null;

  const elegido = votes[category.id];
  const esUltima = indice === total - 1;
  const siguiente = esUltima ? PREMIOS_ROUTES.review : votePath(indice + 2);

  return (
    <section
      ref={sectionRef}
      className={`premios-vote${top === null ? '' : ' is-fitted'}`}
      aria-label={L.sectionAria}
      style={top === null ? undefined : ({ '--premios-top': `${top}px` } as React.CSSProperties)}
    >
      <PremiosProgress
        title={getCategoryTitle(category)}
        subtitle={elegido ? `${L.chosen}: ${elegido.name}` : L.chooseOne}
        current={indice + 1}
        total={total}
        voted={Boolean(elegido)}
      />

      <div
        ref={gridRef}
        className="premios-vote__grid"
        role="group"
        aria-label={getCategoryTitle(category)}
        // Hasta que hay medida manda el `auto-fit` de la hoja; con ella, el reparto calculado —que es el que
        // evita la fila huérfana, ver `balanceColumns`.
        style={columnas ? ({ '--premios-cols': columnas } as React.CSSProperties) : undefined}
      >
        {nominados.map((option) => {
          return (
            <NomineeCard
              key={option.id}
              option={option}
              selected={elegido?.id === option.id}
              covers={covers}
              onChoose={(chosen) => {
                onChoose(category.id, chosen);
                // Elegir avanza, con una pausa para que dé tiempo a ver la marca. Los botones del pie siguen
                // ahí para quien prefiera mirar antes de pasar.
                if (saltoRef.current) clearTimeout(saltoRef.current);
                saltoRef.current = setTimeout(() => navigate(siguiente), FEEDBACK_MS);
              }}
            />
          );
        })}
      </div>

      <nav className="premios-vote__nav" aria-label={L.sectionAria}>
        <div className="premios-vote__steps">
          <button
            type="button"
            className="btn"
            disabled={indice === 0}
            onClick={() => irA(votePath(indice))}
          >
            {L.previous}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={esUltima}
            onClick={() => irA(votePath(indice + 2))}
          >
            {L.next}
          </button>
        </div>
        {/* FINALIZAR ESTÁ SIEMPRE, y no solo en la última: se puede enviar con categorías sin votar (lo dice la
            revisión), así que obligar a recorrerlas todas para llegar al final sería un muro inventado. */}
        <button type="button" className="btn premios-vote__finish" onClick={() => irA(PREMIOS_ROUTES.review)}>
          {L.finish}
        </button>
      </nav>
    </section>
  );
}
