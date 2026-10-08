// `public/_redirects` y la tabla de rutas son PARES: cada dirección de la app tiene que reescribirse al shell, y
// ninguna regla puede tapar los ficheros del build.
//
// POR QUÉ HAY PAR. Desde que existe `404.html` (plugin `notFoundShell` de `vite.config.ts`) Pages ya no está en
// modo SPA: lo que no case con una regla da 404. Una ruta nueva olvidada aquí arrancaría la app igual —`404.html`
// es una copia del shell— pero con el estado mal, y el día que algo mire ese estado (una vista previa de enlace,
// un rastreador) fallaría sin que nada lo avisara. Y en sentido contrario, un comodín `/*` devolvería el shell
// con un 200 a los chunks de un despliegue anterior, que es el envenenamiento que todo esto evita (ver
// `docs/plan-capacidad-gratuita.md`, fase 3).
import { describe, expect, it } from 'vitest';
import { APP_ROUTES, FALLBACK_ROUTE, LEGACY_ROUTE_REDIRECTS, SHARE_TARGET_ROUTE } from '../../src/core/constants/routes';
import redirectsFile from '../../public/_redirects?raw';

interface Rule {
  from: string;
  to: string;
  status: string;
}

const rules: Rule[] = redirectsFile
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const [from, to, status] = line.split(/\s+/);
    return { from, to, status };
  });

/** Casa como Pages: `/x/*` cubre lo que cuelga de `/x/` (no `/x` a secas, comprobado con `wrangler pages dev`). */
function covers(rule: Rule, pathname: string): boolean {
  if (rule.from.endsWith('/*')) return pathname.startsWith(rule.from.slice(0, -1));
  return rule.from === pathname;
}

const isRewritten = (pathname: string): boolean => rules.some((rule) => covers(rule, pathname));

/**
 * Direcciones de ejemplo de una ruta de react-router. Un comodín casa también con su base (`/social/*` abre
 * `/social`), y un parámetro vale por cualquier valor.
 */
function samples(path: string): string[] {
  const concrete = path.replace(/:[^/]+/g, 'AAAAAAAAAAAAAAAAAAAAAA');
  if (!concrete.endsWith('/*')) return [concrete];
  const base = concrete.slice(0, -2);
  return [base, `${base}/algo/mas`];
}

describe('public/_redirects', () => {
  it('reescribe al shell con un 200, nunca a /index.html (Pages lo trata como bucle y lo descarta)', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect({ from: rule.from, to: rule.to, status: rule.status }).toEqual({ from: rule.from, to: '/', status: '200' });
    }
  });

  it('no lleva comodín global ni tapa los ficheros del build', () => {
    expect(rules.map((rule) => rule.from)).not.toContain('/*');
    for (const fichero of ['/assets/index-ABC.js', '/fonts/dm-sans-latin-0000.woff2', '/service-worker.js', '/manifest.json', '/404.html']) {
      expect(isRewritten(fichero)).toBe(false);
    }
  });

  it.each(APP_ROUTES.map((route) => route.path))('cubre la ruta %s', (path) => {
    for (const pathname of samples(path)) {
      expect(isRewritten(pathname), pathname).toBe(true);
    }
  });

  it.each(LEGACY_ROUTE_REDIRECTS.map((route) => route.from))('cubre el nombre retirado %s', (path) => {
    for (const pathname of samples(path)) {
      expect(isRewritten(pathname), pathname).toBe(true);
    }
  });

  it('cubre la ruta a la que rebota lo desconocido', () => {
    expect(isRewritten(FALLBACK_ROUTE)).toBe(true);
  });

  // Android la abre desde el menú «Compartir», con la app cerrada: sin su línea, el arranque sería el del 404.
  it('cubre la puerta del menú «Compartir»', () => {
    expect(isRewritten(SHARE_TARGET_ROUTE)).toBe(true);
  });
});
