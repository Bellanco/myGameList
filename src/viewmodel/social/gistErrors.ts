/** ¿El gist no existe (404)? Distinto de no poder leerlo por la credencial (401/403) o por la red. */
export const isNotFoundGistError = (error: unknown): boolean => {
  return error instanceof Error && /\b404\b/.test(error.message);
};
