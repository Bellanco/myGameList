import { useEffect, useMemo, useRef, useState } from 'react';
import { usePageVisible } from './usePageVisible';

// LO QUE COMPARTEN LAS CÁPSULAS DEL CARRIL (logro, aviso del administrador, resumen del año, condiciones nuevas):
// una vida que se para mientras se lee, y el anuncio en su región viva. Estaba escrito cuatro veces igual.

/**
 * Lo que se espera para escribir dentro de la región viva. Una región viva solo anuncia lo que cambia MIENTRAS ella
 * existe: la del aviso de estado de la app está siempre montada y vacía, pero la de una cápsula nace con ella, así que
 * se monta vacía y el texto entra un instante después.
 */
const ANNOUNCE_DELAY_MS = 120;

/** Los gestos que paran el reloj: van en el elemento que se enfoca y se pulsa (su área cubre la cápsula entera). */
export interface ToastPauseHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

/**
 * La VIDA de una cápsula: llama a `onDone` al cumplirse `lifeMs`, en pausa mientras se lee (ratón o foco encima) y con
 * la pestaña de fondo, porque si nadie puede leerla el reloj no corre. Cambiar `resetKey` la reinicia (una cápsula que
 * se funde con otra vuelve a tener su vida entera). Con `active` a falso no corre (la vista previa del panel, o una
 * cápsula sin contenido).
 */
export function useToastLife(
  onDone: (() => void) | undefined,
  { lifeMs, resetKey, active = true }: { lifeMs: number; resetKey?: unknown; active?: boolean },
): ToastPauseHandlers {
  const [paused, setPaused] = useState(false);
  const visible = usePageVisible();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!active || paused || !visible) return undefined;
    const reloj = window.setTimeout(() => doneRef.current?.(), lifeMs);
    return () => window.clearTimeout(reloj);
  }, [active, paused, visible, lifeMs, resetKey]);

  return useMemo(() => ({
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocus: () => setPaused(true),
    onBlur: () => setPaused(false),
  }), []);
}

/** El texto de la región viva de una cápsula, un instante después de montarse (ver `ANNOUNCE_DELAY_MS`). */
export function useToastAnnouncement(text: string, active = true): string {
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    if (!active) return undefined;
    const reloj = window.setTimeout(() => setAnnounced(text), ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(reloj);
  }, [text, active]);
  return announced;
}
