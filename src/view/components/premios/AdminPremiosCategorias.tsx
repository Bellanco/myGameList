import { useCallback, useMemo, useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { Icon } from '../Icon';
import { getCategoryTitle, tField } from '../../../core/premios/localize';
import type { PremiosOptionForm } from '../../../core/premios/options';
import {
  deleteCategory,
  reorderCategories,
  saveCategory,
} from '../../../model/repository/premios/premiosCategoriesRepository';
import { resolverCaratulasDeNominados } from '../../../model/repository/premios/premiosCoversRepository';
import type { PremiosCategory } from '../../../model/types/premios';

const L = PREMIOS_UI.admin.categories;

/** Pesos que se ofrecen. Son los cuatro que se usan de verdad; un campo libre solo invita a poner 7. */
const PESOS = [0.5, 1, 2, 3] as const;

/** Cuántos campos de nominado se enseñan como mínimo: una categoría con un solo nominado no es una votación. */
const MIN_NOMINEE_FIELDS = 2;

interface Borrador {
  id: string;
  titleEs: string;
  titleEn: string;
  weight: number;
  /** Cada campo conserva el id del nominado que ya existía: es lo que evita invalidar votos al reordenar. */
  options: PremiosOptionForm[];
}

function borradorDe(category: PremiosCategory | null): Borrador {
  if (!category) {
    return {
      id: '',
      titleEs: '',
      titleEn: '',
      weight: 1,
      options: Array.from({ length: MIN_NOMINEE_FIELDS }, () => ({ id: null, value: '' })),
    };
  }

  const options: PremiosOptionForm[] = (category.options || []).map((option) => ({
    id: typeof option === 'object' && option.id ? option.id : null,
    value: tField(option),
  }));
  while (options.length < MIN_NOMINEE_FIELDS) options.push({ id: null, value: '' });

  return {
    id: category.id,
    titleEs: typeof category.title === 'string' ? category.title : category.title?.es || '',
    titleEn: typeof category.title === 'string' ? '' : category.title?.en || '',
    weight: category.weight || 1,
    options,
  };
}

export interface AdminPremiosCategoriasProps {
  categories: PremiosCategory[];
  busy: boolean;
  /** Ejecuta la acción, enseña su aviso y recarga. Lo pone el panel para no repetirlo en cada botón. */
  ejecutar: (accion: () => Promise<string>) => Promise<void>;
}

/**
 * El editor de categorías: crear, editar, ordenar y eliminar.
 *
 * LOS NOMINADOS SON UN CAMPO CADA UNO, y no un área de texto con un nombre por línea. Con el área parecía que
 * bastaba pulsar Intro, pero un título con un salto de línea de más se partía en dos nominados y uno vacío, y
 * sobre todo **se perdían los identificadores**: al reescribir la lista entera, un voto ya emitido podía acabar
 * apuntando a otro juego. Con un campo por nominado, cada uno viaja con su id (ver `buildStableOptions`).
 *
 * Aparte del panel principal porque esto solo, con sus cuatro acciones y su formulario, ya es tanto como el resto
 * de la pantalla junto.
 */
export function AdminPremiosCategorias({ categories, busy, ejecutar }: AdminPremiosCategoriasProps) {
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(null));

  const ordenadas = useMemo(
    () => [...categories].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    [categories],
  );

  const abrir = useCallback((category: PremiosCategory | null) => {
    setBorrador(borradorDe(category));
    setEditando(category ? category.id : 'nueva');
  }, []);

  const cerrar = useCallback(() => setEditando(null), []);

  const guardar = () =>
    ejecutar(async () => {
      if (!borrador.titleEs.trim()) throw new Error(L.errorTitle);

      const options = borrador.options.filter((option) => option.value.trim().length > 0);
      const esNueva = !borrador.id;

      await saveCategory({
        docId: borrador.id || null,
        titleEs: borrador.titleEs,
        titleEn: borrador.titleEn,
        options,
        weight: borrador.weight,
        // Al final de la lista: una categoría nueva no debería colarse en medio de las que ya estaban.
        ...(esNueva ? { orderIndex: ordenadas.length } : {}),
      });

      setEditando(null);
      // Las carátulas de sus nominados, ya: la votación solo enseña lo resuelto (ver `resolverCaratulasDeNominados`).
      const caratulas = await resolverCaratulasDeNominados(options.map((option) => option.value));
      const aviso = esNueva ? L.created(borrador.titleEs) : L.saved(borrador.titleEs);
      return options.length
        ? `${aviso} ${PREMIOS_UI.admin.covers.summary(caratulas.conCaratula, caratulas.sinCaratula, caratulas.fallidas)}`
        : aviso;
    });

  const eliminar = (category: PremiosCategory) => {
    const titulo = getCategoryTitle(category) || L.newTitle;
    if (!window.confirm(L.removeConfirm(titulo))) return;

    void ejecutar(async () => {
      // La ÚLTIMA con título no se borra: se vacía. Una colección sin documentos deja de existir en Firestore.
      const conTitulo = ordenadas.filter((c) => getCategoryTitle(c).trim().length > 0);
      const esLaUltima = conTitulo.length <= 1 && getCategoryTitle(category).trim().length > 0;
      const { kept } = await deleteCategory(category.id, esLaUltima);
      setEditando(null);
      return kept ? `${L.removed(titulo)} ${L.removedKept}` : L.removed(titulo);
    });
  };

  const mover = (index: number, delta: number) => {
    const destino = index + delta;
    if (destino < 0 || destino >= ordenadas.length) return;

    const siguiente = [...ordenadas];
    const [movida] = siguiente.splice(index, 1);
    siguiente.splice(destino, 0, movida);

    void ejecutar(async () => {
      // Se reasigna el orden de TODAS en un lote: así la secuencia queda contigua, sin huecos ni repetidos.
      await reorderCategories(siguiente.map((category) => ({ id: category.id })));
      return L.reordered;
    });
  };

  /**
   * EL FORMULARIO, CON LA FORMA DEL RESTO DE LA SECCIÓN: una ficha con su cabecera, los dos títulos en pareja
   * (caben a lo ancho y son lo mismo en dos idiomas), el peso en botones y los nominados numerados en su lista.
   * Era una pila de rótulos e `input`s a ancho completo, sin nada que dijera dónde acababa un campo y empezaba
   * el siguiente ni qué parte era el formulario y qué parte la lista de debajo.
   */
  const formulario = (
    <div className="premios-admin__form premios-admin__form-card">
      <div className="premios-admin__form-head">
        <strong>{editando === 'nueva' ? L.newTitle : borrador.titleEs || L.edit}</strong>
      </div>

      <div className="premios-admin__form-row">
        <div className="premios-admin__field">
          <label htmlFor="cat-title-es">{L.titleEs}</label>
          <input
            id="cat-title-es"
            className="input"
            type="text"
            value={borrador.titleEs}
            placeholder={L.titleEsPlaceholder}
            onChange={(event) => setBorrador((prev) => ({ ...prev, titleEs: event.target.value }))}
          />
        </div>

        <div className="premios-admin__field">
          <label htmlFor="cat-title-en">{L.titleEn}</label>
          <input
            id="cat-title-en"
            className="input"
            type="text"
            value={borrador.titleEn}
            placeholder={L.titleEnPlaceholder}
            onChange={(event) => setBorrador((prev) => ({ ...prev, titleEn: event.target.value }))}
          />
          <p className="premios-admin__muted">{L.titleEnHint}</p>
        </div>
      </div>

      <span className="premios-admin__label">{L.weightLabel}</span>
      <div className="premios-admin__weights" role="group" aria-label={L.weightLabel}>
        {PESOS.map((peso) => (
          <button
            key={peso}
            type="button"
            className={`btn${borrador.weight === peso ? ' btn-primary' : ''}`}
            aria-pressed={borrador.weight === peso}
            onClick={() => setBorrador((prev) => ({ ...prev, weight: peso }))}
          >
            {peso}
          </button>
        ))}
      </div>
      <p className="premios-admin__muted">{L.weightHint}</p>

      <span className="premios-admin__label">
        {`${L.nomineesLabel} (${borrador.options.filter((o) => o.value.trim()).length})`}
      </span>
      <ol className="premios-admin__nominees">
        {borrador.options.map((option, index) => (
          <li key={index} className="premios-admin__nominee">
            <input
              className="input"
              type="text"
              value={option.value}
              placeholder={L.nomineePlaceholder(index + 1)}
              aria-label={L.nomineePlaceholder(index + 1)}
              onChange={(event) =>
                setBorrador((prev) => ({
                  ...prev,
                  options: prev.options.map((o, i) => (i === index ? { ...o, value: event.target.value } : o)),
                }))
              }
            />
            {borrador.options.length > MIN_NOMINEE_FIELDS ? (
              <button
                type="button"
                className="btn premios-admin__icon-btn"
                aria-label={L.removeNominee(index + 1)}
                title={L.removeNominee(index + 1)}
                onClick={() =>
                  setBorrador((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }))
                }
              >
                <Icon name="close" />
              </button>
            ) : null}
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="btn premios-admin__add"
        onClick={() => setBorrador((prev) => ({ ...prev, options: [...prev.options, { id: null, value: '' }] }))}
      >
        <Icon name="plus" />
        <span>{L.addNominee}</span>
      </button>

      <div className="premios-admin__form-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void guardar()}>
          <Icon name="save" />
          <span>{busy ? L.saving : L.save}</span>
        </button>
        <button type="button" className="btn" disabled={busy} onClick={cerrar}>
          <Icon name="close" />
          <span>{L.cancel}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="premios-admin__block">
      <h3>{L.title}</h3>
      <p className="premios-admin__muted">{L.hint}</p>

      {ordenadas.length === 0 ? <p>{L.empty}</p> : null}

      <ul className="premios-admin__cats">
        {ordenadas.map((category, index) => {
          const titulo = getCategoryTitle(category) || L.newTitle;
          const nominados = category.options || [];
          return (
            <li key={category.id} className="premios-admin__cat">
              <div className="premios-admin__cat-head">
                <strong>{titulo}</strong>
                <span className="premios-admin__muted">
                  {`${L.nominees(nominados.length)} · ${L.weight(category.weight || 1)}`}
                </span>
                {/* CADA ACCIÓN CON SU ICONO Y SU COLOR, como en el resto del panel: mover es una flecha, editar
                    el lápiz y BORRAR va en rojo (`btn-danger`) porque es lo único de esta fila que no se puede
                    deshacer. Antes eran cuatro cajas de texto idénticas —«↑ ↓ Editar Eliminar»— donde la más
                    peligrosa se pulsaba por error con la misma facilidad que la más inocente. */}
                <span className="premios-admin__cat-actions">
                  <button
                    type="button"
                    className="btn premios-admin__icon-btn"
                    aria-label={L.moveUp(titulo)}
                    title={L.moveUp(titulo)}
                    disabled={busy || index === 0}
                    onClick={() => mover(index, -1)}
                  >
                    <Icon name="chevron-up" />
                  </button>
                  <button
                    type="button"
                    className="btn premios-admin__icon-btn"
                    aria-label={L.moveDown(titulo)}
                    title={L.moveDown(titulo)}
                    disabled={busy || index === ordenadas.length - 1}
                    onClick={() => mover(index, 1)}
                  >
                    <Icon name="chevron-down" />
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => (editando === category.id ? cerrar() : abrir(category))}
                  >
                    <Icon name={editando === category.id ? 'close' : 'edit'} />
                    <span>{editando === category.id ? L.cancel : L.edit}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => eliminar(category)}
                  >
                    <Icon name="trash" />
                    <span>{L.remove}</span>
                  </button>
                </span>
              </div>

              {editando === category.id ? formulario : null}
            </li>
          );
        })}
      </ul>

      {/* NUEVA CATEGORÍA, AL FINAL Y APARTADA. Estaba arriba, pegada a la fila de acciones de la primera
          categoría —subir, bajar, editar, eliminar—, y se pulsaba sin querer al ir a cualquiera de ellas:
          aparecía un formulario vacío en medio de la pantalla y había que cancelarlo. Aquí abajo, con la lista
          entera y una línea de por medio, hay que ir a buscarla.

          Y MIENTRAS SE CREA, EL BOTÓN NO ESTÁ: en su sitio va el formulario, que es lo que ese botón acaba de
          abrir. Dejarlo al lado invitaba a pulsarlo otra vez y a perder lo escrito. */}
      <div className="premios-admin__new">
        {editando === 'nueva' ? (
          formulario
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => abrir(null)}>
            <Icon name="plus" />
            <span>{L.create}</span>
          </button>
        )}
      </div>
    </div>
  );
}
