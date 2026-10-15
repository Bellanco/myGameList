import { useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/form-modal.scss';
import { FILTER_BOOL, TAB_TOOLTIPS, VALIDATION_MESSAGES } from '../../core/constants/labels';
import { FORM_UI } from '../../core/constants/formLabels';
import { isMacPlatform } from '../../core/constants/searchLabels';
import { COMMON_ICONS } from '../../core/constants/icons';
import { UNPLAYED_TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
// Solo TIPOS del ViewModel: un import de valor arrastraría su módulo (que va en el arranque) al chunk del modal.
import type { GameDraft, SaveDraftOptions } from '../../viewmodel/useGameListViewModel';
import { mergeTags, splitTagInput } from '../../core/utils/tags';
import { normalizeHours } from '../../core/utils/normalize';
import { capGrowth, capList } from '../../core/utils/fieldLimits';
import { GAME_LIMITS } from '../../core/constants/gameLimits';
import { Icon } from '../components/Icon';
import { StarPicker } from '../components/StarPicker';
import { GradeLine } from '../components/GradeLine';
import { QuickPicks } from '../components/QuickPicks';
import { TagInput } from '../components/TagInput';
import { useNativeDialog } from './useNativeDialog';
import { useScoreScale } from '../hooks/useScoreScale';
import { DEFAULT_GRADE, DEFAULT_STARS, gradeFromStars, resolveGrade, starsFromGrade } from '../../core/utils/scoreScale';
import { EMPTY_FORM_SUGGESTIONS, buildFormSuggestions, filterSuggestions, matchCloseness, matchGlow, suggestForGenres } from '../../core/utils/formSuggestions';

interface FormModalProps {
  open: boolean;
  draft: GameDraft;
  currentTab: TabId;
  lookups: {
    genres: string[];
    platforms: string[];
    strengths: string[];
    weaknesses: string[];
  };
  /**
   * La biblioteca, de la que salen las sugerencias de un toque (lo más usado y los puntos por género). Se calculan
   * AQUÍ y solo con el modal abierto: el modal llega en un chunk perezoso, así que ni el código ni el recorrido de la
   * biblioteca pesan en el arranque. Sin ella, no hay sugerencias.
   */
  library?: Pick<TabData, TabId>;
  /** Busca un juego ya guardado con ese nombre en cualquier lista, ignorando el id del que se está editando. */
  findDuplicate: (name: string, ignoreId?: number) => { tab: TabId; game: GameItem } | null;
  onClose: () => void;
  /** Devuelve `false` si el guardado no se hizo (validación del ViewModel); con `keepOpen` el formulario sigue abierto. */
  onSave: (draft: GameDraft, options?: SaveDraftOptions) => boolean | void;
}

// Próximos y deseados llevan la nota de INTERÉS (no se han jugado): mismos campos en las dos.
const isUnplayed = (tab: TabId) => UNPLAYED_TAB_IDS.includes(tab);
// La nota es OBLIGATORIA en todas las listas que la llevan y nace en 3★ / 50 (ver `withDefaultScore`). La vergüenza
// dejó de tener el «Puntuar este juego» opcional: se puntúa siempre, como las demás.
const supportsScore = (tab: TabId) => tab === 'c' || tab === 'v' || isUnplayed(tab);
// La vergüenza puede registrar horas siempre (no afecta a la ruleta); su puntuación va tras el check `scored`.
const supportsHours = (tab: TabId) => tab === 'c' || tab === 'v';
const supportsYears = (tab: TabId) => tab === 'c';
const supportsReview = (tab: TabId) => !isUnplayed(tab);
const supportsStrengths = (tab: TabId) => tab === 'c' || tab === 'v' || tab === 'e';
const supportsWeaknesses = (tab: TabId) => tab === 'c' || tab === 'e';
const supportsReasons = (tab: TabId) => tab === 'v';

function getTabBoolField(tab: TabId): 'replayable' | 'retry' | null {
  return FILTER_BOOL[tab]?.field || null;
}

type TextTagField = 'genres' | 'platforms' | 'strengths' | 'weaknesses' | 'reasons';

type PendingTagFields = {
  genres: string;
  platforms: string;
  years: string;
  strengths: string;
  weaknesses: string;
  reasons: string;
};

const EMPTY_PENDING: PendingTagFields = {
  genres: '',
  platforms: '',
  years: '',
  strengths: '',
  weaknesses: '',
  reasons: '',
};

const REVIEW_MAX_LENGTH = GAME_LIMITS.review;

/** Lo que dura en pantalla el resumen de errores del pie antes de retirarse solo. */
const FORM_SUMMARY_TIMEOUT_MS = 5000;

/**
 * Errores del formulario: cada campo guarda SU mensaje, no un booleano. El texto se pinta bajo el campo y, todos
 * juntos y en este orden, en el resumen del pie del modal. Antes eran banderas y el único texto era un "revisa
 * los campos marcados" que además salía en el banner de la página, es decir, detrás del `<dialog>`.
 */
type FieldKey = 'name' | 'genres' | 'platforms' | 'years' | 'score' | 'hours';
type FieldErrorMap = Partial<Record<FieldKey, string>>;

// En el orden en que se ven: el nombre y la nota arriba; plataformas, géneros y años en la fila de debajo.
const FIELD_ORDER: FieldKey[] = ['name', 'score', 'platforms', 'genres', 'years', 'hours'];

/** Id del control de cada campo, para llevar el foco al primero que falle. La puntuación no es un `input`. */
const FIELD_INPUT_ID: Partial<Record<FieldKey, string>> = {
  name: 'draft-name',
  genres: 'draft-genres',
  platforms: 'draft-platforms',
  years: 'draft-years',
  hours: 'draft-hours',
};

function isValidYearValue(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= GAME_LIMITS.firstYear && year <= new Date().getFullYear();
}

/** El aviso de año no válido, con el rango de años que se admiten. */
const yearInvalidMessage = () => VALIDATION_MESSAGES.yearInvalid(GAME_LIMITS.firstYear, new Date().getFullYear());

/** Los años de la lista tras añadir `valid`: sin repetir, con el tope de la lista y en orden. */
function addYears(current: number[], valid: number[]): number[] {
  return capList([...new Set([...current, ...valid])], current, GAME_LIMITS.tagCount.years).sort((a, b) => a - b);
}

/**
 * Lee el campo de horas. Devuelve `null` si está vacío o si es 0 —un cero es la casilla sin rellenar, no «cero
 * horas jugadas»— e `invalid` si lo escrito no es un número utilizable. La coma decimal vale ("12,5"), y el
 * signo menos no puede llegar hasta aquí: el `onChange` lo filtra.
 *
 * Escribir un 0 NO es un error: el campo lo acepta mientras se teclea ("0,5" empieza por ahí) y simplemente no
 * guarda nada mientras el número no pase de cero.
 */
function parseHours(text: string): { invalid: boolean; value: number | null } {
  const trimmed = text.trim();
  if (!trimmed) return { invalid: false, value: null };
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return { invalid: true, value: null };
  return { invalid: false, value: normalizeHours(parsed) };
}

/** Cuántas sugerencias de un toque se ofrecen por campo (en una línea; lo que no cabe se desplaza). */
const QUICK_PICKS = { platforms: 6, genres: 8, points: 8 } as const;

/**
 * La nota es obligatoria y nunca parte de 0: un borrador sin nota (un alta, o una vergüenza o un próximo que se
 * guardaron sin puntuar) se abre con la de por defecto de la escala del usuario.
 */
function withDefaultScore(draft: GameDraft, tab: TabId, scale: 'stars' | 'grade'): GameDraft {
  if (!supportsScore(tab) || resolveGrade({ grade: draft.grade, score: draft.score }) > 0) return draft;
  return scale === 'grade'
    ? { ...draft, grade: DEFAULT_GRADE, score: starsFromGrade(DEFAULT_GRADE) }
    : { ...draft, score: DEFAULT_STARS, grade: gradeFromStars(DEFAULT_STARS) };
}

/**
 * Texto del campo de horas a partir del borrador (vacío cuando no hay dato, y el 0 no lo es). En español: con coma
 * decimal («12,5»), que es como se escribe en el campo.
 */
function hoursToText(hours: number | null | undefined): string {
  return normalizeHours(hours) === null ? '' : String(hours).replace('.', ',');
}

/**
 * Lo tecleado o pegado en las horas, limpio: solo cifras y UNA coma decimal, con dos decimales como mucho. El punto se
 * convierte en coma al vuelo («12.5» → «12,5»): se escriba como se escriba, se ve en español y no da error. Una
 * segunda coma (o punto) no entra.
 */
function cleanHoursText(raw: string): string {
  const [whole, ...decimals] = raw.replace(/[^\d.,]/g, '').replace(/\./g, ',').split(',');
  return decimals.length ? `${whole},${decimals.join('').slice(0, GAME_LIMITS.hoursDecimals)}` : whole;
}

export function FormModal({ open, draft: initialDraft, currentTab, lookups, library, findDuplicate, onClose, onSave }: FormModalProps) {
  const boolField = getTabBoolField(currentTab);
  const scoreScale = useScoreScale();
  // P3: el borrador vive LOCAL al modal y solo se emite en `onSave`. Antes cada pulsación llamaba a `onDraftChange`
  // (estado del VM) → re-render de todo el árbol (App/GameTable). Ahora solo re-renderiza el propio modal.
  const [draft, setLocalDraft] = useState<GameDraft>(() => withDefaultScore(initialDraft, currentTab, scoreScale));
  const [pending, setPending] = useState<PendingTagFields>(EMPTY_PENDING);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  // El resumen del pie solo sale DESPUÉS de intentar guardar: mientras se rellena el formulario, un mensaje bajo
  // el campo que falta es suficiente y una lista creciendo en el pie sería ruido. Y se retira solo a los pocos
  // segundos: ya ha cumplido su función (decir qué falta) y devuelve el sitio a los botones. Lo que NO se va es
  // el mensaje bajo cada campo, que es la referencia mientras se corrige.
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  // El campo de horas se edita como TEXTO y solo se convierte a número al vuelo: así se puede escribir "12," de
  // camino a "12,5" sin que el valor controlado se pelee con lo tecleado.
  const [hoursText, setHoursText] = useState<string>(() => hoursToText(initialDraft.hours));
  // Aviso (no error) de que se ha descartado un signo menos. Va aparte de `fieldErrors` a propósito: NO impide
  // guardar —el número que queda es válido— así que no debe engrosar la lista de "lo que falta" del pie.
  const [hoursNotice, setHoursNotice] = useState('');
  // «Añadir otro»: cuántos van en esta tanda y qué se acaba de guardar. Se olvidan al cerrar el modal.
  const [batchCount, setBatchCount] = useState(0);
  const [savedNotice, setSavedNotice] = useState('');
  // A11y-1: `<dialog>` nativo en modo modal → focus trap, restauración de foco, `::backdrop` y Esc → onClose.
  const dialogRef = useNativeDialog(open, onClose);
  const reviewCount = draft.review.length;
  const reviewProgress = Math.min(100, Math.round((reviewCount / REVIEW_MAX_LENGTH) * 100));
  const reviewProgressClass = reviewProgress >= 100 ? 'has-error' : reviewProgress >= 90 ? 'has-warning' : '';
  // A11y-3: mensaje anunciado por SR solo en umbrales (texto constante por banda → no se reanuncia por tecla).
  const reviewLiveMessage =
    reviewProgress >= 100 ? FORM_UI.charLimitReached : reviewProgress >= 90 ? FORM_UI.charNearLimit : '';
  const isNew = !initialDraft.id;
  const nameAtMax = draft.name.length >= GAME_LIMITS.name;
  const mac = isMacPlatform();
  const suggestions = useMemo(
    () => (open && library ? buildFormSuggestions([library.c, library.v, library.e, library.p, library.d]) : EMPTY_FORM_SUGGESTIONS),
    [open, library],
  );

  /**
   * Juego ya guardado con este mismo nombre (en cualquier lista, ignorando el que se está editando). Se calcula
   * mientras se escribe para avisar antes de rellenar el resto del formulario, no solo al pulsar Guardar.
   */
  const duplicate = useMemo(() => findDuplicate(draft.name, draft.id), [findDuplicate, draft.name, draft.id]);
  const duplicateMessage = duplicate
    ? VALIDATION_MESSAGES.duplicateName(duplicate.game.name, TAB_TOOLTIPS[duplicate.tab])
    : '';

  // RE-SIEMBRA DURANTE EL RENDER, no en un efecto, al abrir o cambiar de juego/pestaña (la prop solo cambia entonces).
  // El modal sigue MONTADO entre aperturas (`useMountedOnceOpen`), así que con un `useEffect` el commit que abre el
  // `<dialog>` pintaba todavía el borrador del cierre anterior —el vacío que deja Guardar, o el juego que se
  // canceló— y la siembra llegaba en otra tarea. En Chromium una pulsación cabía en ese hueco: se aplicaba sobre el
  // borrador rancio («Nuevo juego» sin nombre, no validaba) y lo tecleado se perdía. Ajustando el estado aquí, React
  // repite el render antes de pintar y el primer commit con `open` ya lleva el borrador bueno (mismo patrón que
  // `useMountedOnceOpen`). Test: `tests/component/FormModal.reopen.test.tsx`.
  const [seededFrom, setSeededFrom] = useState({ open, initialDraft, currentTab });
  if (seededFrom.open !== open || seededFrom.initialDraft !== initialDraft || seededFrom.currentTab !== currentTab) {
    // La tanda es de UNA apertura: se olvida al abrir o cerrar, no al pasar al siguiente juego de la misma tanda.
    if (seededFrom.open !== open) {
      setBatchCount(0);
      setSavedNotice('');
    }
    setSeededFrom({ open, initialDraft, currentTab });
    setLocalDraft(withDefaultScore(initialDraft, currentTab, scoreScale));
    setPending(EMPTY_PENDING);
    setFieldErrors({});
    setSummaryVisible(false);
    setHoursText(hoursToText(initialDraft.hours));
    setHoursNotice('');
  }

  // Al abrir para AÑADIR, el foco va al nombre: se escribe sin tocar nada antes. No vale `autoFocus`: React enfoca al
  // montar el campo, con el `<dialog>` aún cerrado, y se pierde. Va DESPUÉS de `useNativeDialog`, cuyo efecto es el
  // que llama a `showModal()`, así que aquí el diálogo ya está abierto. Al editar, el foco queda donde lo deja el
  // `<dialog>` (el primer control), para no sacar el teclado del móvil sin que se pida.
  useEffect(() => {
    if (open && isNew) document.getElementById('draft-name')?.focus();
  }, [open, isNew]);

  useEffect(() => {
    if (!summaryVisible) return;
    const timer = setTimeout(() => setSummaryVisible(false), FORM_SUMMARY_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // `summaryAttempt` reinicia la cuenta en cada nuevo intento de guardado, aunque el resumen ya estuviera visible.
  }, [summaryVisible, summaryAttempt]);

  const tagKeys = useMemo(() => {
    const keys: Array<keyof PendingTagFields> = ['genres', 'platforms'];
    if (supportsYears(currentTab)) keys.push('years');
    if (supportsStrengths(currentTab)) keys.push('strengths');
    if (supportsWeaknesses(currentTab)) keys.push('weaknesses');
    if (supportsReasons(currentTab)) keys.push('reasons');
    return keys;
  }, [currentTab]);

  const setPendingValue = (key: keyof PendingTagFields, value: string) => {
    setPending((prev) => ({ ...prev, [key]: value }));
  };

  const clearFieldError = (key: FieldKey) => {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const lookupFor = (key: TextTagField): string[] =>
    key === 'genres'
      ? lookups.genres
      : key === 'platforms'
        ? lookups.platforms
        : key === 'strengths'
          ? lookups.strengths
          : lookups.weaknesses;

  /**
   * Añade etiquetas ya troceadas por `TagInput`. La fusión la hace `mergeTags`: ignora mayúsculas y tildes, así
   * que "accion" no se añade si ya hay "Acción" —y si la etiqueta existe en las listas se adopta SU grafía—.
   */
  const addTextTags = (key: TextTagField, rawValues: string[]) => {
    if (!rawValues.length) return;
    setLocalDraft((prev) => ({
      ...prev,
      [key]: capList(mergeTags(prev[key], rawValues, lookupFor(key)), prev[key], GAME_LIMITS.tagCount[key]),
    }));
    // El campo NO se toca aquí: `TagInput` ya ha decidido qué queda escrito (nada tras un Enter, y el trozo a
    // medias tras un separador). Vaciarlo desde aquí se comía lo escrito después de la coma ("pc; switch").
    if (key === 'genres' || key === 'platforms') clearFieldError(key);
  };

  /** Igual que `addTextTags` pero para los años: los que no son un año válido no entran y explican por qué. */
  const addYearTags = (rawValues: string[]) => {
    const invalid = rawValues.filter((value) => !isValidYearValue(value));
    const valid = rawValues.filter(isValidYearValue).map(Number);

    if (valid.length) {
      setLocalDraft((prev) => ({ ...prev, years: addYears(prev.years, valid) }));
    }

    if (invalid.length) {
      setFieldErrors((prev) => ({ ...prev, years: yearInvalidMessage() }));
      // Lo que no es un año se devuelve al campo para poder corregirlo, salvo que ya se esté escribiendo otra cosa.
      setPending((prev) => ({ ...prev, years: prev.years || invalid.join(', ') }));
      return;
    }

    clearFieldError('years');
  };

  const removeTextTag = (key: TextTagField, value: string | number) => {
    const asString = String(value);
    setLocalDraft({
      ...draft,
      [key]: draft[key].filter((entry) => entry !== asString),
    });
  };

  const handleHoursChange = (raw: string) => {
    // El signo menos (y cualquier otro carácter que no sea cifra o separador decimal) NO llega al campo: las
    // horas negativas no se validan al final, es que no se pueden escribir ni pegar.
    const cleaned = cleanHoursText(raw);
    const { invalid, value } = parseHours(cleaned);

    // Por encima del tope no entra: el campo se queda como estaba y lo dice, igual que con el menos.
    if (value !== null && value > GAME_LIMITS.hoursMax) {
      setHoursNotice(FORM_UI.hoursMax(GAME_LIMITS.hoursMax));
      return;
    }
    setHoursText(cleaned);

    // Si lo tecleado o pegado traía un menos se dice: se ha filtrado, no ignorado en silencio. El aviso no se va
    // con la siguiente tecla (duraría un fotograma y nadie llegaría a leerlo): se queda hasta vaciar o guardar.
    if (/-/.test(raw)) setHoursNotice(VALIDATION_MESSAGES.hoursNegative);
    else if (!cleaned) setHoursNotice('');

    if (invalid) {
      setFieldErrors((prev) => ({ ...prev, hours: VALIDATION_MESSAGES.hoursInvalid }));
      return;
    }

    setLocalDraft((prev) => ({ ...prev, hours: value }));
    clearFieldError('hours');
  };

  const showSummary = () => {
    setSummaryVisible(true);
    setSummaryAttempt((attempt) => attempt + 1);
  };

  /** Lleva el foco al primer campo que falla (en el orden del formulario) para no tener que buscarlo. */
  const focusFirstError = (errors: FieldErrorMap) => {
    const firstKey = FIELD_ORDER.find((key) => errors[key] && FIELD_INPUT_ID[key]);
    const inputId = firstKey ? FIELD_INPUT_ID[firstKey] : undefined;
    if (inputId) document.getElementById(inputId)?.focus();
  };

  /** `another`: «Añadir otro» (solo en las altas): guarda y deja el formulario abierto con un alta nueva. */
  const runSave = (another = false) => {
    const nextDraft: GameDraft = {
      ...draft,
      genres: [...draft.genres],
      platforms: [...draft.platforms],
      years: [...draft.years],
      strengths: [...draft.strengths],
      weaknesses: [...draft.weaknesses],
      reasons: [...draft.reasons],
    };

    // La vergüenza se puntúa siempre, como las demás listas: el flag que antes encendía el check queda fijo.
    if (currentTab === 'v') nextDraft.scored = true;

    const errors: FieldErrorMap = {};

    // Lo que quedó escrito en un campo de etiquetas SIN pulsar Enter también se guarda: es el error más habitual
    // (escribir el género y darle directamente a Guardar).
    for (const key of tagKeys) {
      const parts = splitTagInput(pending[key]);
      if (!parts.length) continue;

      if (key === 'years') {
        const valid = parts.filter(isValidYearValue).map(Number);
        if (valid.length) nextDraft.years = addYears(nextDraft.years, valid);
        if (parts.some((value) => !isValidYearValue(value))) {
          errors.years = yearInvalidMessage();
        } else {
          setPendingValue('years', '');
        }
        continue;
      }

      nextDraft[key] = capList(mergeTags(nextDraft[key], parts, lookupFor(key)), nextDraft[key], GAME_LIMITS.tagCount[key]);
      setPendingValue(key, '');
    }

    // Si algo de abajo para el guardado, lo que se acaba de sacar de los campos tiene que quedarse como etiqueta:
    // el campo ya se ha vaciado, y tirar `nextDraft` sin más lo hacía desaparecer de los dos sitios. Solo las
    // etiquetas: el resto de `nextDraft` (las horas) es cosa del guardado.
    const keepTypedTags = () => {
      setLocalDraft((current) => {
        const kept = { ...current };
        for (const key of tagKeys) (kept[key] as unknown) = nextDraft[key];
        return kept;
      });
    };

    const hours = parseHours(hoursText);
    if (hours.invalid) errors.hours = VALIDATION_MESSAGES.hoursInvalid;
    else nextDraft.hours = hours.value;

    // El duplicado corta el guardado antes que el resto de validaciones: no tiene sentido pedir que se completen
    // los campos obligatorios de un juego que ya está en las listas.
    const duplicateOnSave = findDuplicate(nextDraft.name, nextDraft.id);
    if (duplicateOnSave) {
      const message = VALIDATION_MESSAGES.duplicateName(duplicateOnSave.game.name, TAB_TOOLTIPS[duplicateOnSave.tab]);
      setFieldErrors({ name: message });
      keepTypedTags();
      showSummary();
      focusFirstError({ name: message });
      return;
    }

    if (!nextDraft.name.trim()) errors.name = VALIDATION_MESSAGES.nameRequired;
    if (!nextDraft.genres.length) errors.genres = VALIDATION_MESSAGES.genresRequired;
    if (!nextDraft.platforms.length) errors.platforms = VALIDATION_MESSAGES.platformsRequired;
    if (supportsYears(currentTab) && !nextDraft.years.length && !errors.years) errors.years = VALIDATION_MESSAGES.yearsRequired;
    // La nota es obligatoria en toda lista que la lleve: vale la efectiva (estrellas o barra), sea cual sea la escala.
    if (supportsScore(currentTab) && resolveGrade({ grade: nextDraft.grade, score: nextDraft.score }) <= 0) {
      errors.score = VALIDATION_MESSAGES.scoreRequired;
    }

    setFieldErrors(errors);
    if (FIELD_ORDER.some((key) => errors[key])) {
      keepTypedTags();
      showSummary();
      focusFirstError(errors);
      return;
    }

    setSummaryVisible(false);
    if (another) {
      const saved = onSave(nextDraft, { keepOpen: true });
      if (saved === false) return;
      // El ViewModel ya ha dejado un alta nueva (con plataformas y años) y la siembra de arriba la recoge.
      setBatchCount((count) => count + 1);
      setSavedNotice(FORM_UI.savedKeepNotice(nextDraft.name.trim(), supportsYears(currentTab)));
      requestAnimationFrame(() => document.getElementById('draft-name')?.focus());
      return;
    }
    setLocalDraft(nextDraft);
    setHoursText(hoursToText(nextDraft.hours));
    setHoursNotice('');
    onSave(nextDraft);
  };

  // ⌘↵ / Ctrl+↵ guarda desde cualquier campo: en un alta, «Añadir otro» (lo habitual en una tanda); al
  // editar, «Guardar». En el documento y no en el modal: si el foco se ha ido al `body` (un botón que desaparece),
  // el atajo sigue valiendo, y con el `<dialog>` modal abierto no hay nada más que pueda recibirlo.
  const runSaveRef = useRef(runSave);
  runSaveRef.current = runSave;
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.isComposing) return;
      event.preventDefault();
      runSaveRef.current(isNew);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isNew]);

  const errorSummary = summaryVisible
    ? FIELD_ORDER.map((key) => fieldErrors[key]).filter((message): message is string => Boolean(message))
    : [];

  const currentYear = new Date().getFullYear();
  const pointsTaken = [...draft.strengths, ...draft.weaknesses];
  const yearsFull = draft.years.length >= GAME_LIMITS.tagCount.years;

  /** El aviso bajo un campo de etiquetas: la lista llena o la etiqueta al tope; si no, cómo se añade. */
  const tagHint = (full: boolean, maxCount: number, atMaxLength = false, maxLength = 0) =>
    full ? FORM_UI.tagListFull(maxCount) : atMaxLength ? FORM_UI.maxChars(maxLength) : FORM_UI.enterToAddHint;

  /**
   * Un campo de etiquetas con sus sugerencias de un toque debajo. Hacen también de autocompletado: mientras se
   * escribe, la fila se queda con las de `pool` que casan con lo escrito (`filterSuggestions`), cada una más
   * iluminada cuanto más se acerca lo escrito a su nombre y cuantas menos quedan; tocar una la añade y vacía el campo.
   */
  const tagField = (
    key: TextTagField,
    label: string,
    placeholder: string,
    chipClassName: string,
    pool: ReadonlyArray<string>,
    limit: number,
    picksLabel: string,
    taken: ReadonlyArray<string> = draft[key],
    errorMessage?: string,
  ) => {
    const query = pending[key].trim();
    // Todas las que casan (no solo las que caben): cuantas menos quedan, más se encienden.
    const matches = filterSuggestions(pool, query, taken, query ? Infinity : limit);
    const maxLength = GAME_LIMITS.tagLength[key];
    const full = draft[key].length >= GAME_LIMITS.tagCount[key];
    return (
      <div className="form-field">
        <TagInput
          label={label}
          inputId={`draft-${key}`}
          placeholder={placeholder}
          values={draft[key]}
          pendingValue={pending[key]}
          onPendingValueChange={(value) => setPendingValue(key, value)}
          onAdd={(values) => addTextTags(key, values)}
          onRemove={(value) => removeTextTag(key, value)}
          chipClassName={chipClassName}
          hint={tagHint(full, GAME_LIMITS.tagCount[key], pending[key].length >= maxLength, maxLength)}
          errorMessage={errorMessage}
          maxLength={maxLength}
          full={full}
        />
        {/* Llena la lista, no se ofrece nada más que añadir. */}
        <QuickPicks
          options={full ? [] : matches.slice(0, limit)}
          taken={taken}
          label={query ? FORM_UI.quickPicks.matching : picksLabel}
          fieldId={`draft-${key}`}
          returnToField={Boolean(query)}
          glow={query ? (value) => matchGlow(matchCloseness(value, query), matches.length) : undefined}
          onPick={(value) => {
            addTextTags(key, [value]);
            if (query) setPendingValue(key, '');
          }}
        />
      </div>
    );
  };

  const scoreField = supportsScore(currentTab) ? (
    <div className="fg form-score">
      <span className="flabel">{isUnplayed(currentTab) ? FORM_UI.interestLabel : FORM_UI.scoreLabel}</span>
      <div className={`score-input-shell ${fieldErrors.score ? 'has-error' : ''}`.trim()}>
        {scoreScale === 'grade' ? (
          <GradeLine
            value={typeof draft.grade === 'number' ? draft.grade : gradeFromStars(draft.score)}
            onChange={(g) => {
              clearFieldError('score');
              setLocalDraft({ ...draft, grade: g, score: starsFromGrade(g) });
            }}
          />
        ) : (
          <StarPicker
            value={draft.score}
            onChange={(v) => {
              clearFieldError('score');
              setLocalDraft({ ...draft, score: v, grade: gradeFromStars(v) });
            }}
          />
        )}
      </div>
      {fieldErrors.score ? <small className="tag-hint is-error">{fieldErrors.score}</small> : null}
    </div>
  ) : null;

  const hoursField = supportsHours(currentTab) ? (
    <div className="fg form-hours">
      <label htmlFor="draft-hours" className="flabel">{FORM_UI.hoursLabel}</label>
      <input
        id="draft-hours"
        className={`finput ${fieldErrors.hours ? 'has-error' : hoursNotice ? 'has-warning' : ''}`.trim()}
        // `text` + `inputMode="decimal"`: teclado numérico en el móvil, coma decimal admitida y —lo importante—
        // control total de lo que entra, que es lo que deja fuera el signo menos (`type="number"` sí lo acepta).
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={FORM_UI.hoursPlaceholder}
        value={hoursText}
        aria-invalid={fieldErrors.hours ? true : undefined}
        aria-describedby={fieldErrors.hours || hoursNotice ? 'draft-hours-error' : undefined}
        onChange={(event) => handleHoursChange(event.target.value)}
      />
      {fieldErrors.hours || hoursNotice ? (
        <small id="draft-hours-error" className={`tag-hint ${fieldErrors.hours ? 'is-error' : 'is-warning'}`}>
          {fieldErrors.hours || hoursNotice}
        </small>
      ) : null}
    </div>
  ) : null;

  const hasPoints = supportsStrengths(currentTab) || supportsWeaknesses(currentTab) || supportsReasons(currentTab);
  const hasExtras = hasPoints || Boolean(hoursField) || supportsReview(currentTab);
  const toggleActive = boolField === 'replayable' ? draft.replayable : draft.retry;
  const boolLabel = FILTER_BOOL[currentTab]?.label ?? '';

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-label={initialDraft.id ? FORM_UI.editTitle : FORM_UI.newTitle}
      onMouseDown={(event) => {
        // Click en el backdrop (fuera de .modal) → cerrar; el target es el propio <dialog>.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
      <div className="modal form-modal">
        <div className="modal-hd">
          <div className="modal-title">{draft.id ? FORM_UI.editTitle : FORM_UI.newTitle}</div>
          {batchCount ? <span className="form-batch">{FORM_UI.batchCount(batchCount)}</span> : null}
          <button
            className="btn-icon"
            type="button"
            aria-label={FORM_UI.close}
            title={FORM_UI.close}
            onClick={onClose}
          >
            <Icon name={COMMON_ICONS.close} />
          </button>
        </div>
        {/* LO OBLIGATORIO ARRIBA, LO OPCIONAL EN LA BANDEJA. Sin asteriscos ni «opcional» escrito: la diferencia la
            pone el diseño (campos rellenos arriba; abajo, una bandeja de fondo apenas distinto, rótulos apagados y
            campos de contorno discontinuo). Ver `.form-extra` en `_overlays-and-responsive.scss`. */}
        <div className="modal-body">
          <div className={`form-head ${scoreField ? '' : 'is-solo'}`.trim()}>
            <div className="fg form-name">
              <label htmlFor="draft-name" className="flabel">{FORM_UI.nameLabel}</label>
              <input
                id="draft-name"
                className={`finput ${fieldErrors.name || duplicate ? 'has-error' : ''}`.trim()}
                value={draft.name}
                placeholder={FORM_UI.namePlaceholder}
                autoComplete="off"
                maxLength={Math.max(GAME_LIMITS.name, draft.name.length)}
                aria-invalid={duplicate || fieldErrors.name ? true : undefined}
                aria-describedby={duplicate || fieldErrors.name || nameAtMax ? 'draft-name-error' : undefined}
                onChange={(event) => {
                  clearFieldError('name');
                  setLocalDraft({ ...draft, name: capGrowth(event.target.value, draft.name, GAME_LIMITS.name) });
                }}
              />
              {duplicate || fieldErrors.name ? (
                <small id="draft-name-error" className="tag-hint is-error" role="alert">
                  {duplicateMessage || fieldErrors.name}
                </small>
              ) : nameAtMax ? (
                <small id="draft-name-error" className="tag-hint">{FORM_UI.maxChars(GAME_LIMITS.name)}</small>
              ) : null}
            </div>
            {scoreField}
          </div>

          <div className={`form-row ${supportsYears(currentTab) ? 'is-three' : ''}`.trim()}>
            {tagField('platforms', FORM_UI.platformsLabel, FORM_UI.platformsPlaceholder, 'chip-plat', suggestions.ranked.platforms,
              QUICK_PICKS.platforms, FORM_UI.quickPicks.platforms, draft.platforms, fieldErrors.platforms)}
            {tagField('genres', FORM_UI.genresLabel, FORM_UI.genresPlaceholder, 'chip-genre', suggestions.ranked.genres,
              QUICK_PICKS.genres, FORM_UI.quickPicks.genres, draft.genres, fieldErrors.genres)}
            {supportsYears(currentTab) ? (
              <div className="form-field">
                <TagInput
                  label={FORM_UI.yearsLabel}
                  inputId="draft-years"
                  placeholder={FORM_UI.yearsPlaceholder}
                  values={draft.years}
                  pendingValue={pending.years}
                  onPendingValueChange={(value) => setPendingValue('years', value)}
                  onAdd={(values) => addYearTags(values)}
                  onRemove={(value) => {
                    setLocalDraft({ ...draft, years: draft.years.filter((entry) => entry !== Number(value)) });
                  }}
                  chipClassName="chip-generic"
                  hint={tagHint(yearsFull, GAME_LIMITS.tagCount.years)}
                  errorMessage={fieldErrors.years}
                  full={yearsFull}
                />
                <QuickPicks options={yearsFull ? [] : [currentYear, currentYear - 1]} taken={draft.years} label={FORM_UI.quickPicks.years}
                  fieldId="draft-years" onPick={(value) => addYearTags([value])} />
              </div>
            ) : null}
          </div>

          {hasExtras ? (
            <div className="form-extra">
              {hasPoints || hoursField ? (
                <div className={`form-row ${hoursField ? 'has-hours' : ''}`.trim()}>
                  {supportsStrengths(currentTab)
                    ? tagField('strengths', FORM_UI.strengthsLabel, FORM_UI.strengthsPlaceholder, 'chip-pf',
                      suggestForGenres(suggestions, 'strengths', draft.genres, pointsTaken, Infinity), QUICK_PICKS.points,
                      FORM_UI.quickPicks.strengths, pointsTaken)
                    : null}
                  {supportsWeaknesses(currentTab)
                    ? tagField('weaknesses', FORM_UI.weaknessesLabel, FORM_UI.weaknessesPlaceholder, 'chip-pd',
                      suggestForGenres(suggestions, 'weaknesses', draft.genres, pointsTaken, Infinity), QUICK_PICKS.points,
                      FORM_UI.quickPicks.weaknesses, pointsTaken)
                    : null}
                  {supportsReasons(currentTab)
                    ? tagField('reasons', FORM_UI.reasonsLabel, FORM_UI.reasonsPlaceholder, 'chip-pd',
                      suggestForGenres(suggestions, 'reasons', draft.genres, draft.reasons, Infinity), QUICK_PICKS.points,
                      FORM_UI.quickPicks.reasons)
                    : null}
                  {hoursField}
                </div>
              ) : null}

              {supportsReview(currentTab) ? (
                <div className="fg form-review">
                  <label htmlFor="draft-review" className="flabel">{FORM_UI.reviewLabel}</label>
                  <textarea
                    id="draft-review"
                    className="ftextarea"
                    rows={2}
                    // Un análisis que ya pasaba del tope (de antes de bajarlo) se puede acortar, pero no se recorta solo.
                    maxLength={Math.max(REVIEW_MAX_LENGTH, draft.review.length)}
                    value={draft.review}
                    placeholder={FORM_UI.reviewPlaceholder}
                    onChange={(event) => {
                      setLocalDraft({ ...draft, review: capGrowth(event.target.value, draft.review, REVIEW_MAX_LENGTH) });
                    }}
                  />
                  {/* El conteo solo aparece al escribir: con el campo vacío, una cifra «0 / 22.500» sugería que
                      había que llenarlo. A11y-3: conteo visible sin aria-live (no se anuncia por pulsación). */}
                  {reviewCount ? (
                    <div className="field-footer">
                      <small className={`tag-hint ${reviewProgressClass}`.trim()}>
                        {FORM_UI.charCount(reviewCount, REVIEW_MAX_LENGTH)}
                      </small>
                    </div>
                  ) : null}
                  {/* Región viva exclusiva para SR: solo lleva texto en los umbrales (90% / 100%). */}
                  <span className="sr-only" role="status" aria-live="polite">
                    {reviewLiveMessage}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="modal-ft form-ft">
          {/* Los interruptores, en el pie y SOLO CON ICONO: están a mano sin competir con los campos. El nombre lo
              dicen la descripción (al pasar por encima) y el `aria-label`; el estado, `aria-pressed` y el tema. */}
          <div className="form-ft-toggles">
            <button
              className={`btn btn-toggle btn-toggle-deck btn-icon-only ${draft.steamDeck ? 'active' : ''}`.trim()}
              type="button"
              aria-label={FORM_UI.steamDeck}
              title={FORM_UI.steamDeck}
              aria-pressed={draft.steamDeck}
              onClick={() => setLocalDraft({ ...draft, steamDeck: !draft.steamDeck })}
            >
              <Icon name={COMMON_ICONS.steamDeck} />
            </button>
            {boolField ? (
              <button
                className={`btn btn-toggle btn-icon-only ${toggleActive ? 'active' : ''}`.trim()}
                type="button"
                aria-label={boolLabel}
                title={boolLabel}
                aria-pressed={toggleActive}
                onClick={() => {
                  if (boolField === 'replayable') setLocalDraft({ ...draft, replayable: !draft.replayable });
                  if (boolField === 'retry') setLocalDraft({ ...draft, retry: !draft.retry });
                }}
              >
                <Icon name={boolField === 'replayable' ? COMMON_ICONS.repeat : COMMON_ICONS.undo} />
              </button>
            ) : null}
          </div>
          <span className="form-saved" role="status">{savedNotice}</span>
          {/* El resumen vive en el PIE, junto a Guardar: es donde está la mirada al pulsar y no se pierde aunque
              el cuerpo del formulario esté desplazado. Cada línea repite el mensaje que hay bajo su campo. */}
          {errorSummary.length ? (
            <div className="form-error-summary" role="alert">
              <strong>{VALIDATION_MESSAGES.formSummary(errorSummary.length)}</strong>
              <ul>
                {errorSummary.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <button className="btn btn-quiet form-cancel" type="button" onClick={onClose}>
            {FORM_UI.cancel}
          </button>
          {isNew ? (
            // Secundario: guarda igual que Guardar, pero el que manda es Guardar (el botón de color del tema).
            <button
              className="btn form-another"
              type="button"
              title={FORM_UI.shortcutTitle(FORM_UI.addAnother, mac)}
              onClick={() => runSave(true)}
            >
              {FORM_UI.addAnother}
            </button>
          ) : null}
          <button
            className="btn btn-steam"
            type="button"
            title={isNew ? undefined : FORM_UI.shortcutTitle(FORM_UI.save, mac)}
            onClick={() => runSave(false)}
          >
            {FORM_UI.save}
          </button>
        </div>
      </div>
      ) : null}
    </dialog>
  );
}
