import { GAME_SHEET_UI } from '../../../core/constants/gameSheetLabels';
import type { GameSheetFriend } from '../../../core/gameSheet/buildGameSheet';
import { ScoreDisplay } from '../ScoreDisplay';
import { HubAvatar } from '../socialhub/HubAvatar';
import { HubPersonRow } from '../socialhub/HubPersonRow';
import { activarConTeclado } from './activarConTeclado';

// LO DE TUS AMISTADES EN LA FICHA DE UN JUEGO (F3 y F4): quién lo tiene y quién lo quiere. Va en su propio chunk,
// cargado con `lazy()` solo cuando hay amistades que enseñar, y FUERA del precache del service worker: es una pieza de
// fuera, opcional (F0.10), y con ella el panel no cabía en el presupuesto total (`scripts/ci-validate.js`). Trae
// consigo el renglón de persona del hub, su avatar y la hoja `personRow.scss`. Sin red tras un despliegue, si el chunk
// no llega, la sección no se pinta y la ficha sigue.

/**
 * TUS AMISTADES QUE LO TIENEN (F3 y F4): una fila por persona con su avatar, su nombre, dónde lo tiene (y el mes en que
 * lo terminó, si llega de su biblioteca) y, si lo reseñó, el adelanto y la nota. Ya vienen ordenadas (con reseña
 * primero, después por nota: `buildGameSheet`). Es el renglón de persona del hub (`HubPersonRow`), para que cada tema
 * la vista igual que en «Perfiles». Tocarla, o Intro sobre ella, lleva a su perfil.
 */
function Amistades({ friends, missing, onOpenFriend }: {
  friends: GameSheetFriend[];
  /** De cuántas amistades no se pudo leer la biblioteca: se dice en una línea, sin error (F0.10). */
  missing: number;
  onOpenFriend: (id: string) => void;
}) {
  if (!friends.length) return null;
  return (
    <div className="hub-detail-metadata gs-sec-amistades">
      <div className="hub-metadata-section">
        <strong>{GAME_SHEET_UI.friendsTitle}</strong>
        <ul className="gs-friends">
          {friends.map((friend) => (
            <li key={friend.id}>
              <HubPersonRow
                name={friend.name}
                photoURL={friend.photoURL}
                status={
                  <>
                    <span className={`hub-person-row-status is-${friend.tab}`}>
                      <b>{GAME_SHEET_UI.listPill(friend.tab)}</b>
                      {friend.finishedOn ? ` · ${GAME_SHEET_UI.finishedOn(friend.finishedOn)}` : ''}
                    </span>
                    {friend.snippet ? <span className="gs-snippet">{GAME_SHEET_UI.friendSnippet(friend.snippet)}</span> : null}
                  </>
                }
                onOpen={() => onOpenFriend(friend.id)}
                onKeyDown={activarConTeclado(() => onOpenFriend(friend.id))}
                openAriaLabel={GAME_SHEET_UI.friendOpenAria(friend.name)}
              >
                {friend.grade !== null ? <ScoreDisplay game={{ grade: friend.grade }} /> : null}
              </HubPersonRow>
            </li>
          ))}
        </ul>
        {missing ? <p className="gs-faltan">{GAME_SHEET_UI.friendsMissing(missing)}</p> : null}
      </div>
    </div>
  );
}

/** QUIENES LO QUIEREN: sus deseos, aparte y sin nota. Es relleno (F0.4): solo sale si cabe sin scroll. */
function LoQuieren({ wishers }: { wishers: GameSheetFriend[] }) {
  if (!wishers.length) return null;
  return (
    <div className="hub-detail-metadata gs-sec-quieren">
      <div className="hub-metadata-section">
        <strong>{GAME_SHEET_UI.wishersTitle}</strong>
        <ul className="gs-wanters">
          {wishers.map((friend) => (
            <li key={friend.id} className="gs-wanter">
              <HubAvatar photoURL={friend.photoURL} />
              {friend.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Las dos secciones, como hijas directas del cuerpo en columnas (por eso un fragmento y no una caja). */
export function GameSheetFriends({ friends, wishers, showWishers, missing, onOpenFriend }: {
  friends: GameSheetFriend[];
  wishers: GameSheetFriend[];
  /** «Lo quieren» es relleno (F0.4): lo decide la medida del ancho (`useGameSheetWidth`). */
  showWishers: boolean;
  missing: number;
  onOpenFriend: (id: string) => void;
}) {
  return (
    <>
      <Amistades friends={friends} missing={missing} onOpenFriend={onOpenFriend} />
      {showWishers ? <LoQuieren wishers={wishers} /> : null}
    </>
  );
}
