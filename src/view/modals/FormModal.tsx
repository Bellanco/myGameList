import { useEffect, useMemo, useState } from 'react';
import { FILTER_BOOL, UI_MESSAGES, VALIDATION_MESSAGES } from '../../core/constants/labels';
import { COMMON_ICONS } from '../../core/constants/icons';
import type { GameDraft, TabId } from '../../viewmodel/useGameListViewModel';
import { Icon } from '../components/Icon';
import { StarPicker } from '../components/StarPicker';
import { TagInput } from '../components/TagInput';

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
  onClose: () => void;
  onDraftChange: (draft: GameDraft) => void;
  onSave: (draft: GameDraft) => void;
  onNotice: (kind: 'ok' | 'warn' | 'err', message: string) => void;
}

const supportsScore = (tab: TabId) => tab === 'c' || tab === 'p';
const supportsHours = (tab: TabId) => tab === 'c';
const supportsYears = (tab: TabId) => tab === 'c';
const supportsReview = (tab: TabId) => tab !== 'p';
const supportsStrengths = (tab: TabId) => tab === 'c' || tab === 'v' || tab === 'e';
const supportsWeaknesses = (tab: TabId) => tab === 'c' || tab === 'e';
const supportsReasons = (tab: TabId) => tab === 'v';

function getTabBoolField(tab: TabId): 'replayable' | 'retry' | null {
  return FILTER_BOOL[tab]?.field || null;
}

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

type FieldErrorMap = {
  name?: boolean;
  genres?: boolean;
  platforms?: boolean;
  years?: boolean;
  score?: boolean;
};

function getCanonicalTag(lookup: string[], value: string): string {
  const lower = value.toLowerCase();
  const existing = lookup.find((entry) => entry.toLowerCase() === lower);
  return existing || value;
}

function hasTagValue(values: string[], value: string): boolean {
  const lower = value.toLowerCase();
  return values.some((entry) => entry.toLowerCase() === lower);
}

function isValidYearValue(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year > 0 && year <= new Date().getFullYear();
}

