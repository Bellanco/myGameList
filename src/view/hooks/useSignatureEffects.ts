import { useEffect, useRef } from 'react';
import { MOMENT_EVENT, type MomentDetail } from '../../core/effects/moments';
import { DEFAULT_PALETTE } from '../../core/constants/palettes';
import { recorte } from '../components/socialhub/recortes';

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
 *  - CERRAR UN JUEGO → un SELLO que cae en el centro en dos temas: «objetivo cumplido» en letras recortadas
 *    (Ladrones de corazones) y el lacre con un escudo imperial (Solo hay guerra). Los demás tienen escena propia: la
 *    «Juego terminado» con letra de título de las películas (No puedes pasar); la franja de «contrato cerrado» con
 *    las dos espadas (Plata y acero); la pantalla de récord o el atardecer synthwave, al azar (Inserte moneda); el
 *    cartel de la cámara o la terminal de GLaDOS, al azar (Cámara de pruebas); el protocolo de brecha (Sin futuro), y
 *    la ventana de «¡Victoria!» (Sol y luna). Elegidos con la maqueta de los Game Clear (10-10-2026).
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
    // llevaba la escena entera por delante.
    const onEnd = (e: AnimationEvent): void => {
      if (e.target !== el) return;
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
    /** El sello que cae al cerrar un juego. El dibujo sale del sprite, que ya está en la página. */
    const seal = (icono: string | null, rotulo?: string): HTMLElement => {
      const el = document.createElement('span');
      el.className = 'fx-seal';
      if (icono) el.innerHTML = `<svg class="fx-seal-ico" aria-hidden="true"><use href="#icon-${icono}" /></svg>`;
      if (rotulo) {
        const texto = document.createElement('b');
        texto.className = 'fx-seal-label';
        texto.textContent = rotulo;
        el.appendChild(texto);
      }
      return el;
    };

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
     * Los escudos del lacre imperial: los mismos ficheros que rotan en el feed (`grimdark.scss`, «EL SELLO ROTA»),
     * pero solo los IMPERIALES. En el feed la marca herética tiene su lectura; en «deber cumplido», no.
     * Cuál es cada número lo decide la hoja del tema: aquí solo se sortea, y el que no case sale con la reserva.
     */
    const ESCUDOS_IMPERIALES = 8;

    /** No puedes pasar: «Juego terminado» con letra de título de las películas, la rúbrica y la luz que lo recorre. */
    const juegoTerminado = (): HTMLElement =>
      escena(
        'fx-tm-fin',
        '<b><span class="fx-tm-cap">J</span>uego <span class="fx-tm-cap">T</span>erminado</b><svg class="fx-tm-fin-raya" viewBox="0 0 300 14" aria-hidden="true">' +
          '<path d="M6 7 H128 M172 7 H294"/><path class="fx-tm-fin-hoja" d="M150 1 Q160 7 150 13 Q140 7 150 1 Z"/></svg>',
      );

    /**
     * El canto de los dos sellos, en SVG: la forma no es un rectángulo (la tarjeta torcida de los Ladrones, la placa
     * de esquinas cortadas del Imperio) y un `border` de CSS solo sabe seguir rectángulos. Los trazos no escalan con
     * la caja (`vector-effect`), así que el filo mide lo mismo sea cual sea el tamaño del rótulo.
     */
    const canto = (formas: string): SVGSVGElement => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'fx-seal-canto');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.innerHTML = formas;
      return svg;
    };
    const CANTO_LADRON =
      '<polygon class="is-sombra" points="1,8 98,0 95,98 3,91"/>' +
      '<polygon class="is-filo" points="1,8 98,0 95,98 3,91" vector-effect="non-scaling-stroke"/>' +
      '<polygon class="is-cara" points="1,8 98,0 95,98 3,91" vector-effect="non-scaling-stroke"/>';
    const CANTO_IMPERIAL =
      '<polygon class="is-cuerpo" points="9,0 91,0 100,9 100,91 91,100 9,100 0,91 0,9" vector-effect="non-scaling-stroke"/>' +
      '<polygon class="is-filete" points="12,5.5 88,5.5 94.5,12 94.5,88 88,94.5 12,94.5 5.5,88 5.5,12" vector-effect="non-scaling-stroke"/>' +
      '<circle class="is-remache" cx="50" cy="2.8" r="1.6"/><circle class="is-remache" cx="50" cy="97.2" r="1.6"/>' +
      '<circle class="is-remache" cx="2.8" cy="50" r="1.6"/><circle class="is-remache" cx="97.2" cy="50" r="1.6"/>';

    /** Plata y acero: la franja de The Witcher 3 al cerrar una misión, con la filigrana de plata. */
    const contratoCerrado = (): HTMLElement => {
      // Arriba, las DOS ESPADAS cruzadas —la de plata y la de acero, el nombre del tema— entre filigranas; abajo, el
      // filete con su rombo.
      const espadas =
        '<svg class="fx-wt-fil is-espadas" viewBox="0 0 300 30" aria-hidden="true">' +
        '<path d="M0 15 H118 M182 15 H300 M106 15 q12 -7 24 0 q-12 7 -24 0 M170 15 q12 -7 24 0 q-12 7 -24 0"/>' +
        '<path class="fx-wt-hoja" d="M139 26 L161 4 M161 26 L139 4"/>' +
        '<path class="fx-wt-guarda" d="M141 18 l6 6 M153 24 l6 -6 M138 27 l3 -3 M162 27 l-3 -3"/></svg>';
      const filete =
        '<svg class="fx-wt-fil" viewBox="0 0 300 12" aria-hidden="true"><path d="M0 6 H132 M168 6 H300"/>' +
        '<path class="fx-wt-rombo" d="M150 1 l5 5 l-5 5 l-5 -5z"/></svg>';
      return escena('fx-wt-mision', `${espadas}<b>CONTRATO CERRADO</b><em>Recompensa cobrada</em>${filete}`);
    };

    /** Inserte moneda: el monitor CRT que se enciende en una raya, enseña la puntuación y se apaga en un punto. */
    const pantallaDeRecord = (): HTMLElement =>
      escena(
        'fx-ar-crt',
        '<span class="fx-ar-crt-top"><span>1UP 004500</span><span>HI 050000</span></span><b>GAME CLEAR</b>' +
          '<span class="fx-ar-crt-bonus">BONUS </span><span class="fx-ar-crt-coin">INSERT COIN</span>',
      );

    /** Inserte moneda: el sol a rayas sobre la rejilla de neón, y el rótulo cromado delante. */
    const atardecerSynthwave = (): HTMLElement =>
      escena(
        'fx-ar-sunset',
        '<span class="fx-ar-cielo"></span><span class="fx-ar-sol"></span><span class="fx-ar-suelo"></span><b>GAME CLEAR</b>',
      );

    /** Cámara de pruebas: el cartel de la cámara que baja del techo. */
    const cartelDeCamara = (): HTMLElement =>
      escena(
        'fx-ap-sign',
        '<span class="fx-ap-num">19<small>CÁMARA</small></span>' +
          '<span class="fx-ap-txt"><small>APERTURE SCIENCE</small><b>PRUEBA SUPERADA</b>' +
          '<span class="fx-ap-pict"><i class="on"></i><i class="on"></i><i></i><i class="on"></i><i></i></span></span>' +
          '<span class="fx-ap-luces"></span>',
      );

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

    const onMoment = (e: Event): void => {
      const { moment } = (e as CustomEvent<MomentDetail>).detail;

      if (moment === 'game-closed') {
        // El sello del ladrón y el lacre imperial son el mismo gesto con dos caras (`.fx-seal`). El lacre de
        // contrato de «Plata y acero» y la marquesina de «Inserte moneda» también lo eran, hasta que cada uno pasó
        // a su escena (10-10-2026): la franja de The Witcher 3 y una recreativa que CANTA lo que acabas de hacer.
        if (fxRef.current('witcher')) spawn(contratoCerrado(), 2900);
        else if (fxRef.current('tierramedia')) spawn(juegoTerminado(), 3200);
        else if (fxRef.current('persona')) {
          // Sin icono: el rótulo recortado ya dice lo que pasa, y con la marca encima la tarjeta se leía doble.
          const sello = seal(null);
          sello.classList.add('is-recortes');
          sello.prepend(canto(CANTO_LADRON));
          const rotulo = document.createElement('b');
          rotulo.className = 'fx-seal-label';
          rotulo.appendChild(letrasRecortadas('OBJETIVO CUMPLIDO'));
          sello.appendChild(rotulo);
          spawn(sello);
        } else if (fxRef.current('grimdark')) {
          // El dibujo es un escudo del tema (una máscara de `seals/`), no un icono del sprite.
          const sello = seal(null, 'DEBER CUMPLIDO');
          const escudo = document.createElement('span');
          escudo.className = 'fx-seal-crest';
          sello.dataset.fx = String(Math.floor(Math.random() * ESCUDOS_IMPERIALES));
          sello.prepend(escudo);
          sello.prepend(canto(CANTO_IMPERIAL));
          spawn(sello);
        }
        // Los de escena propia. Las de Inserte moneda y Portal se sortean: son el mismo «has terminado» dicho de
        // varias maneras del mismo mundo, y que no salga siempre igual es parte de la gracia de cerrar un juego.
        else if (fxRef.current('arcade')) {
          if (Math.random() < 0.5) spawn(pantallaDeRecord(), 2600);
          else spawn(atardecerSynthwave(), 2600);
        } else if (fxRef.current('portal')) {
          if (Math.random() < 0.5) spawn(cartelDeCamara(), 1900);
          else spawn(terminalGlados(), 2600);
        } else if (fxRef.current('cyberpunk')) spawn(protocoloDeBrecha(), 2400);
        else if (fxRef.current('seaofstars')) spawn(ventanaDeVictoria(), 2300);
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
