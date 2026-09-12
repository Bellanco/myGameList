/**
 * Textos FIJOS de la cápsula de aviso. Son cuatro porque el aviso lo escribe el administrador: el título, la
 * descripción y el rótulo vienen del documento, y lo único que pone el código es lo que no puede depender de
 * quien redacta —el respaldo del rótulo y lo que oye un lector de pantalla—.
 */
export const ANNOUNCEMENT_UI = {
  /** Si el panel deja el rótulo en blanco. La primera fila nunca va vacía: es la que dice de qué tipo de cosa se trata. */
  kickerFallback: 'Aviso',
  /**
   * Lo que se anuncia y lo que lee el enlace. Dice ENTERO lo que la cápsula enseña y avisa de que se sale de la
   * app: quien no ve la pantalla no tiene otra forma de saber que el enlace abre otra pestaña.
   *
   * ⚑ EL PUNTO SE PONE SOLO SI FALTA. Los dos textos los escribe el administrador en un formulario, así que unos
   * acaban en punto y otros no; encadenarlos con un punto fijo hacía que un lector de pantalla leyera
   * «…en cinco categorías.. Se abre en otra pestaña». Se vio oyendo el aviso, no leyendo el código.
   */
  linkAria: (title: string, body: string): string => {
    const cerrar = (text: string): string => (/[.!?…»)]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
    return `${cerrar(title)}${body.trim() ? ` ${cerrar(body)}` : ''} Se abre en otra pestaña.`;
  },
} as const;
