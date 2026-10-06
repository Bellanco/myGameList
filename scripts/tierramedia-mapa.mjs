/**
 * Genera `src/styles/themes/tierramedia/mapa.svg`, el mapa a pluma del fondo de «Oro y hoja» (§3 de `tierramedia.scss`).
 *
 * ES UN SCRIPT DE MANTENIMIENTO, como `vendor-fonts.mjs`: se ejecuta a mano (`node scripts/tierramedia-mapa.mjs`) y su
 * resultado se commitea. La cuenta es fija —sin azar—, así que volver a ejecutarlo da el mismo fichero.
 *
 * EL SVG ES UNA MÁSCARA, NO UN DIBUJO: trazos blancos cuya opacidad dice cuánto pesa cada pieza. El color lo pone
 * la capa de `tierramedia.scss` con un degradado de las fichas del tema, y por eso un solo fichero vale para oscuro y
 * para claro.
 *
 * LAS PIEZAS son las de un mapa dibujado a mano —cordilleras de picos sombreados por un lado, ríos que serpentean,
 * bosques de copas apiñadas y una costa con sus líneas de agua— y van pegadas a los MÁRGENES: los paneles tapan el
 * centro, así que lo que no está en un borde no se ve.
 */
import { writeFileSync } from 'node:fs';

const W = 1512;
const H = 945;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(1954);
const r = (a, b) => a + R() * (b - a);
const n = (v) => Math.round(v);

/** Una polilínea en coordenadas relativas: enteros pequeños, un tercio del peso. */
function linea(puntos) {
  let d = `M${n(puntos[0][0])} ${n(puntos[0][1])}`;
  for (let i = 1; i < puntos.length; i++) {
    const dx = n(puntos[i][0]) - n(puntos[i - 1][0]);
    const dy = n(puntos[i][1]) - n(puntos[i - 1][1]);
    if (dx || dy) d += `l${dx} ${dy}`;
  }
  return d;
}

/** Interpola una polilínea de control en pasos de `paso` px, con un vaivén lateral suave. */
function recorrido(control, paso, vaiven = 0, ondas = 3) {
  const out = [];
  for (let s = 0; s < control.length - 1; s++) {
    const [ax, ay] = control[s];
    const [bx, by] = control[s + 1];
    const largo = Math.hypot(bx - ax, by - ay);
    const pasos = Math.max(1, Math.round(largo / paso));
    const nx = -(by - ay) / largo;
    const ny = (bx - ax) / largo;
    for (let i = 0; i < pasos; i++) {
      const t = i / pasos;
      const v = Math.sin(t * Math.PI * ondas + s) * vaiven * Math.sin(t * Math.PI);
      out.push([ax + (bx - ax) * t + nx * v, ay + (by - ay) * t + ny * v]);
    }
  }
  out.push(control[control.length - 1]);
  return out;
}

/* Los trazos se agrupan por peso y grosor en un solo `<path>` cada grupo: mil trazos sueltos eran 57 kB, y
   juntos el fichero baja a un tercio sin cambiar ni un píxel. El peso se redondea a pasos de 0,05 para eso. */
const grupos = new Map();
let total = 0;
const trazo = (d, peso, ancho = 0.8) => {
  const clave = `${(Math.round(peso * 20) / 20).toFixed(2)}|${ancho}`;
  grupos.set(clave, (grupos.get(clave) ?? '') + d);
  total++;
};

/* ── CORDILLERAS: picos en fila, de atrás adelante, con el flanco derecho sombreado a rayas. ── */
function cordillera(control, picos, alto, peso) {
  const camino = recorrido(control, 4);
  for (let i = 0; i < picos; i++) {
    const [x, y] = camino[Math.round((i / (picos - 1)) * (camino.length - 1))];
    const h = alto * r(0.7, 1.15);
    const w = h * r(0.62, 0.78);
    const cima = [x + r(-2, 2), y - h];
    trazo(linea([[x - w, y], cima, [x + w, y]]), peso, 1);
    /* Sombra: rayas que bajan desde el flanco derecho, más cortas hacia el pie. */
    for (let k = 1; k <= 3; k++) {
      const t = k / 4.2;
      const px = cima[0] + (x + w - cima[0]) * t;
      const py = cima[1] + (y - cima[1]) * t;
      trazo(linea([[px, py], [px - w * 0.18, py + h * 0.38 * (1 - t)]]), peso * 0.7);
    }
  }
}

