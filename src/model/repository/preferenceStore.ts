// Fábrica de PREFERENCIAS de usuario: local-first (localStorage manda y funciona sin cuenta) con réplica
// opcional a `publicConfig/{uid}` cuando hay sesión de Google.
//
// Existe porque las cinco preferencias de apariencia (tema, paleta, caja, efectos, botón de Steam Deck) eran
// cinco copias del mismo hook y cinco funciones de repositorio idénticas salvo el nombre del campo: leer una
// clave, validarla, aplicar un `data-*` al <html>, guardar, replicar a la nube y avisar a las demás instancias
// por un evento de `window` distinto para cada una. Aquí eso se escribe una vez.
//
// La reactividad es pub/sub explícito (mismo patrón que `scorePreferenceRepository`), pensado para
// `useSyncExternalStore`: sin el bus de eventos de `window`, y sin la ventana entre el primer render y la
// suscripción en `useEffect` en la que el patrón anterior podía perderse un cambio.
import { getPublicConfig, setPublicConfig } from './firebaseGateway';
import type { FirestorePublicConfig } from '../types/firestore';

type Listener = () => void;

export interface PreferenceStore<T> {
  /**
   * Valor actual. Lee de localStorage en CADA llamada, a propósito: es la fuente de verdad (la comparte el
   * anti-flash de `public/theme-init.js`, que corre antes que nada de esto) y así no hay caché que pueda
   * quedarse obsoleta. Devuelve siempre un PRIMITIVO, de modo que vale como `getSnapshot` de
   * `useSyncExternalStore` sin provocar renders en bucle (la comparación es por `Object.is`).
   */
  get(): T;
  /** Guarda en local, aplica al DOM, replica a la nube si procede y notifica a los suscriptores. */
  set(value: T): void;
  subscribe(listener: Listener): () => void;
  /** Aplica al DOM el valor actual, sin escribir nada. Para el montaje y tras hidratar. */
  apply(): void;
}

export interface PreferenceDefinition<T> {
  /** Clave de localStorage (ver `core/constants/storageKeys`). */
  key: string;
  /** Interpreta el valor guardado. Recibe `null` si no hay nada o si localStorage no está disponible. */
  parse(raw: string | null): T;
  serialize(value: T): string;
  /**
   * Campo de `publicConfig/{uid}` al que se replica. Sin él la preferencia es solo de este dispositivo
   * (que es lo correcto, p. ej., para un consentimiento).
   */
  cloudField?: keyof FirestorePublicConfig;
  /** Valida lo que llega de la nube. Devuelve `null` para ignorarlo (ausente o con forma inesperada). */
  fromCloud?(value: unknown): T | null;
  /** Efecto en el DOM del valor (atributo en `<html>`, `theme-color`…). Opcional: no todas pintan nada. */
  applyToDom?(value: T): void;
}

/** uid de la sesión actual; sin él, los cambios locales no se replican. */
let currentUid: string | null = null;

/** Preferencias con réplica en la nube, para la hidratación al iniciar sesión. */
const cloudBacked: Array<(config: FirestorePublicConfig) => void> = [];

export function setPreferenceUid(uid: string | null): void {
  currentUid = uid;
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // localStorage no disponible (modo privado estricto): se cae al valor por defecto de cada preferencia.
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin persistencia: el cambio vale para la sesión en curso y no se recordará.
  }
}

export function createPreferenceStore<T>(definition: PreferenceDefinition<T>): PreferenceStore<T> {
  const listeners = new Set<Listener>();
  const get = (): T => definition.parse(readRaw(definition.key));
  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  if (definition.cloudField && definition.fromCloud) {
    const { cloudField, fromCloud } = definition;
    cloudBacked.push((config) => {
      const incoming = fromCloud(config[cloudField]);
      if (incoming === null) return;
      // Se escribe en local y se aplica, pero NO se replica de vuelta: esto viene de la nube y re-persistirlo
      // sería un bucle.
      writeRaw(definition.key, definition.serialize(incoming));
      definition.applyToDom?.(incoming);
      emit();
    });
  }

  return {
    get,
    set(value) {
      writeRaw(definition.key, definition.serialize(value));
      definition.applyToDom?.(value);
      if (definition.cloudField && currentUid) {
        void setPublicConfig(currentUid, { [definition.cloudField]: value } as Partial<FirestorePublicConfig>);
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    apply() {
      definition.applyToDom?.(get());
    },
  };
}

/**
 * Vuelca a local las preferencias que haya en la nube al iniciar sesión y las aplica. Best-effort: si falla
 * (reglas, offline, sin Firebase) se conserva lo local, que es lo que la app venía usando.
 *
 * Solo hidrata las preferencias YA declaradas; el módulo que las declara debe estar importado antes. Lo garantiza
 * el grafo de imports: quien llama a esto (`useAppearanceSession`) importa el módulo de declaraciones.
 */
export async function hydratePreferencesFromCloud(uid: string): Promise<void> {
  try {
    const config = await getPublicConfig(uid);
    if (!config) return;
    for (const hydrate of cloudBacked) hydrate(config);
  } catch {
    // permission-denied / offline / sin Firebase → se conserva lo local.
  }
}
