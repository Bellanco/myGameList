/** Tipos de `deployed-html.mjs` para los tests en TypeScript. */
export interface RecursoAjeno {
  etiqueta: string;
  url: string;
}

export function recursosAjenos(html: string, urlPagina: string): RecursoAjeno[];
