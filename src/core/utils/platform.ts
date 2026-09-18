/**
 * ¿Estamos en un navegador de Windows?
 *
 * Lo pregunta la guía de importación: Playnite SOLO existe para Windows, así que el enlace para descargarla no
 * le sirve a nadie que esté leyendo desde otro sistema —ni desde el móvil, que es donde más se lee esta
 * aplicación—. Donde no sirve, la frase entera se calla en vez de ofrecer un programa que no se va a poder
 * instalar.
 *
 * SE PREGUNTA PRIMERO POR `userAgentData`, que es el dato que los navegadores mantienen al día; el `userAgent`
 * queda de respaldo para los que aún no lo traen. Ninguna de las dos cosas es una verdad absoluta —se pueden
 * falsear, y quien lee esto en el móvil puede tener un PC con Windows al lado—, así que esto decide qué se
 * ENSEÑA y nunca qué se puede hacer: no hay nada que se bloquee con ello.
 */
export function isWindows(): boolean {
  if (typeof navigator === 'undefined') return false;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  if (data?.platform) return data.platform === 'Windows';
  return /Windows|Win32|Win64/i.test(navigator.userAgent || '');
}
