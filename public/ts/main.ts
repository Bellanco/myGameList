// @ts-nocheck
/**
 * MAIN.TS — Entry point para Vite
 * Importa y inicializa todos los módulos de la aplicación
 */

import { SteamListApp } from './app.ts';
import { GistSync, DataSync } from './sync.ts';
import { migrateData } from './migrate.ts';

// Exponer las APIs en window para compatibilidad
(window as any).migrateData = migrateData;
(window as any).GistSync = GistSync;
(window as any).DataSync = DataSync;

// Inicializar la aplicación (el constructor llama a init())
const app = new SteamListApp();

// Exponemos la app globalmente para debugging
(window as any).__app = app;
