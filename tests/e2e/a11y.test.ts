import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { JUEGOS, sembrarBiblioteca } from './seed';

/**
 * AUDITORÍA DE ACCESIBILIDAD SOBRE EL RENDER REAL.
 *
 * Qué añade sobre lo que ya había: las dieciocho reglas de `jsx-a11y` del linter leen JSX ESTÁTICO. Saben si a un
 * `<img>` le falta el `alt`, pero no pueden saber nada de lo único que se decide al pintar: el contraste real de
 * cada paleta, los roles que resultan tras componer el árbol y el estado de los controles cuando el usuario ya ha
 * interactuado. Con seis paletas propias × dos temas, el contraste es justo lo que se rompe sin que nadie se
 * entere —basta con retocar un token de color en `_base.scss`—.
 *
 * Se auditan las DOCE combinaciones sobre dos pantallas:
 *
 *  - La LISTA con una fila desplegada, que es la que más superficie de color tiene: chips de plataforma y género,
 *    notas, insignias, botones de acción y las cajas del detalle.
 *  - El PANEL de estadísticas, que es la que más color PROPIO tiene —rampas de nota, mapas de calor, bandas— y
 *    además mete controles dentro de SVG, que es donde el rol y el foco se rompen sin que nadie se entere. Va con
 *    la biblioteca amplia porque con tres juegos casi todos sus bloques enseñan su estado vacío, y auditar una
 *    pantalla vacía no audita nada.
 *
 * El fichero va aparte del smoke a propósito: aquel se declara "deliberadamente corto" porque un smoke lento se
 * acaba ignorando, y esto son veinticuatro recorridos.
 */

const PALETAS = ['steam', 'persona', 'portal', 'cyberpunk', 'seaofstars', 'grimdark'] as const;
const TEMAS = ['dark', 'light'] as const;

/** Deja la lista pintada y una fila abierta: es el estado con más color y más controles a la vista. */
async function listaConDetalleAbierto(page: Page): Promise<void> {
  await page.goto('/completados');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista del completista');
  const fila = page.locator(`button[aria-controls="game-detail-${JUEGOS[0].id}"]`);
  await fila.click();
  await expect(fila).toHaveAttribute('aria-expanded', 'true');
}

/** Deja el panel de estadísticas pintado con todos sus bloques a la vista. */
async function panelDeEstadisticas(page: Page): Promise<void> {
  await page.goto('/perfil');
  // Las tarjetas se destapan al llegar a ellas; para auditarlas hay que tenerlas todas montadas.
  await expect(page.locator('.stats-hub')).toBeVisible();
  await page.evaluate(() => {
    const hub = document.querySelector('.stats-hub');
    hub?.classList.remove('is-watching');
    hub?.querySelectorAll(':scope > *').forEach((card) => card.classList.add('is-in'));
  });
  await expect(page.locator('.genre-bump-svg')).toBeVisible();
}

/** Las violaciones, resumidas para que el fallo diga QUÉ arreglar sin abrir el informe. */
async function violacionesDe(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  // Con los datos de la primera comprobación: en un fallo de contraste dice los dos colores y el ratio, que es
  // lo que hace falta para arreglarlo sin abrir el informe ni reproducirlo a mano.
  return violations.map(
    (v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')} :: ${JSON.stringify(v.nodes[0]?.any?.[0]?.data)}`,
  );
}

for (const palette of PALETAS) {
  for (const theme of TEMAS) {
    test(`sin violaciones de accesibilidad · lista · paleta ${palette} · tema ${theme}`, async ({ page }) => {
      await sembrarBiblioteca(page, { theme, palette });
      await listaConDetalleAbierto(page);
      expect(await violacionesDe(page), `Violaciones en la lista con ${palette}/${theme}`).toEqual([]);
    });

    test(`sin violaciones de accesibilidad · panel · paleta ${palette} · tema ${theme}`, async ({ page }) => {
      await sembrarBiblioteca(page, { theme, palette, amplia: true });
      await panelDeEstadisticas(page);
      expect(await violacionesDe(page), `Violaciones en el panel con ${palette}/${theme}`).toEqual([]);
    });
  }
}
