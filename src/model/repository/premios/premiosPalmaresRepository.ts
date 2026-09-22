/**
 * LOS TROFEOS DE UNA EDICIÓN: concederlos, retirarlos y saber quién los tiene.
 *
 * El trofeo no vive en el archivo de la edición sino en el PERFIL de cada premiado (`profiles/{uid}.palmares`),
 * porque es un logro suyo y es ahí donde se enseña. Eso tiene una consecuencia incómoda: el archivo publicado no
 * puede llevar el uid de nadie —es público (ver §4.1 del plan)— y las papeletas, que sí lo llevaban, se retiran
 * al publicar. Sin nada más, conceder sería una operación de ida: una vez pasada la publicación, ya no habría
 * forma de saber a quién habría que devolverle el trofeo.
 *
 * Por eso cada edición deja un REGISTRO PRIVADO en `premiosAdmin/palmares-<seasonId>`, con la lista de premiados
 * y si el trofeo está concedido ahora mismo. Esa colección solo la lee y la escribe el administrador, así que el
 * uid no sale de ahí. Es lo que permite el interruptor del histórico: apagar retira el logro de los perfiles y
 * encender lo devuelve, tantas veces como haga falta.
 *
 * LA CLAVE ES LA CUENTA, NUNCA EL NOMBRE. Todo lo de aquí va por `uid`: el nick que se vea en la clasificación es
 * el rótulo que esa persona tenía al votar, y puede cambiar mañana sin que el trofeo se mueva de sitio.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore/lite';
import type { PalmaresEntry } from '../../types/premios';
import { ADMIN_COLLECTION, BATCH_LIMIT, palmaresDocId, requireServices } from './premiosShared';

/** Quién se llevó trofeo en una edición y en qué puesto. Solo existe en la colección de administración. */
export interface PalmaresRecipient {
  uid: string;
  rank: number;
}

/** El registro de una edición. */
export interface PalmaresRecord {
  seasonId: string;
  /** ¿Está concedido el trofeo ahora mismo? */
  granted: boolean;
  recipients: PalmaresRecipient[];
}

/** Lista de premiados saneada: sin uid vacío, sin puestos raros y sin repetidos. */
function cleanRecipients(raw: unknown): PalmaresRecipient[] {
  if (!Array.isArray(raw)) return [];
  const porUid = new Map<string, PalmaresRecipient>();
  for (const entry of raw as PalmaresRecipient[]) {
    const uid = String(entry?.uid || '');
    const rank = Number(entry?.rank || 0);
    if (!uid || !Number.isInteger(rank) || rank < 1) continue;
    porUid.set(uid, { uid, rank });
  }
  return [...porUid.values()];
}

/**
 * Guarda el registro de una edición.
 *
 * `recipients` solo se escribe cuando se sabe: al conceder desde las papeletas y al retirar desde los perfiles.
 * Un `undefined` deja intacta la lista que ya hubiera, que es la única forma de recuperar los trofeos después.
 */
