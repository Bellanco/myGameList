import { shareAuthHeaders } from './shareRepository';

/**
 * Pedir que se levante el cupo de carátulas de esta IP (ver `functions/api/cover-quota.ts`).
 *
 * Lo concede el SERVIDOR o no lo concede: aquí no se decide nada, solo se pregunta. El rango lo lee la Function
 * del perfil de verdad, con el token de la sesión, así que manipular esta llamada no da nada — como mucho, un
 * 403.
 *
 * SILENCIOSO A PROPÓSITO. No es una función de la aplicación: es un privilegio que, cuando no está, deja las
 * cosas exactamente como estaban para todo el mundo (el cupo normal, que a una biblioteca de 302 juegos le sobra).
 * Si falla —sin sesión, sin red, rango que no es— no hay nada que decirle a nadie ni nada que reintentar.
 */
export async function pedirCupoDeCaratulasLibre(): Promise<boolean> {
  try {
    const headers = await shareAuthHeaders(() => new Error('sin sesión'));
    const respuesta = await fetch('/api/cover-quota', { method: 'POST', headers });
    return respuesta.ok;
  } catch {
    return false;
  }
}

/** Lo que el servicio lleva resuelto hoy, tal y como lo cuenta el servidor (ver `functions/api/cover-stats.ts`). */
export interface GastoDeCaratulas {
  /** Día UTC al que corresponde la cuenta, en `AAAA-MM-DD`. */
  dia: string;
  gastado: number;
  techo: number;
  quedan: number;
}

/**
 * El gasto de carátulas del día, para la pantalla de administración.
 *
 * Silencioso como el de arriba, y por el mismo motivo: es un dato de más en un panel que sigue siendo útil sin
 * él. Enseñar un cero cuando no se ha podido leer sería afirmar que hoy no se ha resuelto nada, así que ante
 * cualquier fallo se devuelve `null` y la fila no se pinta — el mismo criterio que el censo de enlaces.
 */
export async function leerGastoDeCaratulas(): Promise<GastoDeCaratulas | null> {
  try {
    const headers = await shareAuthHeaders(() => new Error('sin sesión'));
    const respuesta = await fetch('/api/cover-stats', { headers });
    if (!respuesta.ok) return null;
    const datos = (await respuesta.json()) as Partial<GastoDeCaratulas>;
    if (typeof datos.gastado !== 'number' || typeof datos.techo !== 'number') return null;
    return {
      dia: String(datos.dia ?? ''),
      gastado: datos.gastado,
      techo: datos.techo,
      quedan: typeof datos.quedan === 'number' ? datos.quedan : Math.max(0, datos.techo - datos.gastado),
    };
  } catch {
    return null;
  }
}
