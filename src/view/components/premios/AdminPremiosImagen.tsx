import { useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { posterUrl } from '../../../core/premios/nomineeImage';
import { nombreDeInterprete } from '../../../core/premios/personQuery';
import { buscarImagenesTmdb } from '../../../model/repository/premios/premiosTmdbRepository';
import type { PremiosNomineeImage, PremiosNomineeKind, PremiosTmdbCandidate } from '../../../model/types/premios';
import { GameCover } from '../GameCover';

const L = PREMIOS_UI.admin.categories.image;

export interface AdminPremiosImagenProps {
  /** Qué se nomina: interpretaciones buscan personas; cine o serie, películas y series. */
  kind: Exclude<PremiosNomineeKind, 'game'>;
  /** El nombre del nominado, que es lo que se busca de entrada (en interpretaciones, sin el juego). */
  nombre: string;
  /** Su número en la lista, para los rótulos: «Imagen del nominado 3». */
  numero: number;
  image: PremiosNomineeImage | null | undefined;
  onChange: (image: PremiosNomineeImage | null) => void;
}

/**
 * ELEGIR LA IMAGEN DE UN NOMINADO en TMDB: el póster de una serie o película, o la foto de un actor.
 *
 * SE ELIGE A MANO, y es lo que da sentido a todo esto: se busca, se ven los candidatos con su imagen, su año o
 * aquello por lo que se le conoce, y se pulsa el bueno. Nada se adivina por el nombre: «Troy Baker» tiene
 * homónimos y «The Last of Us» salen la serie y cinco documentales (ver `functions/_lib/tmdb`).
 *
 * La miniatura de al lado del campo es la misma pieza que la tarjeta de votar (`GameCover`) servida igual, por
 * `/poster`: lo que se ve aquí es lo que verá quien vote.
 */
export function AdminPremiosImagen({ kind, nombre, numero, image, onChange }: AdminPremiosImagenProps) {
  // Una interpretación se escribe «Actor - Juego», y TMDB solo encuentra al actor sin el juego (ver `personQuery`).
  const consultaInicial = kind === 'person' ? nombreDeInterprete(nombre) : nombre;
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState(consultaInicial);
  const [candidatos, setCandidatos] = useState<PremiosTmdbCandidate[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');

  const buscar = async () => {
    if (!consulta.trim()) return;
    setBuscando(true);
    setError('');
    try {
      setCandidatos(await buscarImagenesTmdb(consulta, kind));
    } catch (fallo) {
      setCandidatos(null);
      setError(fallo instanceof Error ? fallo.message : String(fallo));
    } finally {
      setBuscando(false);
    }
  };

  const abrir = () => {
    // Se busca de entrada con el nombre escrito: es lo que se iba a buscar casi siempre.
    setConsulta(consultaInicial);
    setAbierto(true);
    setCandidatos(null);
    setError('');
    if (consultaInicial.trim()) {
      setBuscando(true);
      void buscarImagenesTmdb(consultaInicial, kind)
        .then(setCandidatos)
        .catch((fallo: unknown) => setError(fallo instanceof Error ? fallo.message : String(fallo)))
        .finally(() => setBuscando(false));
    }
  };

  const meta = (candidato: PremiosTmdbCandidate): string => {
    if (candidato.kind === 'person') return (candidato.knownFor || []).join(' · ');
    const tipo = candidato.kind === 'tv' ? L.kindTv : L.kindMovie;
    return [tipo, candidato.year, candidato.originalTitle].filter(Boolean).join(' · ');
  };

  return (
    <>
      <span className="premios-admin__nominee-thumb" aria-hidden="true">
        {image ? <GameCover name={nombre} src={posterUrl(image.path)} src2x={posterUrl(image.path, 'medio')} /> : null}
      </span>

      <button
        type="button"
        className="btn"
        aria-expanded={abierto}
        aria-label={image ? L.changeAria(numero) : L.searchAria(numero)}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
      >
        {abierto ? L.close : image ? L.change : L.search}
      </button>

      {abierto ? (
        <div className="premios-admin__image-panel" role="group" aria-label={L.panelAria(numero)}>
          <form
            className="premios-admin__image-search"
            onSubmit={(event) => {
              event.preventDefault();
              void buscar();
            }}
          >
            <input
              className="input"
              type="search"
              value={consulta}
              aria-label={L.queryAria(numero)}
              placeholder={kind === 'person' ? L.placeholderPerson : L.placeholderScreen}
              onChange={(event) => setConsulta(event.target.value)}
            />
            <button type="submit" className="btn" disabled={buscando || !consulta.trim()}>
              {buscando ? L.searching : L.searchAction}
            </button>
            {image ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  onChange(null);
                  setAbierto(false);
                }}
              >
                {L.remove}
              </button>
            ) : null}
          </form>

          {error ? <p className="premios-admin__warn">{error}</p> : null}
          {candidatos && candidatos.length === 0 && !buscando ? (
            <p className="premios-admin__muted">{L.empty}</p>
          ) : null}

          {candidatos && candidatos.length > 0 ? (
            <ul className="premios-admin__image-results">
              {candidatos.map((candidato) => {
                const elegido = image?.id === candidato.id && image?.kind === candidato.kind;
                return (
                  <li key={`${candidato.kind}-${candidato.id}`}>
                    <button
                      type="button"
                      className={`premios-nominee${elegido ? ' is-selected' : ''}`}
                      aria-pressed={elegido}
                      aria-label={L.pickAria(candidato.title, meta(candidato))}
                      onClick={() => {
                        onChange({ source: 'tmdb', kind: candidato.kind, id: candidato.id, path: candidato.path });
                        setAbierto(false);
                      }}
                    >
                      <span className="premios-nominee__slot">
                        <GameCover
                          name={candidato.title}
                          src={posterUrl(candidato.path)}
                          src2x={posterUrl(candidato.path, 'medio')}
                        />
                      </span>
                      <span className="premios-nominee__body">
                        <span className="premios-nominee__name">{candidato.title}</span>
                        <span className="premios-admin__muted">{meta(candidato)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
