import { useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { coverUrlPorId } from '../../../core/utils/coverUrl';
import { buscarCaratulasIgdb } from '../../../model/repository/premios/premiosIgdbRepository';
import type { PremiosIgdbCandidate, PremiosNomineeCover } from '../../../model/types/premios';
import { GameCover } from '../GameCover';

const L = PREMIOS_UI.admin.categories.cover;

export interface AdminPremiosCaratulaProps {
  /** El nombre del nominado, que es lo que se busca de entrada. */
  nombre: string;
  /** Su número en la lista, para los rótulos: «Carátula del nominado 3». */
  numero: number;
  cover: PremiosNomineeCover | null | undefined;
  onChange: (cover: PremiosNomineeCover | null) => void;
}

/**
 * ELEGIR LA CARÁTULA DE UN NOMINADO DE JUEGOS en IGDB, cuando la automática no es la buena.
 *
 * La automática sale del nombre a secas, y en los premios no hay plataforma que desempate: entre el *Ocarina of
 * Time* de N64 y su remake de Switch 2, que se llaman igual, gana el más votado. Aquí se ven los candidatos con
 * su tipo, su año y sus plataformas, con la automática marcada, y se pulsa el bueno. Sin elegir nada, todo sigue
 * como estaba.
 *
 * Es el hermano de `AdminPremiosImagen` (TMDB, para lo que no son juegos), con la misma forma y las mismas
 * clases. La miniatura de al lado del campo es la misma pieza que la tarjeta de votar (`GameCover`) servida por la
 * misma URL, `/cover?i=`: lo que se ve aquí es lo que verá quien vote.
 */
export function AdminPremiosCaratula({ nombre, numero, cover, onChange }: AdminPremiosCaratulaProps) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState(nombre);
  const [candidatos, setCandidatos] = useState<PremiosIgdbCandidate[] | null>(null);
  const [automatica, setAutomatica] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');

  const buscar = async (texto: string) => {
    if (!texto.trim()) return;
    setBuscando(true);
    setError('');
    try {
      const resultado = await buscarCaratulasIgdb(texto);
      setCandidatos(resultado.candidatos);
      setAutomatica(resultado.automatica);
    } catch (fallo) {
      setCandidatos(null);
      setError(fallo instanceof Error ? fallo.message : String(fallo));
    } finally {
      setBuscando(false);
    }
  };

  const abrir = () => {
    // Se busca de entrada con el nombre escrito: es lo que se iba a buscar casi siempre, y es además el nombre
    // con el que se resuelve la automática, que así sale marcada.
    setConsulta(nombre);
    setAbierto(true);
    setCandidatos(null);
    setAutomatica(null);
    setError('');
    void buscar(nombre);
  };

  const meta = (candidato: PremiosIgdbCandidate): string =>
    [
      candidato.gameType !== undefined ? L.gameTypes[candidato.gameType] : undefined,
      candidato.year,
      candidato.platforms.join(', '),
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <>
      <span className="premios-admin__nominee-thumb" aria-hidden="true">
        {cover ? (
          <GameCover name={nombre} src={coverUrlPorId(cover.imageId)} src2x={coverUrlPorId(cover.imageId, 'medio')} />
        ) : null}
      </span>

      <button
        type="button"
        className="btn"
        aria-expanded={abierto}
        aria-label={cover ? L.changeAria(numero) : L.chooseAria(numero)}
        disabled={!abierto && !nombre.trim()}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
      >
        {abierto ? L.close : cover ? L.change : L.choose}
      </button>

      {abierto ? (
        <div className="premios-admin__image-panel" role="group" aria-label={L.panelAria(numero)}>
          <form
            className="premios-admin__image-search"
            onSubmit={(event) => {
              event.preventDefault();
              void buscar(consulta);
            }}
          >
            <input
              className="input"
              type="search"
              value={consulta}
              aria-label={L.queryAria(numero)}
              placeholder={L.placeholder}
              onChange={(event) => setConsulta(event.target.value)}
            />
            <button type="submit" className="btn" disabled={buscando || !consulta.trim()}>
              {buscando ? L.searching : L.searchAction}
            </button>
            {cover ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  onChange(null);
                  setAbierto(false);
                }}
              >
                {L.automatic}
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
                const elegido = cover?.gameId === candidato.id;
                const esLaAutomatica = !cover && automatica === candidato.coverId;
                return (
                  <li key={candidato.id}>
                    <button
                      type="button"
                      className={`premios-nominee${elegido ? ' is-selected' : ''}`}
                      aria-pressed={elegido}
                      aria-label={L.pickAria(candidato.name, meta(candidato))}
                      onClick={() => {
                        onChange({
                          source: 'igdb',
                          imageId: candidato.coverId,
                          gameId: candidato.id,
                          name: candidato.name,
                        });
                        setAbierto(false);
                      }}
                    >
                      <span className="premios-nominee__slot">
                        <GameCover
                          name={candidato.name}
                          src={coverUrlPorId(candidato.coverId)}
                          src2x={coverUrlPorId(candidato.coverId, 'medio')}
                        />
                      </span>
                      <span className="premios-nominee__body">
                        <span className="premios-nominee__name">{candidato.name}</span>
                        <span className="premios-admin__muted">{meta(candidato)}</span>
                        {elegido || esLaAutomatica ? (
                          <span className="premios-admin__muted">{elegido ? L.chosenBadge : L.automaticBadge}</span>
                        ) : null}
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
