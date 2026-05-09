import { useEffect, useMemo, useState } from 'react';
import { UI_MESSAGES, VALIDATION_MESSAGES } from '../../core/constants/labels';
import { Icon } from '../components/Icon';
import { COMMON_ICONS } from '../../core/constants/icons';

interface AdminModalProps {
  open: boolean;
  adminTab: 'genres' | 'platforms' | 'strengths' | 'weaknesses';
  lookups: {
    genres: string[];
    platforms: string[];
    strengths: string[];
    weaknesses: string[];
  };
  onClose: () => void;
  onTabChange: (tab: 'genres' | 'platforms' | 'strengths' | 'weaknesses') => void;
  onEdit: (key: 'genres' | 'platforms' | 'strengths' | 'weaknesses', oldValue: string, newValue: string) => void;
  onDelete: (key: 'genres' | 'platforms' | 'strengths' | 'weaknesses', value: string) => void;
}

const TAB_LABELS: Record<string, string> = {
  genres: 'Géneros',
  platforms: 'Plataformas',
  strengths: 'Puntos fuertes',
  weaknesses: 'Puntos débiles / razón',
};

export function AdminModal({ open, adminTab, lookups, onClose, onTabChange, onEdit, onDelete }: AdminModalProps) {
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [mergePending, setMergePending] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; message: string } | null>(null);

  const list = useMemo(() => {
    if (adminTab === 'genres') return lookups.genres;
    if (adminTab === 'platforms') return lookups.platforms;
    if (adminTab === 'strengths') return lookups.strengths;
    return lookups.weaknesses;
  }, [adminTab, lookups]);

  useEffect(() => {
    setEditingTag(null);
    setDraftValue('');
    setMergePending(false);
    setNotice(null);
  }, [adminTab, open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const startEdit = (tag: string) => {
    setEditingTag(tag);
    setDraftValue(tag);
    setMergePending(false);
    setNotice(null);
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setDraftValue('');
    setMergePending(false);
  };

  const saveEdit = () => {
    if (!editingTag) return;
    const nextValue = draftValue.trim();
    if (!nextValue || nextValue.toLowerCase() === editingTag.toLowerCase()) {
      cancelEdit();
      return;
    }

    const duplicate = list.find((tag) => tag.toLowerCase() === nextValue.toLowerCase());
    if (duplicate && !mergePending) {
      setMergePending(true);
      setNotice({ kind: 'warn', message: VALIDATION_MESSAGES.tagExists });
      return;
    }

    onEdit(adminTab, editingTag, nextValue);
    setNotice({
      kind: 'ok',
      message: duplicate ? VALIDATION_MESSAGES.tagMerged : VALIDATION_MESSAGES.tagUpdated,
    });
    cancelEdit();
  };

  return (
    <div
      className="modal-ov active"
      role="button"
      tabIndex={0}
      aria-label="Cerrar modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="modal">
        <div className="modal-hd">
          <div className="modal-title">Administración de filtros</div>
          <button className="btn-icon" type="button" onClick={onClose}>
            <Icon name={COMMON_ICONS.close} />
          </button>
        </div>
        <div className="modal-body">
          <div className="admin-tabs">
            {(['genres', 'platforms', 'strengths', 'weaknesses'] as const).map((key) => (
              <button
                key={key}
                className={`tab-btn admin-tab ${adminTab === key ? 'active' : ''}`}
                type="button"
                onClick={() => onTabChange(key)}
              >
                {TAB_LABELS[key]}
              </button>
            ))}
          </div>
          {notice ? <div className={`admin-warning show ${notice.kind}`}>{notice.message}</div> : null}
          <div className="fg">
            {list.length ? list.map((tag) => (
              <div key={tag} className={`admin-item ${editingTag === tag ? 'editing' : ''}`}>
                {editingTag === tag ? (
                  <>
                    <input
                      type="text"
                      className={`finput ${mergePending ? 'has-warning' : ''}`.trim()}
                      value={draftValue}
                      placeholder={UI_MESSAGES.admin.editPlaceholder}
                      onChange={(event) => setDraftValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        saveEdit();
                      }}
                    />
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-icon-text admin-action-btn" type="button" onClick={cancelEdit}>
                        <Icon name={COMMON_ICONS.close} />
                        <span>{UI_MESSAGES.admin.editCancelBtn}</span>
                      </button>
                      <button className="btn btn-steam btn-icon-text admin-action-btn" type="button" onClick={saveEdit}>
                        <Icon name={COMMON_ICONS.save} />
                        <span>{UI_MESSAGES.admin.editSaveBtn}</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="admin-item-name">{tag}</span>
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-icon-text admin-action-btn" type="button" onClick={() => startEdit(tag)}>
                        <Icon name={COMMON_ICONS.edit} />
                        <span>Editar</span>
                      </button>
                      <button className="btn btn-danger btn-icon-text admin-action-btn" type="button" onClick={() => onDelete(adminTab, tag)}>
                        <Icon name={COMMON_ICONS.trash} />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )) : <span style={{ color: 'var(--text-muted)' }}>{UI_MESSAGES.admin.noTags}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
