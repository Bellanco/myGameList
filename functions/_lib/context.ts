// Preámbulo común de los endpoints autenticados: configuración presente, token verificado y quién llama.
//
// Devuelve una `Response` cuando algo impide seguir, en vez de lanzar. Así cada endpoint es un `if` de una línea
// y no hay forma de olvidarse un `catch` y acabar sirviendo una petición sin verificar.
import { bearerToken, isAdmin, verifyIdToken, type AuthUser } from './firebaseAuth';
import { fail } from './http';
import type { Env } from './keys';

export interface CallerContext {
  user: AuthUser;
  /** Token de App Check tal cual llegó del cliente; se reenvía a Firestore al leer el perfil. */
  appCheckToken: string | null;
  projectId: string;
  isAdmin: boolean;
}

export async function requireUser(request: Request, env: Env): Promise<CallerContext | Response> {
  const projectId = String(env.FIREBASE_PROJECT_ID || '').trim();
  if (!projectId || !env.SHARES) {
    // Configuración incompleta: es un fallo NUESTRO, no del cliente, y conviene que se note en cuanto se
    // despliega en vez de degradarse a un 401 que parecería un problema de sesión.
    return fail(500, 'La función de compartir no está configurada en este entorno');
  }

  const token = bearerToken(request);
  if (!token) {
    return fail(401, 'Falta la sesión');
  }

  try {
    const user = await verifyIdToken(token, projectId, env.SHARES);
    return {
      user,
      appCheckToken: request.headers.get('X-Firebase-AppCheck'),
      projectId,
      isAdmin: isAdmin(user, env.ADMIN_EMAIL),
    };
  } catch {
    // Sin detalle a propósito: a quien trae un token inválido no se le explica en qué comprobación ha fallado.
    return fail(401, 'Sesión no válida');
  }
}

/** Igual que `requireUser`, pero además exige ser el administrador. */
export async function requireAdmin(request: Request, env: Env): Promise<CallerContext | Response> {
  const context = await requireUser(request, env);
  if (context instanceof Response) {
    return context;
  }
  return context.isAdmin ? context : fail(403, 'Solo el administrador');
}
