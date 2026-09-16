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
