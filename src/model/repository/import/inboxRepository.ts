// Persistencia LOCAL de la bandeja de importados (store IndexedDB dedicado `importInbox`, v5).
// No se sincroniza por gist (decisión de diseño). Best-effort: un fallo de IO no debe romper la app.

import { IMPORT_INBOX_STORE } from '../idbConnectionRepository';
import { idbGet, idbPut } from '../indexedDbRepository';
import { EMPTY_INBOX } from '../../../core/import/staging';
import type { ImportInbox } from '../../types/import';

const INBOX_KEY = 'latest';

export async function loadImportInbox(): Promise<ImportInbox> {
  try {
    const rec = await idbGet<ImportInbox>(IMPORT_INBOX_STORE, INBOX_KEY);
    if (rec && Array.isArray(rec.imported)) return rec;
    return EMPTY_INBOX;
  } catch {
    return EMPTY_INBOX;
  }
}

export async function saveImportInbox(inbox: ImportInbox): Promise<void> {
  try {
    await idbPut<ImportInbox>(IMPORT_INBOX_STORE, inbox, INBOX_KEY);
  } catch {
    // best-effort: la bandeja es local y de paso; un fallo de escritura no debe interrumpir el import.
  }
}
