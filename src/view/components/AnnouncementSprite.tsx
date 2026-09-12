import { memo, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { AnnouncementIcon as IconId } from '../../core/announcement/announcement';

/**
 * Sprite de los ICONOS DEL AVISO: el dibujo que ocupa el sitio de la medalla en la cápsula.
 *
 * SON DE **Material Symbols** (Google, licencia Apache 2.0), que es la familia de la mayoría del sprite general
 * —de ahí el `viewBox` 0 -960 960 960— y no tiene la atadura de atribución de otras. Se copian aquí como
 * `symbol` en vez de depender de un paquete: son un `path` cada uno.
 *
 * ⚑ NO VAN EN `IconSprite`, que es el del arranque. El presupuesto son 215 kB comprimidos y lo vigila
 * `ci-validate`; estos ocho dibujos solo se ven en dos sitios —la cápsula del aviso y la pantalla que lo
 * redacta—, así que se montan donde se usan y el arranque no paga nada. Es el mismo reparto que el sprite de las
 * medallas.
 *
 * LOS `id` LLEVAN EL PREFIJO `icon-` A PROPÓSITO, el mismo que el sprite general: así la cápsula pinta con un
 * `<use href="#icon-loquesea">` sin saber de qué sprite sale cada dibujo, y la lista de iconos que ofrece el
 * panel puede mezclar los de siempre (campana, estrella, cohete…) con estos.
 *
 * UN SOLO SPRITE EN EL DOCUMENTO, aunque lo pidan a la vez la pantalla del panel y la cápsula que salta encima:
 * dos `<symbol>` con el mismo `id` son HTML inválido y el navegador se queda con el primero. Lo pinta el primero
 * que se monta y al irse pasa el relevo, igual que en `AchievementSprite` (ahí está el porqué largo).
 */
const oyentes = new Set<() => void>();
const montados: symbol[] = [];

function avisar(): void {
  for (const oyente of oyentes) oyente();
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function AnnouncementSprite() {
  const token = useRef<symbol>(undefined as unknown as symbol);
  if (!token.current) token.current = Symbol('ann-sprite');
  const mio = token.current;

  const pinta = useSyncExternalStore(suscribir, () => montados[0] === mio, () => true);

  useLayoutEffect(() => {
    montados.push(mio);
    avisar();
    return () => {
      const donde = montados.indexOf(mio);
      if (donde >= 0) montados.splice(donde, 1);
      avisar();
    };
  }, [mio]);

  if (!pinta) return null;

  return (
    <svg aria-hidden="true" className="svg-sprite">
      {/* Megáfono: el anuncio de toda la vida. Es el que sale por defecto. · Material Symbols «campaign» */}
      <symbol id="icon-megafono" viewBox="0 -960 960 960"><path d="M720-440v-80h160v80H720Zm48 280-128-96 48-64 128 96-48 64Zm-80-480-48-64 128-96 48 64-128 96ZM200-200v-160h-40q-33 0-56.5-23.5T80-440v-80q0-33 23.5-56.5T160-600h160l200-120v480L320-360h-40v160h-80Zm240-182v-196l-98 58H160v80h182l98 58Zm120 36v-268q27 24 43.5 58.5T620-480q0 41-16.5 75.5T560-346ZM300-480Z" /></symbol>
      {/* Mano echando una papeleta: una votación abierta. · Material Symbols «how_to_vote» */}
      <symbol id="icon-votar" viewBox="0 -960 960 960"><path d="M200-80q-33 0-56.5-23.5T120-160v-182l110-125 57 57-80 90h546l-78-88 57-57 108 123v182q0 33-23.5 56.5T760-80H200Zm0-80h560v-80H200v80Zm225-225L284-526q-23-23-22.5-56.5T285-639l196-196q23-23 57-24t57 22l141 141q23 23 24 56t-22 56L538-384q-23 23-56.5 22.5T425-385Zm255-254L539-780 341-582l141 141 198-198ZM200-160v-80 80Z" /></symbol>
      {/* Confeti: una celebración o un estreno. · Material Symbols «celebration» */}
      <symbol id="icon-fiesta" viewBox="0 -960 960 960"><path d="m80-80 200-560 360 360L80-80Zm132-132 282-100-182-182-100 282Zm370-246-42-42 224-224q32-32 77-32t77 32l24 24-42 42-24-24q-14-14-35-14t-35 14L582-458ZM422-618l-42-42 24-24q14-14 14-34t-14-34l-26-26 42-42 26 26q32 32 32 76t-32 76l-24 24Zm80 80-42-42 144-144q14-14 14-35t-14-35l-64-64 42-42 64 64q32 32 32 77t-32 77L502-538Zm160 160-42-42 64-64q32-32 77-32t77 32l64 64-42 42-64-64q-14-14-35-14t-35 14l-64 64ZM212-212Z" /></symbol>
      {/* Calendario: algo con fecha o plazo. · Material Symbols «calendar_month» */}
      <symbol id="icon-fecha" viewBox="0 -960 960 960"><path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Zm280 240q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-188.5-11.5Q280-423 280-440t11.5-28.5Q303-480 320-480t28.5 11.5Q360-457 360-440t-11.5 28.5Q337-400 320-400t-28.5-11.5ZM640-400q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-188.5-11.5Q280-263 280-280t11.5-28.5Q303-320 320-320t28.5 11.5Q360-297 360-280t-11.5 28.5Q337-240 320-240t-28.5-11.5ZM640-240q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240Z" /></symbol>
      {/* Sello dentado: una novedad. · Material Symbols «new_releases» */}
      <symbol id="icon-novedad" viewBox="0 -960 960 960"><path d="m344-60-76-128-144-32 14-148-98-112 98-112-14-148 144-32 76-128 136 58 136-58 76 128 144 32-14 148 98 112-98 112 14 148-144 32-76 128-136-58-136 58Zm34-102 102-44 104 44 56-96 110-26-10-112 74-84-74-86 10-112-110-24-58-96-102 44-104-44-56 96-110 24 10 112-74 86 74 84-10 114 110 24 58 96Zm102-318Zm-42 142 226-226-56-58-170 170-86-84-56 56 142 142Z" /></symbol>
      {/* Información: un aviso de servicio, sin fiesta. · Material Symbols «info» */}
      <symbol id="icon-info" viewBox="0 -960 960 960"><path d="M440-280h80v-240h-80v240Zm68.5-331.5Q520-623 520-640t-11.5-28.5Q497-680 480-680t-28.5 11.5Q440-657 440-640t11.5 28.5Q463-600 480-600t28.5-11.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" /></symbol>
      {/* Rayo: algo que corre prisa. · Material Symbols «bolt» */}
      <symbol id="icon-rayo" viewBox="0 -960 960 960"><path d="m422-232 207-248H469l29-227-185 267h139l-30 208ZM320-80l40-280H160l360-520h80l-40 320h240L400-80h-80Zm151-390Z" /></symbol>
      {/* Regalo: un sorteo o algo que se da. · Material Symbols «redeem» */}
      <symbol id="icon-regalo" viewBox="0 -960 960 960"><path d="M160-280v80h640v-80H160Zm0-440h88q-5-9-6.5-19t-1.5-21q0-50 35-85t85-35q30 0 55.5 15.5T460-826l20 26 20-26q18-24 44-39t56-15q50 0 85 35t35 85q0 11-1.5 21t-6.5 19h88q33 0 56.5 23.5T880-640v440q0 33-23.5 56.5T800-120H160q-33 0-56.5-23.5T80-200v-440q0-33 23.5-56.5T160-720Zm0 320h640v-240H596l84 114-64 46-136-184-136 184-64-46 82-114H160v240Zm228.5-331.5Q400-743 400-760t-11.5-28.5Q377-800 360-800t-28.5 11.5Q320-777 320-760t11.5 28.5Q343-720 360-720t28.5-11.5ZM600-720q17 0 28.5-11.5T640-760q0-17-11.5-28.5T600-800q-17 0-28.5 11.5T560-760q0 17 11.5 28.5T600-720Z" /></symbol>
    </svg>
  );
}

/**
 * Un icono del aviso, venga del sprite que venga. Es el mismo `<use>` que hace `Icon`, con su propio tipo: la
 * lista del aviso mezcla dibujos de los dos sprites y no cabe en `IconName`, que es la del sprite general.
 */
export const AnnouncementIcon = memo(function AnnouncementIcon({
  name,
  className = 'ui-icon',
}: {
  name: IconId;
  className?: string;
}) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#icon-${name}`} />
    </svg>
  );
});
