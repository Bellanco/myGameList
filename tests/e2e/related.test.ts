import { test, expect, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * EL BLOQUE DE «ANÁLISIS SUGERIDOS», que es una REJILLA de tarjetas prestadas.
 *
 * Las tarjetas son las mismas del feed social, reutilizadas en tres sitios (el feed, la lista de reseñas de un
 * perfil y esta rejilla). Eso está bien —una reseña se ve igual en todas partes— pero tiene una trampa: las
 * reglas que en el feed dan forma a la tarjeta se aplican también aquí, donde el contexto es otro. Los dos
 * fallos que vigila este fichero son exactamente eso, y los dos se vieron en producción:
 *
 *  1. EL SANGRADO DEL AVATAR. En el feed la foto cuelga FUERA de la burbuja y la tarjeta se sangra 3,2 rem para
 *     dejarle hueco. Aquí no hay foto, pero el sangrado se aplicaba igual: en una rejilla cada tarjeta ocupa el
 *     ancho de su columna, así que las cuatro salían corridas y la última se iba fuera del contenedor por el
 *     lado derecho. Ahora el hueco lo pide el avatar (`:has()`), no la clase de la tarjeta.
 *  2. EL TÍTULO ESTIRADO. `.hub-review-game` se estira a todo el ancho de su cabecera, y varios temas lo visten
 *     con el traje de su chip de juego (pegatina cian en «Inserte moneda», cartel de pergamino en «Plata y
 *     acero»): estirado, ese chip deja de leerse como un nombre y es una barra de color de lado a lado.
 *
 * Se recorren dos paletas a propósito: una que VISTE el título como chip y la de por defecto, que no. Es la
 * diferencia entre comprobar la regla y comprobar solo un tema.
 */

async function abrirUnaResenaConSugerencias(page: Page) {
  await page.goto('/stats');
  await page.getByRole('button', { name: /^Leer tu reseña de/ }).first().click();
  await expect(page.locator('.hub-related-list')).toBeVisible();
  // La rejilla necesita más de una columna para que el fallo del sangrado tenga dónde verse.
  await expect(page.locator('.hub-related-list > *')).not.toHaveCount(1);
}

for (const palette of ['arcade', 'forja'] as const) {
  test(`las tarjetas sugeridas caben en su contenedor · paleta ${palette}`, async ({ page }) => {
    await sembrarBiblioteca(page, { amplia: true, palette });
    await abrirUnaResenaConSugerencias(page);

    const desborde = await page.evaluate(() => {
      const lista = document.querySelector('.hub-related-list') as HTMLElement;
      const limite = lista.getBoundingClientRect().right;
      return [...lista.children]
        .map((c, i) => ({ i, sobra: Math.round(c.getBoundingClientRect().right - limite) }))
        .filter(({ sobra }) => sobra > 1);
    });
    expect(desborde, 'hay tarjetas que se salen del bloque por la derecha').toEqual([]);
  });

  test(`el título sugerido mide lo que su nombre, no toda la tarjeta · paleta ${palette}`, async ({ page }) => {
    await sembrarBiblioteca(page, { amplia: true, palette });
    await abrirUnaResenaConSugerencias(page);

    // Se compara la CAJA del título con el texto que contiene (medido con un Range, que da la tinta real): si la
    // etiqueta se estira, la diferencia es el hueco de media tarjeta; si se ajusta, es su propio relleno.
    const holgura = await page.evaluate(() => {
      const rango = document.createRange();
      return [...document.querySelectorAll('.hub-related-list .hub-review-game')].map((titulo) => {
        rango.selectNodeContents(titulo);
        const texto = rango.getBoundingClientRect().width;
        return Math.round(titulo.getBoundingClientRect().width - texto);
      });
    });
    // 40 px cubre de sobra el relleno del chip más ancho de los ocho temas (.6rem por lado y su filete).
    expect(Math.max(...holgura), `la etiqueta del título sobra por los lados (${holgura.join(', ')} px)`).toBeLessThan(40);
  });
}