export function FormModal({ open, draft, currentTab, lookups, onClose, onDraftChange, onSave, onNotice }: FormModalProps) {
  if (!open) return null;

  const boolField = getTabBoolField(currentTab);
  const [pending, setPending] = useState<PendingTagFields>(EMPTY_PENDING);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [yearWarningShown, setYearWarningShown] = useState(false);

  useEffect(() => {
    setPending(EMPTY_PENDING);
    setFieldErrors({});
    setYearWarningShown(false);
  }, [open, draft.id, currentTab]);

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

  const commitTextTag = (
    key: 'genres' | 'platforms' | 'strengths' | 'weaknesses' | 'reasons',
    lookup: string[],
    values: string[],
  ): boolean => {
    const rawValue = pending[key].trim();
    if (!rawValue) return true;
    const finalValue = getCanonicalTag(lookup, rawValue);
    if (!hasTagValue(values, finalValue)) {
      onDraftChange({ ...draft, [key]: [...values, finalValue] });
    }
    setPending((prev) => ({ ...prev, [key]: '' }));
    setFieldErrors((prev) => ({ ...prev, [key]: false }));
    return true;
  };

  const commitYearTag = (source: 'enter' | 'save'): boolean => {
    const rawValue = pending.years.trim();
    if (!rawValue) return true;

    if (!isValidYearValue(rawValue)) {
      if (!yearWarningShown) {
        setYearWarningShown(true);
        onNotice('warn', VALIDATION_MESSAGES.yearInvalid);
        return false;
      }

      if (source === 'save') {
        setPending((prev) => ({ ...prev, years: '' }));
        setYearWarningShown(false);
        return true;
      }

      setPending((prev) => ({ ...prev, years: '' }));
      setYearWarningShown(false);
      return false;
    }

    const parsed = Number(rawValue);
    if (!draft.years.includes(parsed)) {
      onDraftChange({ ...draft, years: [...draft.years, parsed].sort((a, b) => a - b) });
    }
    setPending((prev) => ({ ...prev, years: '' }));
    setYearWarningShown(false);
    setFieldErrors((prev) => ({ ...prev, years: false }));
    return true;
  };

  const removeTextTag = (
    key: 'genres' | 'platforms' | 'strengths' | 'weaknesses' | 'reasons',
    value: string | number,
  ) => {
    const asString = String(value);
    onDraftChange({
      ...draft,
      [key]: draft[key].filter((entry) => entry !== asString),
    });
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

    let blocked = false;
    for (const key of tagKeys) {
      if (key === 'years') {
        const committed = commitYearTag('save');
        if (!committed) blocked = true;
        continue;
      }

      const lookup = key === 'genres'
        ? lookups.genres
        : key === 'platforms'
          ? lookups.platforms
          : key === 'strengths'
            ? lookups.strengths
            : lookups.weaknesses;

      const values = nextDraft[key] as string[];
      const rawValue = pending[key].trim();
      if (!rawValue) continue;
      const finalValue = getCanonicalTag(lookup, rawValue);
      if (!hasTagValue(values, finalValue)) {
        (nextDraft[key] as string[]).push(finalValue);
      }
      setPending((prev) => ({ ...prev, [key]: '' }));
    }

    if (blocked) return;

    const errors: FieldErrorMap = {};
    if (!nextDraft.name.trim()) errors.name = true;
    if (!nextDraft.genres.length) errors.genres = true;
    if (!nextDraft.platforms.length) errors.platforms = true;
    if (supportsYears(currentTab) && !nextDraft.years.length) errors.years = true;
    if (currentTab === 'c' && Number(nextDraft.score || 0) <= 0) errors.score = true;

    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      onNotice('warn', VALIDATION_MESSAGES.fieldsInvalid);
      return;
    }

    if (nextDraft.hours != null && (!Number.isFinite(nextDraft.hours) || Number(nextDraft.hours) < 0)) {
      onNotice('warn', VALIDATION_MESSAGES.fieldsInvalid);
      return;
    }

    onDraftChange(nextDraft);
    onSave(nextDraft);
  };

  return (
    <div className="modal-ov active">
      <div className="modal">
        <div className="modal-hd">
          <div className="modal-title">{draft.id ? 'Editar juego' : 'Nuevo juego'}</div>
          <button className="btn-icon" type="button" onClick={onClose}>
            <Icon name={COMMON_ICONS.close} />
          </button>
        </div>
        <div className="modal-body">
          <div className="frow">
            <div className="fg">
              <label className="flabel">Nombre *</label>
              <input
                className={`finput ${fieldErrors.name ? 'has-error' : ''}`.trim()}
                value={draft.name}
                onChange={(event) => {
                  setFieldErrors((prev) => ({ ...prev, name: false }));
                  onDraftChange({ ...draft, name: event.target.value });
                }}
              />
            </div>
            <TagInput
              label="Géneros"
              required
              listId="dl-genres"
              placeholder="Ej: Acción"
              values={draft.genres}
              pendingValue={pending.genres}
              onPendingValueChange={(value) => setPendingValue('genres', value)}
              onAdd={() => {
                commitTextTag('genres', lookups.genres, draft.genres);
              }}
              onRemove={(value) => removeTextTag('genres', value)}
              chipClassName="chip-genre"
              invalid={Boolean(fieldErrors.genres)}
            />
          </div>

          <div className="frow">
            <TagInput
              label="Plataformas"
              required
              listId="dl-platforms"
              placeholder="Ej: PC"
              values={draft.platforms}
              pendingValue={pending.platforms}
              onPendingValueChange={(value) => setPendingValue('platforms', value)}
              onAdd={() => {
                commitTextTag('platforms', lookups.platforms, draft.platforms);
              }}
              onRemove={(value) => removeTextTag('platforms', value)}
              chipClassName="chip-plat"
              invalid={Boolean(fieldErrors.platforms)}
            />
            {supportsScore(currentTab) ? (
              <div className="fg fg-score-field">
                <label className="flabel">{currentTab === 'p' ? 'Interés' : 'Puntuación'} {currentTab === 'c' ? '*' : ''}</label>
                <div className={`score-input-shell ${fieldErrors.score ? 'has-error' : ''}`.trim()}>
                  <StarPicker value={draft.score} onChange={(v) => onDraftChange({ ...draft, score: v })} />
                </div>
                {fieldErrors.score ? <small className="tag-hint" style={{ color: 'var(--danger)' }}>Selecciona una puntuación</small> : null}
              </div>
            ) : null}
          </div>

          {supportsYears(currentTab) ? (
            <div className="frow">
              <TagInput
                label="Años completado"
                required
                placeholder={`Ej: ${new Date().getFullYear()}`}
                values={draft.years}
                pendingValue={pending.years}
                onPendingValueChange={(value) => setPendingValue('years', value)}
                onAdd={() => {
                  commitYearTag('enter');
                }}
                onRemove={(value) => {
                  onDraftChange({ ...draft, years: draft.years.filter((entry) => entry !== Number(value)) });
                }}
                chipClassName="chip-generic"
                hint={UI_MESSAGES.form.yearsHint}
                invalid={Boolean(fieldErrors.years)}
                warning={yearWarningShown}
              />
              {supportsHours(currentTab) ? (
                <div className="fg">
                  <label className="flabel">Horas jugadas</label>
                  <input
                    className="finput"
                    value={draft.hours ?? ''}
                    onChange={(event) =>
                      onDraftChange({
                        ...draft,
                        hours: event.target.value ? Number(event.target.value.replace(',', '.')) : null,
                      })
                    }
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {supportsStrengths(currentTab) || supportsWeaknesses(currentTab) || supportsReasons(currentTab) ? (
            <div className="frow">
              {supportsStrengths(currentTab) ? (
                <TagInput
                  label="Puntos fuertes"
                  listId="dl-strengths"
                  placeholder="Ej: Combate"
                  values={draft.strengths}
                  pendingValue={pending.strengths}
                  onPendingValueChange={(value) => setPendingValue('strengths', value)}
                  onAdd={() => {
                    commitTextTag('strengths', lookups.strengths, draft.strengths);
                  }}
                  onRemove={(value) => removeTextTag('strengths', value)}
                  chipClassName="chip-pf"
                />
              ) : null}

              {supportsWeaknesses(currentTab) ? (
                <TagInput
                  label="Puntos débiles"
                  listId="dl-weaknesses"
                  placeholder="Ej: Repetitivo"
                  values={draft.weaknesses}
                  pendingValue={pending.weaknesses}
                  onPendingValueChange={(value) => setPendingValue('weaknesses', value)}
                  onAdd={() => {
                    commitTextTag('weaknesses', lookups.weaknesses, draft.weaknesses);
                  }}
                  onRemove={(value) => removeTextTag('weaknesses', value)}
                  chipClassName="chip-pd"
                />
              ) : null}

              {supportsReasons(currentTab) ? (
                <TagInput
                  label="Razones"
                  listId="dl-weaknesses"
                  placeholder="Ej: Falta de tiempo"
                  values={draft.reasons}
                  pendingValue={pending.reasons}
                  onPendingValueChange={(value) => setPendingValue('reasons', value)}
                  onAdd={() => {
                    commitTextTag('reasons', lookups.weaknesses, draft.reasons);
                  }}
                  onRemove={(value) => removeTextTag('reasons', value)}
                  chipClassName="chip-pd"
                />
              ) : null}
            </div>
          ) : null}

          <div className="frow">
            <div className="fg">
              <label className="flabel">Steam Deck</label>
              <button
                className={`btn btn-toggle ${draft.steamDeck ? 'active btn-toggle-deck' : ''}`}
                type="button"
                onClick={() => onDraftChange({ ...draft, steamDeck: !draft.steamDeck })}
              >
                <Icon name={COMMON_ICONS.steamDeck} />
                <span>Steam Deck</span>
              </button>
            </div>
            {boolField ? (
              <div className="fg">
                <label className="flabel">{FILTER_BOOL[currentTab]?.label}</label>
                <button
                  className={`btn btn-toggle ${
                    (boolField === 'replayable' ? draft.replayable : draft.retry) ? 'active' : ''
                  }`}
                  type="button"
                  onClick={() => {
                    if (boolField === 'replayable') onDraftChange({ ...draft, replayable: !draft.replayable });
                    if (boolField === 'retry') onDraftChange({ ...draft, retry: !draft.retry });
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
              <label className="flabel">Análisis</label>
              <textarea
                className="ftextarea"
                value={draft.review}
                onChange={(event) => onDraftChange({ ...draft, review: event.target.value })}
              />
            </div>
          ) : null}
        </div>
        <div className="modal-ft">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-steam" type="button" onClick={runSave}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
