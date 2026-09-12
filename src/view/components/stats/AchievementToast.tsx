import { useEffect, useRef, useState } from 'react';
import { AchievementMedal } from './AchievementMedal';
import { AchievementSprite } from '../AchievementSprite';
import { ACHIEVEMENTS_UI } from '../../../core/constants/achievementLabels';
import { RARITY_POINTS } from '../../../core/achievements/types';
import { usePageVisible } from '../../hooks/usePageVisible';
import type { AchievementDef } from '../../../core/achievements/types';

/**
 * EL AVISO DEL INSTANTE, la tarjeta. Ver docs/plan-logros.md §7.4 y la maqueta `docs/logros/demo-toast.html`.
 *
 * POR QUÉ NO SIRVE EL BANNER. El §7.4 existe para que el desbloqueo se cuente EN EL MOMENTO, y su propio texto
 * describe el fallo que evita: «marcas un juego como terminado y el logro aparece callado tres días después.
 * Técnicamente correcto y emocionalmente nulo». Decirlo por el banner de «Juego guardado» era exactamente eso a
 * medias: llegaba en el instante, sí, pero como una línea de texto entre avisos de sincronización, sin la
 * medalla —que es la cosa— y con el rótulo «Correcto» delante. Un logro que se anuncia como un guardado correcto
 * no se siente conseguido.
 *
 * LO QUE LA CÁPSULA DICE, y cada cosa en un canal distinto:
 *  - el DIBUJO: la medalla de verdad, la misma que sale en `/logros`, a 64 px;
 *  - la SOMBRA: la rareza (la escala de loot que ya usa el aura). No se escribe en ninguna parte, se ve;
 *  - el RÓTULO: qué ha pasado —«Has desbloqueado», «Vas por la mitad»—, con el acento del tema;
 *  - el NOMBRE y la DESCRIPCIÓN: el nombre ya trae su grado del catálogo y la descripción es el texto en pasado
 *    del escalón (`labels.done`), que es lo que se acaba de hacer.
 *
 * TRES DECISIONES QUE NO SE REVISITAN A CIEGAS:
 *
 *  1. **Cinco segundos y sin botón de cerrar.** La cuenta se para mientras se lee: con el ratón encima, con el
 *     foco dentro o con la pestaña de fondo (ver `usePageVisible`). Un aviso de cortesía con una X es una X que
 *     nadie pulsa y que roba un tabulador.
 *  2. **Una sola cápsula.** Si llega otro desbloqueo mientras vive, se FUNDE en la misma —de ahí que el texto
 *     sepa contar— en vez de apilar una segunda: dos avisos superpuestos tapan la barra inferior.
 *  3. **Hasta tres medallas solapadas** y de la cuarta en adelante lo dice la cuenta. Tres discos de 64 px en
 *     fila no caben en la cápsula; solapados, sí, y el solape se mide por la PÍLDORA y no por el disco (ver la
 *     hoja) para que las tres cifras se sigan leyendo.
 *
 * Y EL SPRITE SE MONTA AQUÍ, que es lo que hace que esto pueda vivir encima de cualquier pantalla: los dibujos
 * viven en un chunk perezoso que hasta ahora solo cargaban las dos rutas de logros. `AchievementSprite` reparte
 * un dueño único, así que montarlo también aquí no duplica ni un `symbol` cuando el aviso salta sobre `/logros`.
 */

/** El instante que se anuncia: o un puñado de logros conseguidos, o un hito de una escalera en marcha. */
export type AchievementFlash =
  | { kind: 'unlock'; defs: readonly AchievementDef[] }
  /**
   * LO QUE TE ESPERABA. Misma cápsula que un desbloqueo y otro rótulo: no acabas de hacerlo, ya estaba hecho y
   * el catálogo (o el otro aparato) se ha puesto al día. Es lo que se cuenta al abrir la app después de una
   * ampliación, en vez de conceder noventa y ocho medallas en silencio.
   */
  | { kind: 'catalog'; defs: readonly AchievementDef[] }
  | { kind: 'milestone'; def: AchievementDef; value: number; step: number };

interface AchievementToastProps {
  flash: AchievementFlash | null;
  /** Lo llama al agotarse la vida de la cápsula. Quien la pintó decide si vuelve a haber otra. */
  onDone: () => void;
  /** Ir a `/logros`: el instante invita a mirar el detalle, y el detalle está ahí. */
  onOpen?: () => void;
}

/** Vida de la cápsula. En pausa mientras se lee. */
const LIFE_MS = 5000;

/** Medallas que caben solapadas. De la cuarta en adelante, la cuenta la dice el texto. */
const MEDALS_MAX = 3;

/** Porcentaje desde el que un hito deja de ser «vas por la mitad» y pasa a ser «casi lo tienes». */
const NEAR_PERCENT = 85;

