// La voz de cada tema en la SECCIÓN DE PREMIOS: lo que se dice cuando algo se cae, contado como lo contaría ese
// mundo. Es el gemelo de `themes/social.ts`, y existe por lo mismo: el registro de temas es código de ARRANQUE, y
// si estas frases colgaran de la ficha de cada tema, el bundler las arrastraría al chunk que descarga todo el
// mundo — incluido quien no vota nunca.
//
// A DIFERENCIA DEL SOCIAL, AQUÍ NO HAY UNA FICHA POR TEMA. Allí cada voz vive en su `<id>.social.ts` porque son
// dos frases que se escriben a la vez que el mundo del tema; aquí son las mismas dos claves y ocho entradas
// cortas, y repartirlas en ocho ficheros de dos líneas hace más difícil mantenerlas coherentes entre sí que
// verlas juntas. Lo que sí se conserva es lo que importa: están fuera del arranque y `tests/unit/themes.test.ts`
// comprueba que no falte ninguna paleta.
//
// LAS DOS SITUACIONES son distintas y no se pueden decir igual:
//   · `error`   → algo ha fallado al cargar la votación. Hay red, pero no hay datos.
//   · `offline` → no hay red. La votación sigue ahí; lo que no llega es el recado.
import type { PaletteId } from '../palettes';

export interface ThemePremiosVoice {
  error: string;
  offline: string;
}

const PREMIOS_VOICES: Record<PaletteId, ThemePremiosVoice> = {
  /* La fragua: el fuego está encendido, pero no hay nada en el yunque. */
  forja: {
    error: 'El yunque está vacío.',
    offline: 'El recuento está lejos: no llega el recado.',
  },
  /* El salón recreativo: la máquina se come la moneda y no arranca la partida. */
  arcade: {
    error: 'La máquina se ha tragado la moneda.',
    offline: 'Se ha ido la corriente del salón.',
  },
  /* El gabinete de cuero y latón: el acta del escrutinio no está sobre la mesa. */
  witcher: {
    error: 'El acta no está sobre la mesa.',
    offline: 'El correo con el recuento no ha llegado.',
  },
  /* Ladrones de corazones: el palacio donde se guarda el recuento no responde. */
  persona: {
    error: 'El palacio del recuento no responde.',
    offline: 'No hay entrada al Mundo de las Almas.',
  },
  /* Aperture: una prueba que no llega a iniciarse. */
  portal: {
    error: 'La prueba no ha podido iniciarse.',
    offline: 'La cámara está incomunicada.',
  },
  /* Night City: el HUD sin datos. */
  cyberpunk: {
    error: 'Sin datos en el recuento.',
    offline: 'Sin señal con la red.',
  },
  /* Sol y luna: el faro que guarda los votos. */
  seaofstars: {
    error: 'El faro no guarda ningún recuento.',
    offline: 'La marea ha cortado el paso al faro.',
  },
  /* El cogitador: la máquina sagrada que no contesta. */
  grimdark: {
    error: 'El cogitador no responde al recuento.',
    offline: 'El vínculo con el cogitador se ha perdido.',
  },
};

/** Una de las dos frases de cada tema, indexada por paleta. Mismo contrato que `socialVoiceByPalette`. */
export function premiosVoiceByPalette(key: keyof ThemePremiosVoice): Record<PaletteId, string> {
  return Object.fromEntries(
    Object.entries(PREMIOS_VOICES).map(([id, voice]) => [id, voice[key]]),
  ) as Record<PaletteId, string>;
}
