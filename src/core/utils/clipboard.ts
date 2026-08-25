/**
 * Copiar texto al portapapeles, en un único sitio.
 *
 * `navigator.clipboard` falla de tres maneras distintas y ninguna es excepcional: no existe (contexto no seguro,
 * navegador viejo), existe y el permiso está denegado, o existe y rechaza porque el gesto del usuario ya no se
 * considera reciente. Todas significan lo mismo para quien llama —«no se ha copiado»—, así que se devuelven como
 * un booleano en vez de como una excepción.
 *
 * POR QUÉ IMPORTA QUE ESTÉ AQUÍ Y NO EN CADA BOTÓN: la app tenía cinco copias de este `try/catch`, y en una de
 * ellas el rechazo se lanzaba con `void` y sin `catch`. Eso no era un fallo silencioso: se convertía en un
 * `unhandledrejection`, que la red global de `main.tsx` recoge y REPORTA A TELEMETRÍA como error de la
 * aplicación. Un permiso de portapapeles denegado no es un error de la aplicación.
 *
 * No hay respaldo con `document.execCommand('copy')` a propósito: está obsoleto, exige inyectar y seleccionar un
 * nodo, y en todos los sitios donde se usa esto el texto está a la vista y se puede seleccionar a mano. Si algún
 * día hace falta, este es el único fichero que hay que tocar.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text || typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
