import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * La guía de primeros pasos sobre el BUILD: que sale a quien llega sin nada, que convive con el aviso de
 * analítica, que sigue a la acción de verdad (también tras recargar, como a la vuelta de GitHub) y, sobre todo,
 * que a quien ya usaba la aplicación no le cambia nada: ni se pinta ni se descarga su chunk.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('guía de primeros pasos', () => {
  test('primera visita: bienvenida junto al aviso de analítica, y la misión se cumple haciéndola', async ({ page }) => {
    await page.goto('/completados');

    const welcome = page.getByRole('dialog', { name: '¡Pulsa Start!' });
    await expect(welcome).toBeVisible();
    // El aviso de analítica queda POR ENCIMA de la guía y se puede decidir con ella delante.
    const consent = page.locator('.consent-banner');
    await expect(consent).toBeVisible();
    const { violations: welcomeViolations } = await new AxeBuilder({ page }).include('.ob-card').withTags(WCAG).analyze();
    expect(welcomeViolations.map((violation) => violation.id)).toEqual([]);
    await page.getByRole('button', { name: 'Rechazar' }).click();
    await expect(consent).toBeHidden();

    await welcome.getByRole('button', { name: 'Empezar' }).click();
    const lists = page.getByRole('dialog', { name: 'Tus cinco listas' });
    await expect(lists).toBeVisible();
    await expect(page.locator('.ob-ring')).toBeVisible();
    await lists.getByRole('button', { name: 'Siguiente' }).click();

    const add = page.getByRole('dialog', { name: 'Añade tu primer juego' });
    await expect(add).toBeVisible();
    const { violations: bubbleViolations } = await new AxeBuilder({ page }).include('.ob-bubble').withTags(WCAG).analyze();
    expect(bubbleViolations.map((violation) => violation.id)).toEqual([]);

    // El velo no bloquea: el «+» se pulsa a través de él. Con el formulario abierto la guía se aparta.
    await page.locator('.fab').click();
    await expect(page.locator('dialog.modal-dialog[open]')).toBeVisible();
    await expect(add).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(add).toBeVisible();

    // El juego llega y la página se recarga (es lo que pasa a la vuelta de autorizar en GitHub): se celebra igual.
    await page.evaluate(() => {
      const now = Date.now();
      localStorage.setItem('mis-listas-v12-unified', JSON.stringify({
        c: [{ id: 1, name: 'Hollow Knight', grade: 96, score: 5, _ts: now, listedAt: now, steamDeck: false, replayable: false, retry: false, reasons: [], enteredAt: { c: now } }],
        v: [], p: [], e: [], deleted: [], updatedAt: now, schemaVersion: 1,
      }));
    });
    await page.reload();
    await expect(page.getByRole('dialog', { name: '¡Empieza la partida!' })).toBeVisible();
  });

  test('quien ya tenía listas no ve la guía ni descarga su chunk', async ({ page }) => {
    const pedidos: string[] = [];
    page.on('request', (request) => pedidos.push(request.url()));
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    await expect(page.locator('.main-row, .grid-row').first()).toBeVisible();
    // Más que el idle en el que se decide.
    await page.waitForTimeout(1500);
    await expect(page.locator('.ob-root')).toHaveCount(0);
    expect(pedidos.filter((url) => url.includes('OnboardingTour'))).toEqual([]);
  });

  test('la nube es un botón: tarjeta sencilla, sin tokens a la vista, y la guía la señala entera', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.addInitScript(() => {
      localStorage.setItem('mis-listas-onboarding', JSON.stringify({
        v: 1, status: 'active', mission: 'cloud', step: 0, completed: ['first-game'], skipped: [],
      }));
    });
    await page.goto('/ajustes/datos');

    const card = page.locator('[data-tour="sync-card"]');
    await expect(card.getByRole('button', { name: 'Conectar con GitHub' })).toBeVisible();
    await expect(card.getByText('sin tener que crear ningún token.')).toBeVisible();
    await expect(card.getByLabel('Token *')).toHaveCount(0);

    const bubble = page.getByRole('dialog', { name: 'Guarda la partida' });
    await expect(bubble).toBeVisible();
    // El hueco abarca la tarjeta: sus ventajas quedan a la vista junto al botón.
    const ring = await page.locator('.ob-ring').boundingBox();
    const box = await card.boundingBox();
    expect(ring && box && ring.height >= box.height).toBe(true);
    const { violations } = await new AxeBuilder({ page }).include('[data-tour="sync-card"]').include('.ob-bubble').withTags(WCAG).analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);

    // La conexión manual sigue ahí para quien la busca.
    await card.getByRole('button', { name: 'Conectar a mano, con token e ID del gist' }).click();
    await expect(card.getByLabel('Token *')).toBeVisible();
  });

  test('en una pantalla baja, con el aviso de analítica delante, los botones de la bienvenida se ven', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/completados');
    const welcome = page.getByRole('dialog', { name: '¡Pulsa Start!' });
    await expect(welcome).toBeVisible();
    await expect(page.locator('.consent-banner')).toBeVisible();
    // Las misiones no caben y se desplazan, pero el pie no se va con ellas.
    await expect(welcome.getByRole('button', { name: 'Empezar' })).toBeInViewport({ ratio: 1 });
    await expect(welcome.getByRole('button', { name: 'Ahora no' })).toBeInViewport({ ratio: 1 });

    // Con el menú de Ajustes abierto la tarjeta se aparta, como el aviso.
    await page.locator('[data-tour="nav-settings"]').click();
    await expect(welcome).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(welcome).toBeVisible();
  });

  test('«Ahora no» la pliega en el botón de la izquierda, que sobrevive a recargar', async ({ page }) => {
    await page.goto('/completados');
    await page.getByRole('button', { name: 'Rechazar' }).click();
    await page.getByRole('dialog', { name: '¡Pulsa Start!' }).getByRole('button', { name: 'Ahora no' }).click();

    const pill = page.locator('.ach-toast-stack .ob-pill');
    await expect(pill).toBeVisible();
    await page.reload();
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(page.getByRole('dialog', { name: 'Tus misiones' })).toBeVisible();
  });

  test('a quien ya usaba la app se le ofrece lo social en Social, y «No, gracias» no vuelve', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto('/social');
    const hint = page.getByRole('dialog', { name: '¿Quieres entrar en la parte social?' });
    await expect(hint).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include('.ob-bubble').withTags(WCAG).analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);
    await hint.getByRole('button', { name: 'No, gracias' }).click();
    await expect(hint).toBeHidden();

    await page.reload();
    await expect(page.locator('.hub-gateway-stage').first()).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog', { name: '¿Quieres entrar en la parte social?' })).toHaveCount(0);
  });

  test('sin sincronización, en Ajustes › Datos se ofrece la nube y lleva a su tarjeta', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto('/ajustes/datos');
    const hint = page.getByRole('dialog', { name: '¿Quieres guardar tus listas en la nube?' });
    await expect(hint).toBeVisible();
    await hint.getByRole('button', { name: 'Sí, vamos' }).click();
    await expect(page.getByRole('dialog', { name: 'Guarda la partida' })).toBeVisible();
  });

  test('quien tiene espacio social pero perdió la sesión ve «vuelve a entrar», nunca «crea tu espacio»', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.addInitScript(() => {
      localStorage.setItem('mis-listas-social-gist-config', JSON.stringify({ gistId: 'a1b2c3d4e5f6', etag: null, lastRemoteUpdatedAt: 0 }));
    });
    await page.goto('/social');
    const relogin = page.getByRole('dialog', { name: 'Vuelve a entrar' });
    await expect(relogin).toBeVisible();
    await expect(relogin).toContainText('siguen ahí');
    await expect(page.getByRole('dialog', { name: '¿Quieres entrar en la parte social?' })).toHaveCount(0);
    // No es una guía: no deja nada guardado.
    expect(await page.evaluate(() => localStorage.getItem('mis-listas-onboarding'))).toBeNull();
  });

  for (const [nombre, viewport] of [['móvil', { width: 390, height: 844 }], ['escritorio', { width: 1512, height: 900 }]] as const) {
    test(`en ${nombre}, la burbuja de la nube no tapa «Conectar con GitHub»`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await sembrarBiblioteca(page);
      await page.addInitScript(() => {
        localStorage.setItem('mis-listas-onboarding', JSON.stringify({
          v: 1, status: 'active', mission: 'cloud', step: 0, completed: ['first-game'], skipped: [], declined: [], single: false,
        }));
      });
      await page.goto('/ajustes/datos');
      await expect(page.getByRole('dialog', { name: 'Guarda la partida' })).toBeVisible();
      await page.waitForTimeout(800);

      const boton = page.locator('[data-tour="sync-connect"]');
      const caja = await boton.boundingBox();
      expect(caja).not.toBeNull();
      // En el centro del botón está el botón (o lo que lleva dentro), no la burbuja.
      const encima = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest('[data-tour="sync-connect"]') ? 'botón' : el?.closest('.ob-bubble') ? 'burbuja' : el?.className ?? 'nada';
      }, { x: caja!.x + caja!.width / 2, y: caja!.y + caja!.height / 2 });
      expect(encima).toBe('botón');
      const burbuja = await page.locator('.ob-bubble').boundingBox();
      const solapa = burbuja && caja
        && burbuja.x < caja.x + caja.width && caja.x < burbuja.x + burbuja.width
        && burbuja.y < caja.y + caja.height && caja.y < burbuja.y + burbuja.height;
      expect(solapa, 'la burbuja no debería solaparse con el botón').toBe(false);

      // Ni con las ventajas de la tarjeta: la burbuja dice «lo que ganas lo tienes en la tarjeta».
      const ventajas = await page.locator('.sync-perks li').evaluateAll((items) => items.map((item) => {
        const r = item.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + 40, r.top + r.height / 2);
        return Boolean(el?.closest('.ob-bubble'));
      }));
      expect(ventajas, 'ninguna ventaja debería quedar bajo la burbuja').toEqual(ventajas.map(() => false));
    });
  }

  test('con GitHub ya conectado no se ofrece la nube ni sale su paso: la misión se da por hecha', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.addInitScript(() => {
      localStorage.setItem('mis-listas-gist-config', JSON.stringify({
        gistId: 'f6e5d4c3b2a1', token: 'ghp_ejemploDeTokenDeMaqueta0000000000000', etag: null, lastRemoteUpdatedAt: 0,
      }));
    });
    await page.route('https://api.github.com/**', (route) => route.abort());
    await page.goto('/ajustes/datos');
    await expect(page.locator('[data-tour="sync-card"]')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog', { name: '¿Quieres guardar tus listas en la nube?' })).toHaveCount(0);
    await expect(page.locator('[data-tour="sync-connect"]')).toHaveCount(0);

    // Y quien llega con la misión de la nube en marcha la ve cumplida sin que salga nada.
    await page.evaluate(() => {
      localStorage.setItem('mis-listas-onboarding', JSON.stringify({
        v: 1, status: 'active', mission: 'cloud', step: 0, completed: ['first-game'], skipped: [], declined: [], single: true,
      }));
    });
    await page.reload();
    await expect(page.locator('[data-tour="sync-card"]')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog', { name: 'Guarda la partida' })).toHaveCount(0);
    const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem('mis-listas-onboarding') || 'null'));
    expect(guardado).toMatchObject({ status: 'done', completed: ['first-game', 'cloud'] });
  });
});
