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
 * Se auditan las DOCE combinaciones sobre la lista con una fila desplegada, que es la pantalla con más superficie
 * de color de la app: chips de plataforma y género, notas, insignias, botones de acción y las cajas del detalle.
 *
 * El fichero va aparte del smoke a propósito: aquel se declara "deliberadamente corto" porque un smoke lento se
 * acaba ignorando, y esto son doce recorridos.
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

for (const palette of PALETAS) {
  for (const theme of TEMAS) {
    test(`sin violaciones de accesibilidad · paleta ${palette} · tema ${theme}`, async ({ page }) => {
      await sembrarBiblioteca(page, { theme, palette });
      await listaConDetalleAbierto(page);

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // El mensaje de fallo tiene que decir QUÉ arreglar sin abrir el informe: regla, impacto y el primer nodo.
      const resumen = violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`);
      expect(resumen, `Violaciones con ${palette}/${theme}`).toEqual([]);
    });
  }
}
