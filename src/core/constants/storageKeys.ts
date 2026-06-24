export const STORAGE_KEY = 'mis-listas-v12-unified';

// Versión del esquema del estado local persistido (localStorage + IndexedDB `appState`). Se estampa al
// guardar; un estado sin esta marca (o con una menor) se considera "viejo" y se auto-actualiza al cargar.
export const LOCAL_SCHEMA_VERSION = 1;

export const GIST_CFG_KEY = 'mis-listas-gist-config';
export const SOCIAL_GIST_CFG_KEY = 'mis-listas-social-gist-config';
