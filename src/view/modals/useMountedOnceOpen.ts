import { useState } from 'react';

/**
 * ¿Debe estar MONTADO un modal perezoso? `false` hasta su primera apertura; `true` a partir de ahí, para siempre.
 *
 * Los dos extremos obvios son incorrectos:
 *  - Montarlo siempre (aunque esté cerrado) hace que React arranque su `import()` en el PRIMER render, así que su
 *    chunk se descarga en el arranque compitiendo con la ruta crítica. Es decir, el `lazy` no ahorra nada.
 *  - Desmontarlo al cerrar rompe la restauración del foco: `useNativeDialog` necesita el `<dialog>` vivo para que
 *    `close()` devuelva el foco a quien lo abrió (ver su cabecera).
 *
 * El latch deja el chunk fuera del arranque y, una vez abierto, el diálogo permanece montado y cierra bien.
 * La apertura sigue siendo instantánea porque el chunk se precarga en idle (ver `runWhenIdle` en App).
 */
export function useMountedOnceOpen(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);

  // Ajuste de estado DURANTE el render (patrón soportado por React: re-renderiza antes de pintar, sin efecto
  // intermedio). Solo va de false a true, así que converge en una pasada.
  if (open && !mounted) {
    setMounted(true);
  }

  return mounted;
}
