import { useEffect, useMemo, useState } from 'react';
import { FILTER_BOOL, TAB_TOOLTIPS, UI_MESSAGES, VALIDATION_MESSAGES } from '../../core/constants/labels';
import { COMMON_ICONS } from '../../core/constants/icons';
import type { GameItem, TabId } from '../../model/types/game';
import type { GameDraft } from '../../viewmodel/useGameListViewModel';
import { mergeTags, splitTagInput } from '../../core/utils/tags';
import { Icon } from '../components/Icon';
import { StarPicker } from '../components/StarPicker';
import { ScoreDial } from '../components/ScoreDial';
import { TagInput } from '../components/TagInput';
import { useNativeDialog } from './useNativeDialog';
import { useScoreScale } from '../hooks/useScoreScale';
import { gradeFromStars, resolveGrade, starsFromGrade } from '../../core/utils/scoreScale';

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
  /** Busca un juego ya guardado con ese nombre en cualquier lista, ignorando el id del que se está editando. */
  findDuplicate: (name: string, ignoreId?: number) => { tab: TabId; game: GameItem } | null;
  onClose: () => void;
  onSave: (draft: GameDraft) => void;
}

const supportsScore = (tab: TabId) => tab === 'c' || tab === 'p';
// La vergüenza puede registrar horas siempre (no afecta a la ruleta); su puntuación va tras el check `scored`.
const supportsHours = (tab: TabId) => tab === 'c' || tab === 'v';
const supportsYears = (tab: TabId) => tab === 'c';
const supportsReview = (tab: TabId) => tab !== 'p';
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

const REVIEW_MAX_LENGTH = 25000;

/** Lo que dura en pantalla el resumen de errores del pie antes de retirarse solo. */
const FORM_SUMMARY_TIMEOUT_MS = 5000;

/**
 * Errores del formulario: cada campo guarda SU mensaje, no un booleano. El texto se pinta bajo el campo y, todos
 * juntos y en este orden, en el resumen del pie del modal. Antes eran banderas y el único texto era un "revisa
 * los campos marcados" que además salía en el banner de la página, es decir, detrás del `<dialog>`.
 */
type FieldKey = 'name' | 'genres' | 'platforms' | 'years' | 'score' | 'hours';
type FieldErrorMap = Partial<Record<FieldKey, string>>;

const FIELD_ORDER: FieldKey[] = ['name', 'genres', 'platforms', 'years', 'score', 'hours'];

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
  return year > 0 && year <= new Date().getFullYear();
}

/**
 * Lee el campo de horas. Devuelve `null` si está vacío (sin dato) y `invalid` si lo escrito no es un número
 * utilizable. La coma decimal vale ("12,5"), y el signo menos no puede llegar hasta aquí: el `onChange` lo filtra.
 */
function parseHours(text: string): { invalid: boolean; value: number | null } {
  const trimmed = text.trim();
  if (!trimmed) return { invalid: false, value: null };
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return { invalid: true, value: null };
  return { invalid: false, value: parsed };
}

/** Texto del campo de horas a partir del borrador (vacío cuando no hay dato). */
function hoursToText(hours: number | null | undefined): string {
  return typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? String(hours) : '';
}

