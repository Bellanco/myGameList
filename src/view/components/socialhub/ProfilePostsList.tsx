import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { PostBody } from './PostText';
import { ConfirmModal } from '../../modals/ConfirmModal';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';

/** Lote inicial; se amplía por scroll infinito, como la lista de reseñas. */
const POST_PAGE_SIZE = 10;

/** Una publicación del perfil, tal y como llega del directorio. */
export interface ProfilePostEntry {
  id: string;
  text: string;
  /** Fecha de la publicación: la misma que enseña el feed, y la que una edición NO cambia. */
  updatedAt: number;
  /** Cuándo se editó por última vez; ausente si nunca. */
  editedAt?: number;
}

interface ProfilePostsListProps {
  SOCIAL_UI: SocialUiLabels;
  posts: ProfilePostEntry[];
  /** ¿Son tuyas? Solo entonces se ofrece borrar (y editar, si además `canEdit`). */
  own: boolean;
  /** ¿Tu rango publica? Bronce puede retirar lo que publicó, no reescribirlo: editar es publicar. */
  canEdit: boolean;
  maxLength: number;
  /** Mithril no lleva contador: no hay límite que mostrar. */
  showCounter: boolean;
  /** Id de la que se está guardando o borrando ahora mismo; vacío si ninguna. */
  changingPostId: string;
  /** Guarda el texto nuevo y dice si salió: `false` deja el editor abierto con lo escrito. */
  onEdit: (id: string, text: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

/**
 * EL EDITOR DE UNA PUBLICACIÓN. El borrador es estado local por la misma razón que en `FeedComposer`: escribir no
 * tiene por qué repintar la lista entera. Y quien lo cierra es él, solo cuando el guardado sale.
 */
function PostEditor({
  SOCIAL_UI,
  initialText,
  maxLength,
  showCounter,
  saving,
  onSave,
  onCancel,
}: {
  SOCIAL_UI: SocialUiLabels;
  initialText: string;
  maxLength: number;
  showCounter: boolean;
  saving: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  // Si el rango bajó desde que se escribió (oro → plata), el texto puede pasar del cupo actual: se recorta al
  // abrir, y el contador lo enseña al límite en vez de un «12.000 / 1.000» que no se puede guardar.
  const [text, setText] = useState(() => initialText.slice(0, maxLength));
  const ref = useRef<HTMLTextAreaElement>(null);

  // El mismo autocrecimiento que el compositor, con su tope en el CSS.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const unchanged = text.trim() === initialText.trim();
  const canSave = !saving && Boolean(text.trim()) && !unchanged;
  const progress = showCounter ? Math.min(100, Math.round((text.length / maxLength) * 100)) : 0;
  const progressClass = progress >= 100 ? 'has-error' : progress >= 90 ? 'has-warning' : '';

  return (
    <div className="hub-post-editor">
      <textarea
        ref={ref}
        className="ftextarea hub-post-input"
        aria-label={SOCIAL_UI.feed.postEditLabel}
        rows={1}
        value={text}
        maxLength={showCounter ? maxLength : undefined}
        onChange={(event) => setText(event.target.value.slice(0, maxLength))}
        onKeyDown={(event) => {
          // Mismos atajos que el compositor: Ctrl/⌘+Enter guarda, y Escape suelta el editor sin tocar nada.
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            if (canSave) onSave(text);
          } else if (event.key === 'Escape' && !saving) {
            event.preventDefault();
            onCancel();
          }
        }}
        disabled={saving}
      />
      <div className="hub-post-editor-foot">
        {showCounter ? (
          <small className={`tag-hint ${progressClass}`.trim()}>
            {SOCIAL_UI.feed.postCharCount(text.length, maxLength)}
          </small>
        ) : <span />}
        <div className="hub-post-actions">
          <button className="btn btn-quiet" type="button" onClick={onCancel} disabled={saving}>
            {SOCIAL_UI.feed.postEditCancel}
          </button>
          <button className="btn btn-steam" type="button" onClick={() => onSave(text)} disabled={!canSave}>
            {saving ? SOCIAL_UI.feed.postEditSaving : SOCIAL_UI.feed.postEditSave}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Las publicaciones de un perfil, de la más reciente a la más antigua. En el de otra persona se leen; en el tuyo,
 * cada una lleva Editar y Eliminar.
 *
 * Una edición conserva la fecha (y el sitio en el feed) y lo cuenta con la marca de «editado», que lleva en el
 * `title` cuándo fue.
 */
export const ProfilePostsList = memo(function ProfilePostsList({
  SOCIAL_UI,
  posts,
  own,
  canEdit,
  maxLength,
  showCounter,
  changingPostId,
  onEdit,
  onDelete,
}: ProfilePostsListProps) {
  const [editingId, setEditingId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState('');
  const [visibleCount, setVisibleCount] = useState(POST_PAGE_SIZE);
  const sentinelRef = useRef<HTMLButtonElement>(null);

  const visible = posts.slice(0, visibleCount);
  const hasMore = posts.length > visibleCount;

  useEffect(() => {
    if (!hasMore) return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((prev) => prev + POST_PAGE_SIZE);
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  const confirmDelete = async () => {
    const id = deleteTarget;
    setDeleteTarget('');
    if (id) await onDelete(id);
  };

  return (
    <>
      <div className="hub-feed-activity-list hub-profile-posts-list" role="list" aria-label={SOCIAL_UI.feed.postsListTitle}>
        {visible.map((post) => {
          const date = new Date(post.updatedAt || 0);
          const hasDate = post.updatedAt > 0 && !Number.isNaN(date.getTime());
          const edited = Number(post.editedAt || 0) > 0;
          const busy = changingPostId === post.id;
          const editing = editingId === post.id;
          return (
            <article key={post.id} className="hub-feed-card hub-feed-activity-item is-post hub-profile-post" role="listitem">
              <p className="hub-feed-date">
                {hasDate ? SOCIAL_UI.feed.postedAt(date) : SOCIAL_UI.feed.analyzedRecently}
                {edited ? (
                  <span className="hub-post-edited" title={SOCIAL_UI.feed.postEditedTitle(new Date(post.editedAt!))}>
                    {' · '}{SOCIAL_UI.feed.postEdited}
                  </span>
                ) : null}
              </p>
              {editing ? (
                <PostEditor
                  SOCIAL_UI={SOCIAL_UI}
                  initialText={post.text}
                  maxLength={maxLength}
                  showCounter={showCounter}
                  saving={busy}
                  onCancel={() => setEditingId('')}
                  onSave={(text) => {
                    void onEdit(post.id, text).then((saved) => {
                      if (saved) setEditingId('');
                    });
                  }}
                />
              ) : (
                <PostBody
                  text={post.text}
                  sharedFilePageHint={SOCIAL_UI.feed.postSharedFileHint}
                  expandLabel={SOCIAL_UI.feed.postExpand}
                  collapseLabel={SOCIAL_UI.feed.postCollapse}
                />
              )}
              {own && !editing ? (
                <div className="hub-post-actions">
                  {canEdit ? (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={Boolean(changingPostId)}
                      onClick={() => setEditingId(post.id)}
                    >
                      <Icon name="edit" />
                      {SOCIAL_UI.feed.postEdit}
                    </button>
                  ) : null}
                  {/* Rojo, como el resto de acciones destructivas de la aplicación: cada tema lo viste con su
                      `.btn-danger` (en Portal, la torreta). */}
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={Boolean(changingPostId)}
                    aria-busy={busy || undefined}
                    onClick={() => setDeleteTarget(post.id)}
                  >
                    <Icon name="trash" />
                    {SOCIAL_UI.feed.postDelete}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {hasMore ? (
        <button
          ref={sentinelRef}
          className="hub-more-soft hub-feed-load-more"
          type="button"
          aria-label={SOCIAL_UI.feed.feedLoadMore}
          title={SOCIAL_UI.feed.feedLoadMore}
          onClick={() => setVisibleCount((prev) => prev + POST_PAGE_SIZE)}
        >
          <Icon name="chevron-down" />
        </button>
      ) : null}

      {own ? (
        <ConfirmModal
          open={Boolean(deleteTarget)}
          title={SOCIAL_UI.feed.postDeleteConfirmTitle}
          body={SOCIAL_UI.feed.postDeleteConfirmBody}
          confirmLabel={SOCIAL_UI.feed.postDelete}
          onCancel={() => setDeleteTarget('')}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </>
  );
});
