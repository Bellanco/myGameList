import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { getCategoryTitle, getOptionId, tField } from '../../../core/premios/localize';
import { findInLibrary, type LibraryMatch } from '../../../core/premios/library';
import { getGridColumns } from '../../../core/premios/gridDensity';
import { PREMIOS_ROUTES, votePath } from '../../../viewmodel/premios/premiosRoutes';
import type { PremiosCategory, PremiosOption } from '../../../model/types/premios';
import type { PremiosVotes } from '../../../viewmodel/premios/usePremiosVoting';
import { NomineeCard } from './NomineeCard';

const L = PREMIOS_UI.votar;

export interface PremiosVoteScreenProps {
  categories: PremiosCategory[];
  /** Paso pedido en la dirección, 1..n. */
  paso: number;
  votes: PremiosVotes;
  libraryIndex: Map<string, LibraryMatch>;
  /** Formatea una nota 0–100 según la escala elegida por quien mira. */
  formatGrade: (grade: number | null) => string;
  onChoose: (categoryId: string, option: PremiosOption) => void;
}

/**
 * Una categoría por pantalla.
 *
 * EL PASO VIENE DE LA DIRECCIÓN, no del estado: avanzar es navegar. Eso es lo que hace que el botón «atrás» del
 * navegador funcione sin que nadie lo programe, que se pueda enlazar una categoría y que recargar no devuelva al
 * principio.
 *
 * Un paso fuera de rango se trata sin drama: por encima del total se va a la revisión —es lo que quiere quien
 * escribe un número grande— y por debajo, a la primera.
 */
export function PremiosVoteScreen({
  categories,
  paso,
  votes,
  libraryIndex,
  formatGrade,
  onChoose,
}: PremiosVoteScreenProps) {
  const navigate = useNavigate();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState(0);

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
    });
  }, [ancho, nominados.length]);

  if (!category) return null;

  const elegido = votes[category.id];
  const esUltima = indice === total - 1;

  return (
    <section className="premios-vote" aria-label={L.sectionAria}>
      <header className="premios-vote__head">
        <p className="premios-vote__step">{L.categoryOf(indice + 1, total)}</p>
        <h2 className="premios-vote__title">{getCategoryTitle(category)}</h2>
        <p className="premios-vote__hint">{elegido ? `${L.chosen}: ${elegido.name}` : L.chooseOne}</p>
      </header>

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
          const match = findInLibrary(libraryIndex, option.name);
          return (
            <NomineeCard
              key={option.id}
              option={option}
              selected={elegido?.id === option.id}
              match={match}
              gradeLabel={match ? formatGrade(match.grade) : ''}
              onChoose={(chosen) => {
                onChoose(category.id, chosen);
                // Elegir avanza. Es el gesto que la gente espera, y el botón «Siguiente» sigue ahí para quien
                // prefiera mirar antes de pasar.
                navigate(esUltima ? PREMIOS_ROUTES.review : votePath(indice + 2));
              }}
            />
          );
        })}
      </div>

      <nav className="premios-vote__nav" aria-label={L.sectionAria}>
        <button
          type="button"
          className="btn"
          disabled={indice === 0}
          onClick={() => navigate(votePath(indice))}
        >
          {L.previous}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate(esUltima ? PREMIOS_ROUTES.review : votePath(indice + 2))}
        >
          {esUltima ? L.review : elegido ? L.next : L.skip}
        </button>
      </nav>
    </section>
  );
}
