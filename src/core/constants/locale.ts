/**
 * EL IDIOMA DE FORMATO, dicho una sola vez. Fechas, números y orden alfabético salen de aquí y de ningún otro
 * sitio: cada `'es-ES'` escrito a mano era un punto más que cambiar el día que la app hable otro idioma, y los
 * dos `toLocaleString()` que se habían quedado sin locale formateaban con el idioma del NAVEGADOR —«1,000» en un
 * Chrome en inglés, en mitad de una pantalla en español—.
 *
 * Hoy es fijo. Cuando exista la preferencia de idioma (`docs/plan-idioma.md`, F1) será ella quien lo decida, y los
 * consumidores no tendrán que enterarse.
 */
export const APP_LOCALE = 'es-ES';

