import { useEffect, useRef } from 'react';
import { MOMENT_EVENT, type MomentDetail } from '../../core/effects/moments';
import { DEFAULT_PALETTE } from '../../core/constants/palettes';
import { recorte } from '../components/socialhub/recortes';
import { gameScenesPreference } from './preferences';

/**
 * Efectos de FIRMA disparados por interacción (los ambientales/hover viven en CSS bajo `data-effects="on"`).
 * Cada uno solo actúa con su paleta activa, con la preferencia de efectos encendida (`data-effects="on"`) y
 * respetando `prefers-reduced-motion` — misma política que `useShootingStars`. Todo es DOM efímero: el elemento
 * se inyecta, anima una vez y se autodestruye; nunca bloquea el puntero.
 *
 *  - Ladrones de corazones (persona): RÁFAGA de líneas de acción al pulsar un botón primario.
 *  - Cámara de pruebas (portal): APERTURA DE PORTAL (anillo azul→naranja) desde el punto del clic en un botón.
 *  - Sol y luna (seaofstars): astro SOL↔LUNA que cruza al alternar claro/oscuro.
 *  - Solo hay guerra (grimdark): BOOT-UP de fósforo (destello verde) al activar la paleta (encender el cogitador).
 *  - Inserte moneda (arcade): GAME CLEAR al cerrar un juego (abajo, en los momentos).
 *
 * Y LOS QUE RESPONDEN A LO QUE PASA EN LA APLICACIÓN, no a lo que pasa en el DOM (ver `core/effects/moments`):
 *  - CERRAR UN JUEGO → el Anillo que gira y se tumba sobre «Juego terminado» (No puedes pasar); la franja de
 *    «contrato cerrado» con las coronas de la recompensa saltando (Plata y acero); «objetivo cumplido» en letras
 *    recortadas estampado sobre una franja negra (Ladrones de corazones); la pantalla de récord (Inserte moneda); la
 *    terminal de GLaDOS (Cámara de pruebas); el protocolo de brecha (Sin futuro); la ventana de «¡Victoria!» (Sol y
 *    luna), y el sello de pureza con sus tiras de pergamino (Solo hay guerra). Elegidos con la maqueta de los Game Clear
 *    (10-10-2026); Ladrones y Solo hay guerra eran un sello común hasta el 12-10-2026.
 *  - EMPEZAR UN JUEGO (pasa a En curso) → la puerta redonda de Bolsón Cerrado (No puedes pasar); el atardecer synthwave
 *    con «STAGE 1» (Inserte moneda); la franja de «nuevo contrato» con el cartel de la tabla (Plata y acero); la
 *    transición de día del calendario con la fecha de hoy (Ladrones de corazones); el cartel de la cámara que baja
 *    del techo (Cámara de pruebas); el escáner óptico (Sin futuro); el cartel de zona «Nueva aventura» (Sol y luna), y la
 *    transmisión astropática con la calavera alada (Solo hay guerra). El atardecer y el cartel se sorteaban con los de
 *    cerrar hasta el 12-10-2026; los demás se eligieron ese día con la maqueta de propuestas (la puerta redonda
 *    sustituyó esa misma tarde a las Puertas de Durin, que se leían a dibujo generado).
 *  Las escenas de empezar y cerrar van ADEMÁS detrás de su propia casilla de Diseño, apagada por defecto
 *  (`gameScenesPreference`).
 *  - GUARDAR → la luz corre por el filete de acero bajo las pestañas, de izquierda a derecha (Plata y acero).
 *  - FILTRAR → barrido de escáner sobre la lista (Sin futuro).
 *  - LOGRO DESBLOQUEADO → estrella fugaz que cruza (Sol y luna).
 */