export async function savePalmaresRecord(
  seasonId: string,
  granted: boolean,
  recipients?: PalmaresRecipient[],
): Promise<void> {
  const { firestore } = await requireServices();
  await setDoc(
    doc(firestore, ADMIN_COLLECTION, palmaresDocId(seasonId)),
    {
      seasonId,
      granted,
      ...(recipients ? { recipients: cleanRecipients(recipients) } : {}),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/** El registro de una edición, o `null` si esa edición no tiene ninguno todavía. */
export async function fetchPalmaresRecord(seasonId: string): Promise<PalmaresRecord | null> {
  const { firestore } = await requireServices();
  const snapshot = await getDoc(doc(firestore, ADMIN_COLLECTION, palmaresDocId(seasonId)));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() || {};
  return {
    seasonId: String(data.seasonId || seasonId),
    granted: data.granted !== false,
    recipients: cleanRecipients(data.recipients),
  };
}

/**
 * Los registros de TODAS las ediciones, por `seasonId`. Una sola lectura para pintar el histórico entero.
 *
 * Una edición sin registro NO sale aquí, y eso significa «concedido»: es lo que hay para las que se publicaron
 * antes de que existiera el interruptor, cuando publicar concedía siempre. Quien lo lea debe interpretar la
 * ausencia así (ver `AdminPremiosHistorico`).
 */
export async function fetchPalmaresRecords(): Promise<Record<string, PalmaresRecord>> {
  const { firestore } = await requireServices();
  const snapshot = await getDocs(collection(firestore, ADMIN_COLLECTION));
  const records: Record<string, PalmaresRecord> = {};

  for (const document of snapshot.docs) {
    const data = (document.data() || {}) as Record<string, unknown>;
    // Por el campo y no por el id: un `seasonId` puede llevar guiones, así que recortar el prefijo no es fiable.
    const seasonId = String(data.seasonId || '');
    if (!seasonId || !Array.isArray(data.recipients)) continue;
    records[seasonId] = {
      seasonId,
      granted: data.granted !== false,
      recipients: cleanRecipients(data.recipients),
    };
  }

  return records;
}

/** Olvida el registro de una edición. Se usa al borrarla del histórico: ya no hay trofeo que devolver. */
export async function forgetPalmaresRecord(seasonId: string): Promise<void> {
  const { firestore } = await requireServices();
  await deleteDoc(doc(firestore, ADMIN_COLLECTION, palmaresDocId(seasonId)));
}

/**
 * CONCEDE el trofeo de una edición a los premiados que se le pasen, cada uno en SU perfil.
 *
 * Solo puede hacerlo el administrador: la regla `profilePalmaresNotSelfAssigned` impide que nadie se lo ponga a
 * sí mismo.
 *
 * ES IDEMPOTENTE: se lee el palmarés que ya hubiera y se sustituye la entrada de ESTA edición, así que volver a
 * publicar —o volver a encender el interruptor— no duplica trofeos.
 *
 * NO LANZA: si un perfil no se deja escribir (no existe porque esa cuenta se borró, o las reglas cambian), el
 * resto de trofeos se concede igual. La edición ya está archivada; quedarse sin un trofeo es un incordio, perder
 * la publicación por eso sería mucho peor.
 */
export async function grantPalmares(
  premiados: PalmaresRecipient[],
  seasonId: string,
  seasonName: string,
): Promise<number> {
  const { firestore } = await requireServices();
  const awardedAt = Date.now();
  let concedidos = 0;

  for (const { uid, rank } of cleanRecipients(premiados)) {
    try {
      const ref = doc(firestore, 'profiles', uid);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) continue;

      const previo = (snapshot.data()?.palmares || []) as PalmaresEntry[];
      const sinEsta = Array.isArray(previo) ? previo.filter((entry) => entry?.seasonId !== seasonId) : [];
      const palmares = [...sinEsta, { seasonId, seasonName, rank, awardedAt }];

      await setDoc(ref, { palmares, updatedAt: awardedAt }, { merge: true });
      concedidos += 1;
    } catch {
      // Un trofeo que no se pudo conceder no puede tumbar la publicación.
    }
  }

  return concedidos;
}

/**
 * RETIRA el trofeo de una edición de todos los perfiles que lo tengan.
 *
 * Barre la colección de perfiles en vez de fiarse del registro, y es a propósito: el registro puede no existir
 * —ediciones publicadas antes del interruptor— o haberse quedado corto, y lo que hay que dejar limpio es lo que
 * de verdad se está enseñando. De paso, lo que encuentra es lo que se apunta como lista de premiados, que es lo
 * que permitirá devolver el trofeo.
 *
 * Devuelve a quién se le quitó, con su puesto.
 */
export async function revokePalmares(seasonId: string): Promise<PalmaresRecipient[]> {
  const { firestore } = await requireServices();
  const snapshot = await getDocs(collection(firestore, 'profiles'));

  // Primero se decide a quién hay que tocar, y solo después se escribe: así las escrituras se pueden agrupar.
  const pendientes = snapshot.docs.flatMap((document) => {
    const previo = (document.data()?.palmares || []) as PalmaresEntry[];
    if (!Array.isArray(previo) || previo.length === 0) return [];

    const mio = previo.find((entry) => entry?.seasonId === seasonId);
    if (!mio) return [];

    return [
      {
        ref: document.ref,
        palmares: previo.filter((entry) => entry?.seasonId !== seasonId),
        premiado: { uid: document.id, rank: Number(mio.rank) || 0 } as PalmaresRecipient,
      },
    ];
  });

  const retirados: PalmaresRecipient[] = [];

  // EN LOTES, y no un `setDoc` por perfil: esto barre la colección entera, así que el número de escrituras crece
  // con la gente registrada y encadenarlas era una ida y vuelta por cada una. Facturan igual —Firestore cobra por
  // documento—, pero se tarda lo que tarda un lote en vez de lo que tardan N.
  for (let i = 0; i < pendientes.length; i += BATCH_LIMIT) {
    const lote = pendientes.slice(i, i + BATCH_LIMIT);
    try {
      const batch = writeBatch(firestore);
      for (const { ref, palmares } of lote) {
        // `update` y no `set`: estos documentos vienen de listar la colección, así que existen. Si alguno se
        // hubiera borrado entre la lectura y ahora, que falle es lo correcto — no hay que resucitar un perfil.
        batch.update(ref, { palmares, updatedAt: Date.now() });
      }
      await batch.commit();
      retirados.push(...lote.map((entrada) => entrada.premiado));
    } catch {
      // UN LOTE ES TODO O NADA, y aquí eso sería un cambio de comportamiento: antes, un perfil que no se dejaba
      // escribir se saltaba y los demás seguían. Si el lote se cae, se reintenta documento a documento para
      // conservar esa tolerancia — un trofeo que no se pudo retirar no puede llevarse por delante los otros 499.
      for (const { ref, palmares, premiado } of lote) {
        try {
          await setDoc(ref, { palmares, updatedAt: Date.now() }, { merge: true });
          retirados.push(premiado);
        } catch {
          /* ese perfil se queda como está; el resto no paga por él. */
        }
      }
    }
  }

  return retirados;
}

/**
 * EL INTERRUPTOR DEL HISTÓRICO: concede o retira el trofeo de una edición ya archivada.
 *
 * Al encender se reparte a los premiados del registro. Si esa edición no tiene registro —publicada antes de que
 * esto existiera y nunca apagada desde aquí—, no hay a quién dárselo y se dice: reconstruirlo exigiría los votos,
 * que se retiraron al publicar.
 *
 * Al apagar se retira de los perfiles y se apunta a quién se le quitó, para poder devolvérselo.
 */
export async function setSeasonPalmaresGranted(
  seasonId: string,
  seasonName: string,
  granted: boolean,
): Promise<number> {
  if (!granted) {
    const retirados = await revokePalmares(seasonId);
    const registro = await fetchPalmaresRecord(seasonId);
    // Manda la lista más completa: si el registro ya sabía de alguien cuyo perfil hoy no lleva el trofeo (se
    // borró a mano, la escritura falló), perderlo aquí lo dejaría fuera al volver a encender.
    const conocidos = new Map<string, PalmaresRecipient>();
    for (const premiado of [...(registro?.recipients || []), ...retirados]) {
      conocidos.set(premiado.uid, premiado);
    }
    await savePalmaresRecord(seasonId, false, [...conocidos.values()]);
    return retirados.length;
  }

  const registro = await fetchPalmaresRecord(seasonId);
  if (!registro) {
    throw new Error(
      'No hay registro de premiados de esta edición: sus votos se retiraron al publicarla, así que no se sabe a quién devolverle el trofeo.',
    );
  }

  const concedidos = await grantPalmares(registro.recipients, seasonId, seasonName);
  await savePalmaresRecord(seasonId, true);
  return concedidos;
}
