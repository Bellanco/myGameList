// LA ÚLTIMA EDICIÓN DE PREMIOS LEÍDA BIEN, en este navegador (docs/plan-degradacion-servicios.md, fase 5).
//
// Con Firestore sin cuota o caído, la pantalla de Premios decía «No se han podido cargar los premios» aunque se
// hubiera abierto mil veces. Con esta copia se ve lo último que se supo: el calendario, las categorías y la
// papeleta propia. Votar sigue necesitando el servicio, y si no responde se dice al enviar (el borrador se guarda).
//
// La papeleta es de cada cuenta y es dato personal: va en su propia clave, que borra el borrado de cuenta.
import type { PremiosBallot, PremiosCategory, PremiosVotingConfig } from '../../types/premios';
import { PREMIOS_EDITION_COPY_KEY, premiosBallotCopyKey } from '../../../core/constants/storageKeys';

interface EditionCopy {
  config: PremiosVotingConfig | null;
  categories: PremiosCategory[];
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort
  }
}

export function readEditionCopy(): EditionCopy | null {
  const copy = read<EditionCopy>(PREMIOS_EDITION_COPY_KEY);
  return copy && Array.isArray(copy.categories) ? copy : null;
}

export function storeEditionCopy(copy: EditionCopy): void {
  write(PREMIOS_EDITION_COPY_KEY, copy);
}

/** `undefined` = no hay copia; `null` = la copia dice que esta cuenta no había votado. */
export function readBallotCopy(uid: string): PremiosBallot | null | undefined {
  try {
    const raw = localStorage.getItem(premiosBallotCopyKey(uid));
    return raw === null ? undefined : (JSON.parse(raw) as PremiosBallot | null);
  } catch {
    return undefined;
  }
}

export function storeBallotCopy(uid: string, ballot: PremiosBallot | null): void {
  write(premiosBallotCopyKey(uid), ballot);
}