/* ── BOSQUES: copas en arco, apiñadas en filas desplazadas, con un tronco corto. ── */
function bosque(cx, cy, rx, ry, copa, peso) {
  for (let y = cy - ry; y <= cy + ry; y += copa * 1.5) {
    const fila = Math.round((y - (cy - ry)) / (copa * 1.5));
    for (let x = cx - rx + (fila % 2) * copa; x <= cx + rx; x += copa * 2.1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1 - r(0, 0.25)) continue;
      const c = copa * r(0.8, 1.1);
      const bx = x + r(-2, 2);
      const by = y + r(-2, 2);
      trazo(`M${n(bx - c)} ${n(by)}a${n(c)} ${n(c)} 0 0 1 ${n(2 * c)} 0`, peso);
      trazo(`M${n(bx)} ${n(by)}l0 ${n(c * 0.6)}`, peso * 0.7);
    }
  }
}

/* ── RÍOS: un hilo que serpentea, con un afluente. ── */
function rio(control, peso, vaiven = 9) {
  trazo(linea(recorrido(control, 6, vaiven, 4)), peso, 1);
}

/* ── COSTA: la orilla y, mar adentro, sus líneas de agua cada vez más tenues. ── */
function costa(control, lineas, separacion, peso) {
  const orilla = recorrido(control, 6, 10, 5);
  trazo(linea(orilla), peso, 1.2);
  for (let k = 1; k <= lineas; k++) {
    const desplazada = orilla.map(([x, y], i) => {
      const [ax, ay] = orilla[Math.max(0, i - 1)];
      const [bx, by] = orilla[Math.min(orilla.length - 1, i + 1)];
      const l = Math.hypot(bx - ax, by - ay) || 1;
      /* La normal hacia el mar (a la derecha del sentido de la orilla). */
      return [x - ((by - ay) / l) * separacion * k, y + ((bx - ax) / l) * separacion * k];
    });
    trazo(linea(desplazada), peso * (1 - k / (lineas + 1.5)));
  }
}

// Derecha: la gran cordillera bajando por el margen, su río hasta la costa y el mar abajo a la derecha.
cordillera([[1210, 70], [1300, 170], [1390, 250], [1500, 300]], 15, 34, 0.95);
cordillera([[1400, 520], [1470, 470]], 4, 22, 0.7);
rio([[1290, 205], [1240, 330], [1300, 450], [1260, 560], [1330, 690]], 0.85);
rio([[1420, 300], [1370, 400], [1300, 450]], 0.6, 6);
costa([[W + 10, 590], [1440, 640], [1360, 700], [1330, 790], [1250, 870], [1215, H + 10]], 6, 9, 0.9);
bosque(1440, 400, 60, 55, 7, 0.65);

// Izquierda: otra cordillera arriba, un río que baja por el margen y un bosque grande abajo.
cordillera([[30, 200], [140, 140], [270, 120], [360, 160]], 11, 30, 0.85);
rio([[200, 160], [150, 300], [210, 430], [140, 560], [190, 700], [120, H + 10]], 0.75);
bosque(150, 790, 150, 110, 7, 0.6);
bosque(60, 430, 55, 70, 6, 0.5);

const piezas = [...grupos].map(([clave, d]) => {
  const [peso, ancho] = clave.split('|');
  return `<path d="${d}" stroke-opacity="${+peso}"${+ancho === 0.8 ? '' : ` stroke-width="${ancho}"`}/>`;
});
const svg =
  /* `vector-effect` no se hereda, así que va por hoja de estilo: el trazo se queda en su grosor aunque la capa se
     estire hasta los 3840 px de una pantalla grande. */
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
  `<style>path{vector-effect:non-scaling-stroke}</style>` +
  `<g fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round">${piezas.join('')}</g></svg>\n`;
writeFileSync(new URL('../src/styles/themes/tierramedia/mapa.svg', import.meta.url), svg);
console.log(`mapa.svg: ${total} trazos en ${piezas.length} grupos, ${svg.length} bytes`);
