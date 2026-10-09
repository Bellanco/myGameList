/**
 * LA PUBLICACIÓN YA NO EXISTE. Se borró desde otro dispositivo mientras aquí seguía abierta para editarla.
 *
 * Es un error con nombre propio, y no un `null`, porque `null` ya significa «no había nada que cambiar» (mismo
 * texto): confundirlos hacía que editar algo borrado respondiera «Publicación actualizada» y dejara a la vista un
 * texto que ya no estaba en ninguna parte (09-10-2026). Se reconoce por el nombre y no por `instanceof`, para que
 * valga aunque el módulo que lo lanza se sustituya en las pruebas.
 */
export class PostGoneError extends Error {
  constructor() {
    super('La publicación ya no existe.');
    this.name = 'PostGoneError';
  }
}

export function isPostGoneError(error: unknown): boolean {
  return error instanceof Error && error.name === 'PostGoneError';
}