export function FormModal({ open, draft: initialDraft, currentTab, lookups, findDuplicate, onClose, onSave }: FormModalProps) {
  const boolField = getTabBoolField(currentTab);
  const scoreScale = useScoreScale();
  // P3: el borrador vive LOCAL al modal y solo se emite en `onSave`. Antes cada pulsación llamaba a `onDraftChange`
  // (estado del VM) → re-render de todo el árbol (App/GameTable). Ahora solo re-renderiza el propio modal.
  const [draft, setLocalDraft] = useState<GameDraft>(initialDraft);
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
  // A11y-1: `<dialog>` nativo en modo modal → focus trap, restauración de foco, `::backdrop` y Esc → onClose.
  const dialogRef = useNativeDialog(open, onClose);
  const reviewCount = draft.review.length;
  const reviewProgress = Math.min(100, Math.round((reviewCount / REVIEW_MAX_LENGTH) * 100));
  const reviewProgressClass = reviewProgress >= 100 ? 'has-error' : reviewProgress >= 90 ? 'has-warning' : '';
  // A11y-3: mensaje anunciado por SR solo en umbrales (texto constante por banda → no se reanuncia por tecla).
  const reviewLiveMessage =
    reviewProgress >= 100 ? UI_MESSAGES.form.charLimitReached : reviewProgress >= 90 ? UI_MESSAGES.form.charNearLimit : '';

  /**
   * Juego ya guardado con este mismo nombre (en cualquier lista, ignorando el que se está editando). Se calcula
   * mientras se escribe para avisar antes de rellenar el resto del formulario, no solo al pulsar Guardar.
   */
  const duplicate = useMemo(() => findDuplicate(draft.name, draft.id), [findDuplicate, draft.name, draft.id]);
  const duplicateMessage = duplicate
    ? VALIDATION_MESSAGES.duplicateName(duplicate.game.name, TAB_TOOLTIPS[duplicate.tab])
    : '';

  useEffect(() => {
    // Re-seedea el borrador local desde la prop al abrir o cambiar de juego/pestaña (la prop solo cambia entonces).
    setLocalDraft(initialDraft);
    setPending(EMPTY_PENDING);
    setFieldErrors({});
    setSummaryVisible(false);
    setHoursText(hoursToText(initialDraft.hours));
    setHoursNotice('');
  }, [open, initialDraft, currentTab]);

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
    setLocalDraft((prev) => ({ ...prev, [key]: mergeTags(prev[key] as string[], rawValues, lookupFor(key)) }));
    // El campo NO se toca aquí: `TagInput` ya ha decidido qué queda escrito (nada tras un Enter, y el trozo a
    // medias tras un separador). Vaciarlo desde aquí se comía lo escrito después de la coma ("pc; switch").
    if (key === 'genres' || key === 'platforms') clearFieldError(key);
  };

  /** Igual que `addTextTags` pero para los años: los que no son un año válido no entran y explican por qué. */
  const addYearTags = (rawValues: string[]) => {
    const invalid = rawValues.filter((value) => !isValidYearValue(value));
    const valid = rawValues.filter(isValidYearValue).map(Number);

    if (valid.length) {
      setLocalDraft((prev) => ({ ...prev, years: [...new Set([...prev.years, ...valid])].sort((a, b) => a - b) }));
    }

    if (invalid.length) {
      setFieldErrors((prev) => ({ ...prev, years: VALIDATION_MESSAGES.yearInvalid(new Date().getFullYear()) }));
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
    const cleaned = raw.replace(/[^\d.,]/g, '');
    setHoursText(cleaned);

    // Si lo tecleado o pegado traía un menos se dice: se ha filtrado, no ignorado en silencio. El aviso no se va
    // con la siguiente tecla (duraría un fotograma y nadie llegaría a leerlo): se queda hasta vaciar o guardar.
    if (/-/.test(raw)) setHoursNotice(VALIDATION_MESSAGES.hoursNegative);
    else if (!cleaned) setHoursNotice('');

    const { invalid, value } = parseHours(cleaned);
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

  const runSave = () => {
    const nextDraft: GameDraft = {
      ...draft,
      genres: [...draft.genres],
      platforms: [...draft.platforms],
      years: [...draft.years],
      strengths: [...draft.strengths],
      weaknesses: [...draft.weaknesses],
      reasons: [...draft.reasons],
    };

    // Vergüenza con la puntuación desactivada: nota y espejo a 0 antes de emitir. Así la ruleta la trata como
    // neutra y la actividad social la publica "sin puntuar" (misma fuente de verdad que el guardado del VM).
    if (currentTab === 'v' && !nextDraft.scored) {
      nextDraft.score = 0;
      nextDraft.grade = 0;
    }

    const errors: FieldErrorMap = {};

    // Lo que quedó escrito en un campo de etiquetas SIN pulsar Enter también se guarda: es el error más habitual
    // (escribir el género y darle directamente a Guardar).
    for (const key of tagKeys) {
      const parts = splitTagInput(pending[key]);
      if (!parts.length) continue;

      if (key === 'years') {
        const valid = parts.filter(isValidYearValue).map(Number);
        if (valid.length) nextDraft.years = [...new Set([...nextDraft.years, ...valid])].sort((a, b) => a - b);
        if (parts.some((value) => !isValidYearValue(value))) {
          errors.years = VALIDATION_MESSAGES.yearInvalid(new Date().getFullYear());
        } else {
          setPendingValue('years', '');
        }
        continue;
      }

      nextDraft[key] = mergeTags(nextDraft[key] as string[], parts, lookupFor(key));
      setPendingValue(key, '');
    }

    const hours = parseHours(hoursText);
    if (hours.invalid) errors.hours = VALIDATION_MESSAGES.hoursInvalid;
    else nextDraft.hours = hours.value;

    // El duplicado corta el guardado antes que el resto de validaciones: no tiene sentido pedir que se completen
    // los campos obligatorios de un juego que ya está en las listas.
    const duplicateOnSave = findDuplicate(nextDraft.name, nextDraft.id);
    if (duplicateOnSave) {
      const message = VALIDATION_MESSAGES.duplicateName(duplicateOnSave.game.name, TAB_TOOLTIPS[duplicateOnSave.tab]);
      setFieldErrors({ name: message });
      showSummary();
      focusFirstError({ name: message });
      return;
    }

    if (!nextDraft.name.trim()) errors.name = VALIDATION_MESSAGES.nameRequired;
    if (!nextDraft.genres.length) errors.genres = VALIDATION_MESSAGES.genresRequired;
    if (!nextDraft.platforms.length) errors.platforms = VALIDATION_MESSAGES.platformsRequired;
    if (supportsYears(currentTab) && !nextDraft.years.length && !errors.years) errors.years = VALIDATION_MESSAGES.yearsRequired;
    // Completados requieren puntuación: vale la nota efectiva (estrellas o dial), sea cual sea la escala.
    if (currentTab === 'c' && resolveGrade({ grade: nextDraft.grade, score: nextDraft.score }) <= 0) {
      errors.score = VALIDATION_MESSAGES.scoreRequired;
    }

    setFieldErrors(errors);
    if (FIELD_ORDER.some((key) => errors[key])) {
      showSummary();
      focusFirstError(errors);
      return;
    }

    setSummaryVisible(false);
    setLocalDraft(nextDraft);
    setHoursText(hoursToText(nextDraft.hours));
    setHoursNotice('');
    onSave(nextDraft);
  };

  const errorSummary = summaryVisible
    ? FIELD_ORDER.map((key) => fieldErrors[key]).filter((message): message is string => Boolean(message))
    : [];

  const hoursField = (
    <div className="fg">
      <label htmlFor="draft-hours" className="flabel">{UI_MESSAGES.form.hoursLabel}</label>
      <input
        id="draft-hours"
        className={`finput ${fieldErrors.hours ? 'has-error' : hoursNotice ? 'has-warning' : ''}`.trim()}
        // `text` + `inputMode="decimal"`: teclado numérico en el móvil, coma decimal admitida y —lo importante—
        // control total de lo que entra, que es lo que deja fuera el signo menos (`type="number"` sí lo acepta).
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={UI_MESSAGES.form.hoursPlaceholder}
        value={hoursText}
        aria-invalid={fieldErrors.hours ? true : undefined}
        aria-describedby={fieldErrors.hours || hoursNotice ? 'draft-hours-error' : undefined}
        onChange={(event) => handleHoursChange(event.target.value)}
      />
      {fieldErrors.hours || hoursNotice ? (
        <small id="draft-hours-error" className={`tag-hint ${fieldErrors.hours ? 'is-error' : 'is-warning'}`}>
          {fieldErrors.hours || hoursNotice}
        </small>
      ) : (
        <small className="tag-hint tag-hint--spacer" aria-hidden="true">{UI_MESSAGES.form.enterToAddHint}</small>
      )}
    </div>
  );

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-label={initialDraft.id ? UI_MESSAGES.form.editTitle : UI_MESSAGES.form.newTitle}
      onMouseDown={(event) => {
        // Click en el backdrop (fuera de .modal) → cerrar; el target es el propio <dialog>.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
      <div className="modal">
        <div className="modal-hd">
          <div className="modal-title">{draft.id ? UI_MESSAGES.form.editTitle : UI_MESSAGES.form.newTitle}</div>
          <button
            className="btn-icon"
            type="button"
            aria-label={UI_MESSAGES.form.close}
            title={UI_MESSAGES.form.close}
            onClick={onClose}
          >
            <Icon name={COMMON_ICONS.close} />
          </button>
        </div>
        <div className="modal-body">
          <div className="frow">
            <div className="fg">
              <label htmlFor="draft-name" className="flabel">{UI_MESSAGES.form.nameLabel}</label>
              <input
                id="draft-name"
                className={`finput ${fieldErrors.name || duplicate ? 'has-error' : ''}`.trim()}
                value={draft.name}
                placeholder={UI_MESSAGES.form.namePlaceholder}
                aria-invalid={duplicate || fieldErrors.name ? true : undefined}
                aria-describedby={duplicate || fieldErrors.name ? 'draft-name-error' : undefined}
                onChange={(event) => {
                  clearFieldError('name');
                  setLocalDraft({ ...draft, name: event.target.value });
                }}
              />
              {duplicate || fieldErrors.name ? (
                <small id="draft-name-error" className="tag-hint is-error" role="alert">
                  {duplicateMessage || fieldErrors.name}
                </small>
              ) : (
                <small className="tag-hint tag-hint--spacer" aria-hidden="true">{UI_MESSAGES.form.enterToAddHint}</small>
              )}
            </div>
            <TagInput
              label={UI_MESSAGES.form.genresLabel}
              required
              inputId="draft-genres"
              listId="dl-genres"
              placeholder={UI_MESSAGES.form.genresPlaceholder}
              values={draft.genres}
              pendingValue={pending.genres}
              onPendingValueChange={(value) => setPendingValue('genres', value)}
              onAdd={(values) => addTextTags('genres', values)}
              onRemove={(value) => removeTextTag('genres', value)}
              chipClassName="chip-genre"
              hint={UI_MESSAGES.form.enterToAddHint}
              errorMessage={fieldErrors.genres}
            />
          </div>

          <div className="frow">
            <TagInput
              label={UI_MESSAGES.form.platformsLabel}
              required
              inputId="draft-platforms"
              listId="dl-platforms"
              placeholder={UI_MESSAGES.form.platformsPlaceholder}
              values={draft.platforms}
              pendingValue={pending.platforms}
              onPendingValueChange={(value) => setPendingValue('platforms', value)}
              onAdd={(values) => addTextTags('platforms', values)}
              onRemove={(value) => removeTextTag('platforms', value)}
              chipClassName="chip-plat"
              hint={UI_MESSAGES.form.enterToAddHint}
              errorMessage={fieldErrors.platforms}
            />
            {supportsScore(currentTab) ? (
              <div className="fg fg-score-field">
                <label className="flabel">{currentTab === 'p' ? UI_MESSAGES.form.interestLabel : UI_MESSAGES.form.scoreLabel} {currentTab === 'c' ? '*' : ''}</label>
                <div className={`score-input-shell ${fieldErrors.score ? 'has-error' : ''}`.trim()}>
                  {scoreScale === 'grade' ? (
                    <ScoreDial
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
                {!fieldErrors.score ? <small className="tag-hint tag-hint--spacer" aria-hidden="true">{UI_MESSAGES.form.enterToAddHint}</small> : null}
              </div>
            ) : null}
          </div>

          {supportsYears(currentTab) ? (
            <div className="frow">
              <TagInput
                label={UI_MESSAGES.form.yearsLabel}
                required
                inputId="draft-years"
                placeholder={UI_MESSAGES.form.yearsPlaceholder(new Date().getFullYear())}
                values={draft.years}
                pendingValue={pending.years}
                onPendingValueChange={(value) => setPendingValue('years', value)}
                onAdd={(values) => addYearTags(values)}
                onRemove={(value) => {
                  setLocalDraft({ ...draft, years: draft.years.filter((entry) => entry !== Number(value)) });
                }}
                chipClassName="chip-generic"
                hint={UI_MESSAGES.form.enterToAddHint}
                errorMessage={fieldErrors.years}
              />
              {supportsHours(currentTab) ? hoursField : null}
            </div>
          ) : null}

          {supportsStrengths(currentTab) || supportsWeaknesses(currentTab) || supportsReasons(currentTab) ? (
            <div className="frow">
              {supportsStrengths(currentTab) ? (
                <TagInput
                  label={UI_MESSAGES.form.strengthsLabel}
                  inputId="draft-strengths"
                  listId="dl-strengths"
                  placeholder={UI_MESSAGES.form.strengthsPlaceholder}
                  values={draft.strengths}
                  pendingValue={pending.strengths}
                  onPendingValueChange={(value) => setPendingValue('strengths', value)}
                  onAdd={(values) => addTextTags('strengths', values)}
                  onRemove={(value) => removeTextTag('strengths', value)}
                  chipClassName="chip-pf"
                  hint={UI_MESSAGES.form.enterToAddHint}
                />
              ) : null}

              {supportsWeaknesses(currentTab) ? (
                <TagInput
                  label={UI_MESSAGES.form.weaknessesLabel}
                  inputId="draft-weaknesses"
                  listId="dl-weaknesses"
                  placeholder={UI_MESSAGES.form.weaknessesPlaceholder}
                  values={draft.weaknesses}
                  pendingValue={pending.weaknesses}
                  onPendingValueChange={(value) => setPendingValue('weaknesses', value)}
                  onAdd={(values) => addTextTags('weaknesses', values)}
                  onRemove={(value) => removeTextTag('weaknesses', value)}
                  chipClassName="chip-pd"
                  hint={UI_MESSAGES.form.enterToAddHint}
                />
              ) : null}

              {supportsReasons(currentTab) ? (
                <TagInput
                  label={UI_MESSAGES.form.reasonsLabel}
                  inputId="draft-reasons"
                  listId="dl-weaknesses"
                  placeholder={UI_MESSAGES.form.reasonsPlaceholder}
                  values={draft.reasons}
                  pendingValue={pending.reasons}
                  onPendingValueChange={(value) => setPendingValue('reasons', value)}
                  onAdd={(values) => addTextTags('reasons', values)}
                  onRemove={(value) => removeTextTag('reasons', value)}
                  chipClassName="chip-pd"
                  hint={UI_MESSAGES.form.enterToAddHint}
                />
              ) : null}
            </div>
          ) : null}

          {currentTab === 'v' ? (
            <div className="frow">
              <div className="fg fg-score-field">
                <label className="flabel">{UI_MESSAGES.form.scoreLabel}</label>
                <button
                  type="button"
                  className={`btn btn-toggle ${draft.scored ? 'active' : ''}`.trim()}
                  aria-pressed={draft.scored}
                  onClick={() =>
                    setLocalDraft((prev) => {
                      const scored = !prev.scored;
                      if (!scored) return { ...prev, scored: false };
                      // Al activar: conserva la nota si ya la había (p. ej. migrada), si no parte de 3★ ≡ nota 60.
                      const hasScore = (typeof prev.grade === 'number' && prev.grade > 0) || prev.score > 0;
                      return hasScore ? { ...prev, scored: true } : { ...prev, scored: true, score: 3, grade: 60 };
                    })
                  }
                >
                  <Icon name={COMMON_ICONS.star} />
                  <span>{UI_MESSAGES.form.scoreToggle}</span>
                </button>
                {draft.scored ? (
                  <div className="score-input-shell">
                    {scoreScale === 'grade' ? (
                      <ScoreDial
                        value={typeof draft.grade === 'number' ? draft.grade : gradeFromStars(draft.score)}
                        onChange={(g) => setLocalDraft({ ...draft, grade: g, score: starsFromGrade(g) })}
                      />
                    ) : (
                      <StarPicker value={draft.score} onChange={(v) => setLocalDraft({ ...draft, score: v, grade: gradeFromStars(v) })} />
                    )}
                  </div>
                ) : (
                  <small className="tag-hint">{UI_MESSAGES.form.scoreToggleHint}</small>
                )}
              </div>
              {hoursField}
            </div>
          ) : null}

          <div className="frow">
            <div className="fg">
              <button
                className={`btn btn-toggle btn-toggle-deck ${draft.steamDeck ? 'active' : ''}`}
                type="button"
                aria-label={UI_MESSAGES.form.steamDeck}
                onClick={() => setLocalDraft({ ...draft, steamDeck: !draft.steamDeck })}
              >
                <Icon name={COMMON_ICONS.steamDeck} />
                <span>{UI_MESSAGES.form.steamDeck}</span>
              </button>
            </div>
            {boolField ? (
              <div className="fg">
                <button
                  className={`btn btn-toggle ${
                    (boolField === 'replayable' ? draft.replayable : draft.retry) ? 'active' : ''
                  }`}
                  type="button"
                  aria-label={FILTER_BOOL[currentTab]?.label}
                  onClick={() => {
                    if (boolField === 'replayable') setLocalDraft({ ...draft, replayable: !draft.replayable });
                    if (boolField === 'retry') setLocalDraft({ ...draft, retry: !draft.retry });
                  }}
                >
                  <Icon name={boolField === 'replayable' ? COMMON_ICONS.repeat : COMMON_ICONS.undo} />
                  <span>{FILTER_BOOL[currentTab]?.label}</span>
                </button>
              </div>
            ) : null}
          </div>

          {supportsReview(currentTab) ? (
            <div className="fg">
              <label htmlFor="draft-review" className="flabel">{UI_MESSAGES.form.reviewLabel}</label>
              <textarea
                id="draft-review"
                className="ftextarea"
                maxLength={REVIEW_MAX_LENGTH}
                value={draft.review}
                placeholder={UI_MESSAGES.form.reviewPlaceholder}
                onChange={(event) => {
                  const nextReview = event.target.value.slice(0, REVIEW_MAX_LENGTH);
                  setLocalDraft({ ...draft, review: nextReview });
                }}
              />
              <div className="field-footer">
                {/* A11y-3: conteo visible sin aria-live (ya no se anuncia por pulsación). */}
                <small className={`tag-hint ${reviewProgressClass}`.trim()}>
                  {UI_MESSAGES.form.charCount(reviewCount, REVIEW_MAX_LENGTH)}
                </small>
                {/* Región viva exclusiva para SR: solo lleva texto en los umbrales (90% / 100%). */}
                <span className="sr-only" role="status" aria-live="polite">
                  {reviewLiveMessage}
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="modal-ft">
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
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            {UI_MESSAGES.form.cancel}
          </button>
          <button className="btn btn-steam" type="button" onClick={runSave}>
            {UI_MESSAGES.form.save}
          </button>
        </div>
      </div>
      ) : null}
    </dialog>
  );
}