export function AchievementToast({ flash, onDone, onOpen }: AchievementToastProps) {
  const [paused, setPaused] = useState(false);
  // Y con la pestaña de fondo, igual que con el ratón encima: el reloj no corre si nadie puede leerla.
  const visible = usePageVisible();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // La clave del `flash` reinicia el reloj: una cápsula que se funde con otra vuelve a tener sus cinco segundos.
  const key = flash === null
    ? ''
    : flash.kind === 'milestone'
      ? `${flash.def.id}:${flash.value}`
      : flash.defs.map((def) => def.id).join(',');

  useEffect(() => {
    if (!key || paused || !visible) return;
    const reloj = window.setTimeout(() => doneRef.current(), LIFE_MS);
    return () => window.clearTimeout(reloj);
  }, [key, paused, visible]);

  if (flash === null) return null;

  // EL ORDEN ES EL DE LA RAREZA, de mayor a menor: el mismo criterio con el que el listado y el feed ordenan los
  // logros de una jornada. Así la medalla de delante y la sombra de la cápsula son las del más raro sin elegirlo
  // aparte. A igualdad de rareza, el nombre, para que el orden no baile.
  // Un hito habla de UN escalón; el desbloqueo y el estreno de catálogo, de un puñado.
  const conseguido = flash.kind !== 'milestone';
  const defs = conseguido
    ? [...flash.defs].sort((a, b) =>
      RARITY_POINTS[b.rarity] - RARITY_POINTS[a.rarity] || a.labels.name.localeCompare(b.labels.name))
    : [flash.def];
  const first = defs[0];
  if (!first) return null;

  /**
   * LAS TRES MEDALLAS, DE TRES ESCALERAS DISTINTAS. Con una avalancha —importar una biblioteca de trescientos
   * juegos concede ciento y pico escalones de golpe— los tres logros MÁS RAROS son casi siempre tres escalones
   * de la misma escalera («Cien por cien» I, II y III), y la cápsula enseñaba tres discos idénticos con distinta
   * cifra: parecía un fallo de pintado. Una por escalera dice tres cosas en vez de una tres veces.
   *
   * Si no hay tres escaleras distintas se rellena con lo que haya: el hueco se notaría más que la repetición.
   */
  const medallas: AchievementDef[] = [];
  const escaleras = new Set<string>();
  for (const def of defs) {
    if (escaleras.has(def.ladder)) continue;
    escaleras.add(def.ladder);
    medallas.push(def);
    if (medallas.length === MEDALS_MAX) break;
  }
  for (const def of defs) {
    if (medallas.length >= MEDALS_MAX) break;
    if (!medallas.includes(def)) medallas.push(def);
  }

  const many = conseguido && defs.length > 1;
  const percent = flash.kind === 'milestone' && flash.step > 0
    ? Math.min(100, Math.round((flash.value / flash.step) * 100))
    : 0;

  const kicker = flash.kind === 'unlock'
    ? ACHIEVEMENTS_UI.toastUnlocked
    : flash.kind === 'catalog'
      ? ACHIEVEMENTS_UI.toastWaiting
      : percent >= NEAR_PERCENT ? ACHIEVEMENTS_UI.toastNear : ACHIEVEMENTS_UI.toastHalf;

  return (
    <div className="ach-toast-stack">
      <AchievementSprite />
      {/* La rareza va en la clase y de ahí sale la sombra. Un HITO no la lleva: aún no se ha conseguido, así que
          se queda con el peltre por defecto, igual que su medalla. */}
      <div className={`ach-toast${conseguido ? ` is-${first.rarity}` : ''}`}>
        {conseguido ? <span className="ach-toast-sheen" aria-hidden="true" /> : null}
        {/* LA PAUSA LA LLEVA EL BOTÓN, no la cápsula, y no es un apaño para el linter: los manejadores de ratón
            y foco en un `div` son justo lo que prohíbe `jsx-a11y/no-static-element-interactions`, y con razón
            —un área que reacciona y no se puede enfocar ni pulsar con teclado—. El botón sí es interactivo, y su
            área se extiende a la cápsula entera desde la hoja (`.ach-toast-body::after`), que es además lo que
            la maqueta pedía: el cuerpo entero lleva a /logros. */}
        <button
          type="button"
          className="ach-toast-body"
          onClick={onOpen}
          aria-label={ACHIEVEMENTS_UI.toastLink}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <span className="ach-toast-medals">
            {medallas.map((def) => (
              <AchievementMedal
                key={def.id}
                def={def}
                level={conseguido ? 1 : 0}
                size="toast"
              />
            ))}
          </span>
          <span className="ach-toast-text">
            <span className="ach-toast-kicker">{kicker}</span>
            <span className="ach-toast-name">
              {many
                ? (flash.kind === 'catalog'
                  ? ACHIEVEMENTS_UI.toastWaitingName(defs.length)
                  : ACHIEVEMENTS_UI.toastManyName(defs.length))
                : first.labels.name}
            </span>
            {flash.kind === 'milestone' ? (
              <span className="ach-toast-progress">
                <span className="ach-toast-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
                <span className="ach-toast-figure">
                  {ACHIEVEMENTS_UI.toastFigure(flash.value, flash.step, percent)}
                </span>
              </span>
            ) : (
              <span className="ach-toast-desc">
                {!many
                  ? first.labels.done
                  : flash.kind === 'catalog'
                    ? ACHIEVEMENTS_UI.toastWaitingBody
                    : ACHIEVEMENTS_UI.toastNames(defs.map((def) => def.labels.name))}
              </span>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