export function useSignatureEffects(): void {
  // Helpers compartidos (leídos en tiempo de evento para respetar el estado vivo del <html>).
  const fxRef = useRef<(palette: string) => boolean>(() => false);
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    fxRef.current = (palette: string): boolean =>
      !reduce.matches &&
      root.getAttribute('data-effects') === 'on' &&
      // El respaldo es la paleta POR DEFECTO, no una cualquiera: el atributo lo escriben el anti-flash de
      // `index.html` y `preferences.ts`, así que solo falta si a alguien se le va la mano con el `<html>`. Aquí
      // decía `'steam'`, de cuando esa era la de por defecto y además no escribía atributo: con el cambio a
      // «No puedes pasar» eso habría dado los efectos de otro tema a quien no ha elegido ninguno.
      (root.getAttribute('data-palette') ?? DEFAULT_PALETTE) === palette;
  }, []);

  /**
   * `ms` es lo que dura la animación de la pieza: las escenas de cerrar un juego pasan de los dos segundos, y con la
   * red de seguridad fija se cortaban a media frase.
   */
  const spawn = (el: HTMLElement, ms = 1600): void => {
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    const clean = (): void => el.remove();
    // Solo cuenta el final de la PIEZA, no el de sus hijos: en una escena con varias partes (la terminal que teclea
    // línea a línea, la matriz que se ilumina celda a celda), el `animationend` de la primera subía hasta aquí y se
    // llevaba la escena entera por delante. Y lo mismo con sus `::before`/`::after`: el evento de un pseudoelemento
    // llega con la pieza como `target` (y `pseudoElement` relleno), así que el velo de 0,25 s del calendario de los
    // Ladrones borraba la escena nada más empezar.
    const onEnd = (e: AnimationEvent): void => {
      if (e.target !== el || e.pseudoElement) return;
      el.removeEventListener('animationend', onEnd);
      clean();
    };
    el.addEventListener('animationend', onEnd);
    // Red de seguridad: si por lo que sea no dispara `animationend`, lo retiramos igualmente.
    window.setTimeout(clean, ms + 400);
  };

  // ── Clic en botón: apertura de portal (portal) / ráfaga de líneas (persona). ──
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;

      if (fxRef.current('portal')) {
        const btn = target.closest('.btn:not(.btn-icon), .fab');
        if (btn) {
          const ring = document.createElement('span');
          ring.className = 'fx-portal-ring';
          ring.style.left = `${e.clientX}px`;
          ring.style.top = `${e.clientY}px`;
          spawn(ring);
        }
        return;
      }

      if (fxRef.current('persona')) {
        const btn = target.closest<HTMLElement>('.btn-steam, .btn.is-active, .btn-toggle.active');
        if (btn) {
          const r = btn.getBoundingClientRect();
          const burst = document.createElement('span');
          burst.className = 'fx-p5-burst';
          burst.style.left = `${r.left + r.width / 2}px`;
          burst.style.top = `${r.top + r.height / 2}px`;
          spawn(burst);
        }
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // ── Sol↔luna al alternar tema (seaofstars) y boot-up al activar grimdark. ──
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.attributeName === 'data-theme' && fxRef.current('seaofstars')) {
          const day = root.getAttribute('data-theme') === 'light';
          const orb = document.createElement('span');
          orb.className = `fx-sos-orb ${day ? 'is-sun' : 'is-moon'}`;
          spawn(orb);
        }
        if (m.attributeName === 'data-palette' && fxRef.current('grimdark')) {
          const boot = document.createElement('div');
          boot.className = 'fx-grim-boot';
          spawn(boot);
        }
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
    return () => obs.disconnect();
  }, []);

  // ── Los momentos de la aplicación (`core/effects/moments`). ──
  useEffect(() => {
    /**
     * Una capa efímera que se COLOCA SOBRE UNA PIEZA de la pantalla (la barra de pestañas, la lista) en vez de
     * ocupar la ventana entera: un barrido a pantalla completa se lee como un fallo del monitor, y sobre la
     * pieza que acaba de cambiar se lee como respuesta. Si esa pieza no está, el efecto no se pinta: no hay
     * nada que señalar.
     */
    const over = (clase: string, selector: string): HTMLElement | null => {
      const anchor = document.querySelector(selector);
      if (!anchor) return null;
      const r = anchor.getBoundingClientRect();
      if (r.width < 40 || r.height < 8) return null;
      const el = document.createElement('span');
      el.className = clase;
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
      return el;
    };

    const simple = (clase: string): HTMLElement => {
      const el = document.createElement('span');
      el.className = clase;
      return el;
    };

    /** Una escena: marcado FIJO (nada del usuario entra aquí), y su cara la pone el skin del tema. */
    const escena = (clase: string, html: string): HTMLElement => {
      const el = document.createElement('div');
      el.className = clase;
      el.innerHTML = html;
      return el;
    };

    /** El rótulo del sello de los Ladrones, en las letras recortadas del título de pantalla. */
    const letrasRecortadas = (texto: string): HTMLElement => {
      const letras = document.createElement('span');
      letras.className = 'rc-letters';
      let i = 0;
      for (const palabra of texto.split(' ')) {
        const word = document.createElement('span');
        word.className = 'rc-word';
        for (const letra of palabra) {
          const { clase, transform, fontSize } = recorte(i++);
          const rc = document.createElement('span');
          rc.className = clase;
          rc.style.transform = transform;
          rc.style.fontSize = fontSize;
          rc.textContent = letra;
          word.appendChild(rc);
        }
        letras.appendChild(word);
      }
      return letras;
    };

    /**
     * No puedes pasar, al cerrar: el Anillo cae, gira sobre el canto cada vez más despacio, como una moneda, y se
     * tumba con un último cabeceo; oro plano con un filo de luz, dibujado como la puerta redonda de empezar. Encima,
     * Gandalf: «Todo lo que tenemos que decidir es qué hacer con el tiempo que se nos ha dado». Debajo, «Juego
     * Terminado» con letra de título de las películas, la rúbrica y la luz que lo recorre.
     */
    const elAnillo = (): HTMLElement =>
      escena(
        'fx-tm-fin',
        '<span class="fx-tm-dicho">«Todo lo que tenemos que decidir es qué hacer con el tiempo que se nos ha dado»</span>' +
          '<svg class="fx-tm-anillo" viewBox="-60 -50 120 90" aria-hidden="true"><g class="fx-tm-anillo-cae"><g class="fx-tm-anillo-gira">' +
          '<path class="fx-tm-oro" fill-rule="evenodd" d="M-30 0 A30 30 0 1 0 30 0 A30 30 0 1 0 -30 0 Z M-22 0 A22 22 0 1 1 22 0 A22 22 0 1 1 -22 0 Z"/>' +
          '<path class="fx-tm-oro-luz" d="M-25 -9 A27 27 0 0 1 9 -26"/></g></g></svg>' +
          '<b><span class="fx-tm-cap">J</span>uego <span class="fx-tm-cap">T</span>erminado</b><svg class="fx-tm-fin-raya" viewBox="0 0 300 14" aria-hidden="true">' +
          '<path d="M6 7 H128 M172 7 H294"/><path class="fx-tm-fin-hoja" d="M150 1 Q160 7 150 13 Q140 7 150 1 Z"/></svg>',
      );

    /**
     * Plata y acero: la franja de The Witcher 3 al cerrar una misión, con la recompensa en coronas. La moneda va UNA
     * vez en un `<symbol>` y las demás la citan; el vuelo de cada una se sortea aquí y la hoja lo hace parábola.
     */
    const MONEDA_DEFS =
      '<svg class="fx-wt-defs" aria-hidden="true"><defs>' +
      '<radialGradient id="fx-wt-oro" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="#fff6d2"/><stop offset=".3" stop-color="#f3cd68"/>' +
      '<stop offset=".68" stop-color="#c3922e"/><stop offset="1" stop-color="#7a5410"/></radialGradient>' +
      '<linearGradient id="fx-wt-relieve" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/>' +
      '<stop offset=".55" stop-color="#e2b54e"/><stop offset="1" stop-color="#a77a22"/></linearGradient>' +
      // El canto moleteado, la corona de cinco puntas en relieve (sombra debajo, luz encima), las gemas y el brillo.
      '<symbol id="fx-wt-moneda" viewBox="0 0 32 32">' +
      '<circle cx="16" cy="16" r="15.2" fill="#6a480c"/><circle cx="16" cy="16" r="14.4" fill="url(#fx-wt-oro)"/>' +
      '<circle cx="16" cy="16" r="13.3" fill="none" stroke="#8a6118" stroke-width="1.3" stroke-dasharray=".9 1.1" opacity=".85"/>' +
      '<circle cx="16" cy="16" r="11.4" fill="none" stroke="#fff1bf" stroke-opacity=".55" stroke-width=".8"/>' +
      '<circle cx="16" cy="16.4" r="11" fill="none" stroke="#7d570f" stroke-width=".7"/>' +
      '<g transform="translate(0 .7)" fill="#5e3f0a" opacity=".8"><path id="fx-wt-forma" d="M8.8 20.4 L7.4 12.6 L10.4 16.2 L11.9 11.2 ' +
      'L14 15.8 L16 9.4 L18 15.8 L20.1 11.2 L21.6 16.2 L24.6 12.6 L23.2 20.4 Z"/><rect x="8.6" y="20.8" width="14.8" height="2.6" rx=".7"/></g>' +
      '<g fill="url(#fx-wt-relieve)"><use href="#fx-wt-forma"/><rect x="8.6" y="20.8" width="14.8" height="2.6" rx=".7"/></g>' +
      '<path d="M9.2 19.6 H22.8" stroke="#8a6118" stroke-width=".5"/>' +
      '<g fill="#fff1c0"><circle cx="7.4" cy="12.3" r=".85"/><circle cx="11.9" cy="10.9" r=".8"/><circle cx="16" cy="9" r=".95"/>' +
      '<circle cx="20.1" cy="10.9" r=".8"/><circle cx="24.6" cy="12.3" r=".85"/></g>' +
      '<circle cx="16" cy="22.1" r=".95" fill="#a3281a"/><circle cx="12" cy="22.1" r=".7" fill="#2f5a7a"/><circle cx="20" cy="22.1" r=".7" fill="#2f5a7a"/>' +
      '<ellipse cx="11.3" cy="9.2" rx="5" ry="2.2" transform="rotate(-32 11.3 9.2)" fill="#fff" opacity=".38"/>' +
      '</symbol></defs></svg>';
    const MONEDA = '<svg class="fx-wt-moneda" viewBox="0 0 32 32" aria-hidden="true"><use href="#fx-wt-moneda"/></svg>';
    const contratoCerrado = (): HTMLElement => {
      // 22 coronas, una cada 45 ms desde que asoma la cuenta: lanzadas hacia arriba y a los lados, caen fuera de la
      // franja. `--alto` es el pico (40–105 px) y `--cae` dónde acaban (365–615 px), la misma parábola en todas.
      let coronas = '';
      for (let i = 0; i < 22; i++) {
        const dx = Math.round((Math.random() * 2 - 1) * 325);
        const alto = -Math.round(40 + Math.random() * 65);
        const cae = Math.round(365 + Math.random() * 250);
        const giro = (0.3 + Math.random() * 0.3).toFixed(2);
        coronas +=
          `<i class="fx-wt-corona" style="--t:${600 + i * 45}ms;--dx:${dx}px;--alto:${alto}px;--cae:${cae}px;--g:${giro}s">` +
          `<i>${MONEDA}</i></i>`;
      }
      return escena(
        'fx-wt-mision',
        `${MONEDA_DEFS}<b>CONTRATO CERRADO</b><span class="fx-wt-cuenta">${MONEDA}<span class="fx-wt-n"></span>` +
          `<small>coronas</small>${coronas}</span>`,
      );
    };

    /** Inserte moneda: el monitor CRT que se enciende en una raya, enseña la puntuación y se apaga en un punto. */
    const pantallaDeRecord = (): HTMLElement =>
      escena(
        'fx-ar-crt',
        '<span class="fx-ar-crt-top"><span>1UP 004500</span><span>HI 050000</span></span><b>GAME CLEAR</b>' +
          '<span class="fx-ar-crt-bonus">BONUS </span><span class="fx-ar-crt-coin">INSERT COIN</span>',
      );

    /** Inserte moneda: el sol a rayas sobre la rejilla de neón, y el rótulo cromado delante. Es la pantalla de título. */
    const atardecerSynthwave = (): HTMLElement =>
      escena(
        'fx-ar-sunset',
        '<span class="fx-ar-cielo"></span><span class="fx-ar-sol"></span><span class="fx-ar-suelo"></span><b>STAGE 1</b>',
      );

    /**
     * Cámara de pruebas: el cartel que te recibe a la puerta de la cámara y baja del techo. El número se sortea, y
     * la barra de progreso «NN/19» es la de los carteles del juego.
     */
    const cartelDeCamara = (): HTMLElement => {
      const n = 1 + Math.floor(Math.random() * 19);
      const nn = String(n).padStart(2, '0');
      return escena(
        'fx-ap-sign',
        `<span class="fx-ap-num">${nn}<small>CÁMARA</small></span>` +
          '<span class="fx-ap-txt"><small>APERTURE SCIENCE</small><b>PRUEBA EN CURSO</b>' +
          `<span class="fx-ap-progreso" style="--p:${(n / 19).toFixed(3)}"><i></i><small>${nn}/19</small></span>` +
          '<span class="fx-ap-pict"><i class="on"></i><i class="on"></i><i></i><i class="on"></i><i></i></span></span>' +
          '<span class="fx-ap-luces"></span>',
      );
    };

    /** Cámara de pruebas: la terminal ámbar de los créditos, tecleando el veredicto. `--n` = caracteres. */
    const terminalGlados = (): HTMLElement =>
      escena(
        'fx-glados',
        '<p style="--n:20;--d:.15s">&gt; Prueba completada.</p>' +
          '<p style="--n:23;--d:.8s">&gt; Resultado: aceptable.</p>' +
          '<p style="--n:14;--d:1.5s">&gt; Habrá tarta.<i class="fx-glados-cur"></i></p>',
      );

    /**
     * Sin futuro: la matriz del protocolo de brecha. El camino va fila-columna-fila, como en el minijuego, y sus
     * códigos son los del búfer de la cabecera; el resto de la matriz se rellena con una cuenta fija.
     */
    const protocoloDeBrecha = (): HTMLElement => {
      const CODIGOS = ['1C', '55', 'BD', 'E9', '7A', 'FF'];
      const CAMINO = [2, 17, 19, 9, 5];
      const BUFER = ['1C', '55', 'BD', 'E9', '1C'];
      let celdas = '';
      for (let i = 0; i < 25; i++) {
        const paso = CAMINO.indexOf(i);
        celdas += paso >= 0
          ? `<i class="is-paso" style="--d:${(0.25 + paso * 0.17).toFixed(2)}s">${BUFER[paso]}</i>`
          : `<i>${CODIGOS[(i * 7 + 3) % CODIGOS.length]}</i>`;
      }
      return escena(
        'fx-cp-breach',
        `<span class="fx-cp-breach-hd">PROTOCOLO DE BRECHA<span>BÚFER ${BUFER.join(' ')}</span></span>` +
          `<span class="fx-cp-breach-m">${celdas}</span><span class="fx-cp-breach-ok">BRECHA COMPLETADA</span>`,
      );
    };

    /** Sol y luna: la ventana de fin de combate. La EXP y el oro suben solos en CSS (`@property` + `counter()`). */
    const ventanaDeVictoria = (): HTMLElement =>
      escena(
        'fx-sos-win',
        '<b>¡Victoria!</b><span class="fx-sos-win-dl"><span>EXP</span><span class="is-exp"></span>' +
          '<span>Oro</span><span class="is-oro"></span></span>' +
          '<i style="--d:.2s"></i><i style="--d:.5s"></i><i style="--d:.7s"></i><i style="--d:.35s"></i>',
      );

    /**
     * Ladrones de corazones, al cerrar: una franja negra con trama roja cruza la pantalla y encima se estampa la
     * tarjeta torcida de los Ladrones con «OBJETIVO CUMPLIDO» en letras recortadas, que saltan una a una; debajo cae
     * «TESORO ROBADO» y la tarjeta se va cortada en diagonal, la tijera del tema. El canto es un SVG porque la forma
     * no es un rectángulo (un `border` solo sabe seguirlos), y sus trazos no escalan con la caja (`vector-effect`).
     */
    const CANTO_LADRON =
      '<svg class="fx-p5-golpe-canto" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<polygon class="is-sombra" points="1,8 98,0 95,98 3,91"/>' +
      '<polygon class="is-filo" points="1,8 98,0 95,98 3,91" vector-effect="non-scaling-stroke"/>' +
      '<polygon class="is-cara" points="1,8 98,0 95,98 3,91" vector-effect="non-scaling-stroke"/></svg>';
    /** El destello de cuatro puntas de la interfaz del juego, en `left`/`top` (%) con tamaño y retardo. */
    const chispa = (x: number, y: number, s: number, d: number): string =>
      `<svg class="fx-p5-chispa" style="left:${x}%;top:${y}%;--s:${s};--d:${d}s" viewBox="-10 -10 20 20" aria-hidden="true">` +
      '<path d="M0 -10 L2 -2 L10 0 L2 2 L0 10 L-2 2 L-10 0 L-2 -2 Z"/></svg>';
    const objetivoCumplido = (): HTMLElement => {
      const el = escena(
        'fx-p5-golpe',
        '<span class="fx-p5-golpe-banda"></span>' +
          `<span class="fx-p5-golpe-corte"><span class="fx-p5-golpe-tarjeta">${CANTO_LADRON}</span></span>` +
          '<span class="fx-p5-golpe-tesoro">TESORO ROBADO</span>' +
          chispa(27, 38, 1, 0.75) + chispa(73, 60, 0.7, 0.9) + chispa(70, 35, 0.5, 1.05),
      );
      const rotulo = letrasRecortadas('OBJETIVO CUMPLIDO');
      // Cada recorte salta un poco después del anterior: el retardo va por letra y la hoja lo suma al de la escena.
      rotulo.querySelectorAll<HTMLElement>('.rc').forEach((rc, k) => rc.style.setProperty('--d', `${k * 30}ms`));
      el.querySelector('.fx-p5-golpe-tarjeta')?.appendChild(rotulo);
      return el;
    };

    /**
     * Solo hay guerra, al cerrar: el sello de pureza. El lacre rojo con el águila en relieve (la máscara
     * `seals/aquila.svg` del tema) cae y se aplasta, y de él se desenrollan tres tiras de pergamino escritas que se
     * mecen y se paran; debajo, «Deber cumplido» en gótica. El borde de la cera se derrama en ondas que salen de un
     * azar con semilla: torcido, pero siempre el mismo. Se calcula una vez.
     */
    const CERA = (() => {
      let semilla = 5;
      const azar = (): number => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
      const n = 22;
      const puntos = Array.from({ length: n }, (_, i) => {
        const a = (Math.PI * 2 * i) / n;
        const r = 50 + (azar() - 0.5) * 7 + (i % 5 === 0 ? 4 : 0);
        return [60 + Math.cos(a) * r, 60 + Math.sin(a) * r];
      });
      let d = `M${puntos[0][0].toFixed(1)} ${puntos[0][1].toFixed(1)}`;
      for (let i = 0; i < n; i++) {
        const [qx, qy] = puntos[i];
        const [px, py] = puntos[(i + 1) % n];
        d += ` Q${((qx + px) / 2 + (azar() - 0.5) * 4).toFixed(1)} ${((qy + py) / 2 + (azar() - 0.5) * 4).toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`;
      }
      return `${d}Z`;
    })();
    const selloDePureza = (): HTMLElement =>
      escena(
        'fx-grim-pureza',
        '<span class="fx-grim-pureza-pieza"><span class="fx-grim-pureza-tiras">' +
          '<i style="--g:-11deg;--h:122px;--d:.5s"></i><i style="--g:1deg;--h:158px;--d:.62s"></i><i style="--g:10deg;--h:104px;--d:.74s"></i></span>' +
          `<span class="fx-grim-pureza-cera"><svg viewBox="0 0 120 120" aria-hidden="true"><path class="is-cera" d="${CERA}"/>` +
          '<circle class="is-anillo" cx="60" cy="60" r="38"/><ellipse class="is-brillo" cx="42" cy="34" rx="13" ry="6" transform="rotate(-30 42 34)"/></svg>' +
          '<span class="fx-grim-pureza-aquila"></span></span></span><b>Deber cumplido</b>',
      );

    // ── Las escenas de EMPEZAR un juego (12-10-2026), elegidas con la maqueta de propuestas. ──

    /**
     * No puedes pasar, al empezar: la puerta redonda de Bolsón Cerrado, verde y con el tirador en el centro, en su
     * marco de piedras. Encima, Gandalf: «Busco a alguien con quien compartir una aventura». Las tablas y las juntas
     * del marco se calculan una vez.
     */
    const PUERTA_TABLAS = Array.from({ length: 10 }, (_, i) => `M${34 + i * 14} 20 V180`).join(' ');
    const PUERTA_JUNTAS = Array.from({ length: 18 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 18;
      const p = (r: number): string => `${(100 + Math.cos(a) * r).toFixed(1)} ${(100 + Math.sin(a) * r).toFixed(1)}`;
      return `M${p(80)} L${p(92)}`;
    }).join(' ');
    const puertaRedonda = (): HTMLElement =>
      escena(
        'fx-tm-puerta',
        '<span class="fx-tm-dicho">«Busco a alguien con quien compartir una aventura»</span>' +
          '<svg class="fx-tm-puerta-svg" viewBox="0 0 200 200" aria-hidden="true">' +
          '<defs><clipPath id="fx-tm-hoja-p"><circle cx="100" cy="100" r="72"/></clipPath></defs>' +
          '<circle class="fx-tm-marco" cx="100" cy="100" r="92"/><circle class="fx-tm-junta" cx="100" cy="100" r="80"/>' +
          `<path class="fx-tm-junta" d="${PUERTA_JUNTAS}"/>` +
          `<circle class="fx-tm-madera" cx="100" cy="100" r="72"/><path class="fx-tm-tablas" clip-path="url(#fx-tm-hoja-p)" d="${PUERTA_TABLAS}"/>` +
          '<circle class="fx-tm-tirador" cx="100" cy="100" r="7"/><circle class="fx-tm-tirador-luz" cx="98" cy="98" r="2.2"/></svg>' +
          '<b><span class="fx-tm-cap">C</span>omienza el <span class="fx-tm-cap">V</span>iaje</b>',
      );

    /**
     * Plata y acero, al empezar: la franja gemela de «Contrato cerrado» con el cartel de la tabla cayendo encima. El
     * cartel es un `.chip` de verdad, así que el pergamino y el lacre los pone el tema (§6); la franja solo lo agranda
     * y le pone la cera en rojo vivo.
     */
    const nuevoContrato = (): HTMLElement =>
      escena(
        'fx-wt-nuevo',
        '<span class="chip fx-wt-chip-nuevo">En curso</span><b>NUEVO CONTRATO</b><small>Se busca brujo</small>',
      );

    /** El sol del calendario de los Ladrones: el icono del tiempo que acompaña al día de la semana. */
    const SOL_P5 =
      '<svg class="fx-p5-cal-sol" viewBox="0 0 40 40" aria-hidden="true"><g fill="#ff1f3d" stroke="#0d0d0d" stroke-width="2">' +
      '<circle cx="20" cy="20" r="8"/>' +
      [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M18 3 L22 3 L20 9 Z" transform="rotate(${a} 20 20)"/>`).join('') +
      '</g></svg>';

    /**
     * Ladrones de corazones: la transición de día de Persona 5. La fecha es la de HOY al lanzarla (mes encima, número
     * grande y el día de la semana en su recuadro); el número que salta es el de ayer. Remata en letras recortadas.
     */
    const calendario = (): HTMLElement => {
      const hoy = new Date();
      const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
      // «lun», «mié», «sáb»… en mayúsculas y sin el punto de abreviatura que algunos motores añaden.
      const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(hoy).replace('.', '').toLocaleUpperCase('es-ES');
      const el = escena(
        'fx-p5-cal',
        '<span class="fx-p5-cal-franja"></span>' +
          `<span class="fx-p5-cal-bloque"><span class="fx-p5-cal-mes">${hoy.getMonth() + 1}/</span>` +
          `<span class="fx-p5-cal-num"><span class="is-ayer">${ayer.getDate()}</span><span class="is-hoy">${hoy.getDate()}</span></span>` +
          `<span class="fx-p5-cal-lado"><span class="fx-p5-cal-dia"><span>${dia}</span></span>${SOL_P5}</span></span>` +
          '<span class="fx-p5-cal-hoy"></span>',
      );
      const rotulo = letrasRecortadas('HOY EMPIEZA');
      // Cada recorte cae un poco después del anterior: el retardo va por letra y la hoja lo suma al de la escena.
      rotulo.querySelectorAll<HTMLElement>('.rc').forEach((rc, k) => rc.style.setProperty('--d', `${k * 35}ms`));
      el.querySelector('.fx-p5-cal-hoy')?.appendChild(rotulo);
      return el;
    };

    /**
     * Solo hay guerra: la calavera alada del cogitador, en píxeles. `#` es hueso y `o` la lente roja del servocráneo;
     * cada racha de una fila se vuelve un rectángulo, así que sale un `path` por color, nítido con `crispEdges`.
     */
    const CALAVERA = [
      '.............#####.............',
      '...........#########...........',
      '...######.###########.######...',
      '###############################',
      '.....######...###...######.....',
      '.##########.o.###.o.##########.',
      '......######.##.##.######......',
      '...###########...###########...',
      '........#..#########..#........',
      '.....####..#.#.#.#.#..####.....',
      '............#.#.#.#............',
      '............#######............',
      '.............#####.............',
    ];
    const rachas = (c: string): string =>
      CALAVERA.map((fila, y) => {
        let d = '';
        for (const m of fila.matchAll(new RegExp(`${c}+`, 'g'))) d += `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`;
        return d;
      }).join('');
    const CALAVERA_SVG =
      `<svg class="fx-grim-tx-craneo" viewBox="0 0 ${CALAVERA[0].length} ${CALAVERA.length}" width="${CALAVERA[0].length * 3}" ` +
      `height="${CALAVERA.length * 3}" shape-rendering="crispEdges" aria-hidden="true">` +
      `<path class="is-hueso" d="${rachas('#')}"/><path class="is-lente" d="${rachas('o')}"/></svg>`;

    /** Solo hay guerra: la orden llega por el cogitador y se teclea línea a línea. `--n` = caracteres con el «> ». */
    const ORDEN_DE_CRUZADA = ['ORIGEN: CORO ASTROPÁTICO VII', 'ORDEN DE CRUZADA... RECIBIDA', 'OBJETIVO ASIGNADO.', 'EL EMPERADOR PROTEGE.'];
    const RETARDOS_DE_LA_ORDEN = [0.75, 1.15, 1.6, 2.0];
    const transmisionAstropatica = (): HTMLElement =>
      escena(
        'fx-grim-tx',
        '<span class="fx-grim-tx-hd">+++ TRANSMISIÓN ENTRANTE +++</span>' +
          `<span class="fx-grim-tx-cuerpo">${CALAVERA_SVG}<span>` +
          ORDEN_DE_CRUZADA.map(
            (t, i) =>
              `<p style="--n:${t.length + 2};--d:${RETARDOS_DE_LA_ORDEN[i]}s">&gt; ${t}` +
              `${i === ORDEN_DE_CRUZADA.length - 1 ? '<i class="fx-grim-tx-cur"></i>' : ''}</p>`,
          ).join('') +
          '</span></span>',
      );

    /**
     * Sin futuro: el escáner óptico al empezar un juego. La retícula gira, los corchetes se cierran sobre el objetivo
     * y los datos se teclean a su lado. `--n` = caracteres de cada línea, `--d` = cuándo empieza a teclearse.
     */
    const escanerOptico = (): HTMLElement => {
      let marcas = '';
      for (let a = 0; a < 360; a += 30) marcas += `<path d="M100 6 V16" transform="rotate(${a} 100 100)"/>`;
      return escena(
        'fx-cp-scan',
        '<span class="fx-cp-scan-veil"></span><span class="fx-cp-scan-core">' +
          '<svg class="fx-cp-ret" viewBox="0 0 200 200" fill="none" stroke="currentColor" aria-hidden="true">' +
          '<g class="is-gira"><circle cx="100" cy="100" r="92" stroke-width="1.5" stroke-dasharray="22 8 4 8" opacity=".85"/>' +
          `<g stroke-width="2">${marcas}</g></g>` +
          '<g class="is-contra"><circle cx="100" cy="100" r="68" stroke-width="1" stroke-dasharray="3 5" opacity=".7"/>' +
          '<path d="M100 26 v10 M100 164 v10 M26 100 h10 M164 100 h10" stroke-width="2"/></g>' +
          '<circle cx="100" cy="100" r="34" stroke-width="1.2" opacity=".55"/>' +
          '<path d="M100 82 v10 M100 108 v10 M82 100 h10 M108 100 h10" stroke-width="1.5"/>' +
          '<circle class="is-punto" cx="100" cy="100" r="3.5" stroke="none"/></svg>' +
          '<span class="fx-cp-br is-tl"></span><span class="fx-cp-br is-tr"></span>' +
          '<span class="fx-cp-br is-bl"></span><span class="fx-cp-br is-br"></span>' +
          '<span class="fx-cp-sweep"></span>' +
          '<span class="fx-cp-scan-data">' +
          '<p class="is-hd" style="--n:17;--d:.35s">ÓPTICA // ESCÁNER</p>' +
          '<p style="--n:11;--d:.75s">ANALIZANDO…</p>' +
          '<p style="--n:16;--d:1.05s">ID: <b>PARTIDA_NUEVA</b></p>' +
          '<p style="--n:13;--d:1.35s">AMENAZA: <b>BAJA</b></p>' +
          '<p class="is-fin" style="--n:16;--d:1.6s">OBJETIVO <b>MARCADO</b></p>' +
          '</span></span>' +
          '<span class="fx-cp-scan-ok">MISIÓN ACTIVA</span>',
      );
    };

    /**
     * Sol y luna, al empezar: el cartel de zona, como al llegar a un sitio nuevo en el juego. Se abre una franja azul
     * de lado a lado con ribete de puntos dorados, se teclea «NUEVA AVENTURA» letra a letra (`--n` = letras), sale
     * «— capítulo 1 —» y titilan dos estrellas en los extremos.
     */
    const ZONA_NUEVA = 'NUEVA AVENTURA';
    const cartelDeZona = (): HTMLElement =>
      escena(
        'fx-sos-zona',
        `<b style="--n:${ZONA_NUEVA.length}">${ZONA_NUEVA}</b><small>— capítulo 1 —</small>` +
          '<i style="left:14%;--d:0s"></i><i style="right:14%;--d:.25s"></i>',
      );

    const onMoment = (e: Event): void => {
      const { moment } = (e as CustomEvent<MomentDetail>).detail;

      // Las escenas de empezar y cerrar un juego tapan la pantalla un par de segundos: salen solo si se han
      // encendido en Diseño (`gameScenesPreference`, apagada por defecto), además de los efectos.
      if ((moment === 'game-closed' || moment === 'game-started') && !gameScenesPreference.get()) return;

      if (moment === 'game-closed') {
        // Cada tema, su escena. Ladrones y Solo hay guerra compartían un sello que caía en el centro hasta el
        // 12-10-2026; Inserte moneda y Portal sorteaban dos cada uno hasta que la segunda pasó a empezar.
        if (fxRef.current('witcher')) spawn(contratoCerrado(), 3400);
        else if (fxRef.current('tierramedia')) spawn(elAnillo(), 3600);
        else if (fxRef.current('persona')) spawn(objetivoCumplido(), 2150);
        else if (fxRef.current('grimdark')) spawn(selloDePureza(), 2800);
        else if (fxRef.current('arcade')) spawn(pantallaDeRecord(), 2600);
        else if (fxRef.current('portal')) spawn(terminalGlados(), 2600);
        else if (fxRef.current('cyberpunk')) spawn(protocoloDeBrecha(), 2400);
        else if (fxRef.current('seaofstars')) spawn(ventanaDeVictoria(), 2300);
        return;
      }

      if (moment === 'game-started') {
        if (fxRef.current('tierramedia')) spawn(puertaRedonda(), 3000);
        else if (fxRef.current('arcade')) spawn(atardecerSynthwave(), 2600);
        else if (fxRef.current('witcher')) spawn(nuevoContrato(), 2800);
        else if (fxRef.current('persona')) spawn(calendario(), 2900);
        else if (fxRef.current('portal')) spawn(cartelDeCamara(), 1900);
        else if (fxRef.current('cyberpunk')) spawn(escanerOptico(), 2800);
        else if (fxRef.current('seaofstars')) spawn(cartelDeZona(), 2500);
        else if (fxRef.current('grimdark')) spawn(transmisionAstropatica(), 3000);
        return;
      }

      if (moment === 'library-saved' && fxRef.current('witcher')) {
        // El filete de acero vive bajo las pestañas: el destello va justo ahí, no por el borde de la ventana.
        const sweep = over('fx-silver-sweep', '.tabs');
        if (sweep) spawn(sweep);
        return;
      }

      if (moment === 'list-filtered' && fxRef.current('cyberpunk')) {
        const scan = over('fx-scan', '.table-wrap');
        if (scan) spawn(scan);
        return;
      }

      if (moment === 'achievement-unlocked' && fxRef.current('seaofstars')) {
        spawn(simple('fx-sos-shoot'));
      }
    };

    document.addEventListener(MOMENT_EVENT, onMoment);
    return () => document.removeEventListener(MOMENT_EVENT, onMoment);
  }, []);
}
