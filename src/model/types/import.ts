// Tipos de la importación de bibliotecas (Entrega 1: cimiento + Playnite).
//
// La "Bandeja de importados" es un almacén LOCAL (no se sincroniza por gist) y de paso: los juegos
// importados caen aquí, se clasifican a las listas (c/v/e/p) —donde ya funcionan como el resto— y se
// purgan a los 30 días si no se clasifican. Ver docs/plan-importacion-bibliotecas.md.

import type { TabId } from './game';

// Orígenes de importación. Hoy solo se implementa 'playnite'; el resto son añadidos futuros.
export type ImportSource = 'playnite' | 'steam' | 'xbox' | 'psn' | 'gog' | 'egs';

// Método de export de Playnite elegido: 'json' (Json Library Import Export) o 'csv' (Library Exporter).
export type ImportMethod = 'json' | 'csv';

// IDs externos por origen (para dedupe/fusión en la bandeja). NO viajan al gist. Se deriva de
// `ImportSource` para que al añadir un origen nuevo su clave quede disponible automáticamente;
// `igdb` se añade aparte por ser fuente de metadatos, no de biblioteca.
export type ExternalIds = Partial<Record<ImportSource, string>> & { igdb?: string };

// Juego "crudo" que devuelve un conector antes de entrar en la bandeja.
export interface RawExternalGame {
  externalId: string;
  name: string;
  source: ImportSource;
  genres?: string[];
  platforms?: string[];
  hours?: number | null;
  coverUrl?: string;
  // Extras (agnósticos de origen; los rellena el mapper de cada conector, p. ej. Playnite):
  suggestedTab?: TabId; // lista destino sugerida al clasificar (Playnite: CompletionStatus)
  grade?: number | null; // nota 0–100 para precargar el formulario (Playnite: UserScore)
}

// Un juego dentro de la bandeja. `platforms`/`sources`/`externalIds` se ACUMULAN al fusionar el mismo
// juego llegado de otra tienda (un juego puede tenerse en varias plataformas).
export interface ImportedGame {
  id: number; // local, propio de la bandeja
  name: string;
  platforms: string[];
  genres: string[];
  sources: ImportSource[];
  externalIds?: ExternalIds;
  coverUrl?: string; // (futuro: IGDB) — Playnite no aporta URL cargable
  hours?: number | null;
  suggestedTab?: TabId; // preselección de lista al clasificar (no obligatorio)
  grade?: number | null; // nota 0–100 para precargar el formulario al clasificar
  existsInLists?: boolean; // ya está en c/v/e/p → se muestra en sección aparte
  importedAt: number; // ms; para la caducidad (TTL 30 días)
}

// Contenedor de la bandeja (un único registro local).
export interface ImportInbox {
  imported: ImportedGame[];
  updatedAt: number;
}

// Resumen de una inserción en lote (para el aviso al usuario).
export interface StagingSummary {
  added: number; // entradas nuevas
  merged: number; // fusionadas en una existente (mismo juego, otra plataforma)
  duplicates: number; // re-import idempotente (mismo juego + mismo origen)
  invalid: number; // descartadas (sin nombre)
  flaggedExisting: number; // añadidas pero ya presentes en tus listas (marcadas)
}

// Interfaz común de conector de biblioteca (extensible; hoy solo Playnite, con needsProxy=false).
export interface LibraryConnector {
  id: ImportSource;
  label: string;
  needsProxy: boolean;
  fetchLibrary(input: unknown): Promise<RawExternalGame[]>;
}
