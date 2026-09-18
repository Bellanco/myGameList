import { memo, useMemo, useState } from 'react';
import { COMMON_ICONS } from '../../../core/constants/icons';
import { UI_MESSAGES, VALIDATION_MESSAGES } from '../../../core/constants/labels';
import { SETTINGS_UI } from '../../../core/constants/settingsLabels';
import { Icon } from '../Icon';

type AdminCategoryKey = 'genres' | 'platforms' | 'strengths' | 'weaknesses';

interface FiltersSettingsProps {
  lookups: {
    genres: string[];
    platforms: string[];
    strengths: string[];
    weaknesses: string[];
  };
  onEditTag: (key: AdminCategoryKey, oldValue: string, newValue: string) => void;
  onDeleteTag: (key: AdminCategoryKey, value: string) => void;
}

/**
 * «Filtros» — los géneros, plataformas, virtudes y defectos con los que clasificas.
 *
 * VIVE APARTE DE «INTEGRACIÓN» aunque las dos salieran del mismo componente. Compartirlo salía caro por los dos
 * lados: esta pantalla arrastraba el código de la sincronización, la importación y las copias —que no usa— y
 * recibía veinte props que no le tocaban, mientras que la otra cargaba con el editor de etiquetas. Separadas,
 * cada una pide lo suyo: tres props aquí, y el chunk de cada pantalla trae solo lo que pinta.
 *
 * Esto NO es un ajuste, y de ahí que tenga pantalla propia: es gestión del contenido con el que clasificas, y
 * apilada al final de la de integración no la encontraba nadie.
 */
export const FiltersSettings = memo(function FiltersSettings({ lookups, onEditTag, onDeleteTag }: FiltersSettingsProps) {
  const [activeAdminCategory, setActiveAdminCategory] = useState<AdminCategoryKey>('genres');
  const [editingTag, setEditingTag] = useState<{ key: AdminCategoryKey; value: string } | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [mergePending, setMergePending] = useState(false);
  const [adminNotice, setAdminNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; message: string } | null>(null);

  const categories = useMemo(
    () =>
      [
        { key: 'genres' as const, label: SETTINGS_UI.admin.genres, values: lookups.genres },
        { key: 'platforms' as const, label: SETTINGS_UI.admin.platforms, values: lookups.platforms },
        { key: 'strengths' as const, label: SETTINGS_UI.admin.strengths, values: lookups.strengths },
        { key: 'weaknesses' as const, label: SETTINGS_UI.admin.weaknesses, values: lookups.weaknesses },
      ],
    [lookups.genres, lookups.platforms, lookups.strengths, lookups.weaknesses],
  );

  const activeCategory = categories.find((category) => category.key === activeAdminCategory) ?? categories[0];

  const startEdit = (key: AdminCategoryKey, value: string) => {
    setEditingTag({ key, value });
    setDraftValue(value);
    setMergePending(false);
    setAdminNotice(null);
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setDraftValue('');
    setMergePending(false);
  };

  const saveEdit = (key: AdminCategoryKey, sourceValue: string, list: string[]) => {
    const nextValue = draftValue.trim();
    if (!nextValue || nextValue.toLowerCase() === sourceValue.toLowerCase()) {
      cancelEdit();
      return;
    }

    const duplicate = list.find((tag) => tag.toLowerCase() === nextValue.toLowerCase());
    if (duplicate && !mergePending) {
      setMergePending(true);
      setAdminNotice({ kind: 'warn', message: VALIDATION_MESSAGES.tagExists });
      return;
    }

    onEditTag(key, sourceValue, nextValue);
    setAdminNotice({
      kind: 'ok',
      message: duplicate ? VALIDATION_MESSAGES.tagMerged : VALIDATION_MESSAGES.tagUpdated,
    });
    cancelEdit();
  };


  return (
    <section className="settings-hub" aria-label={SETTINGS_UI.groups.filters.title}>
      <div className="settings-card settings-card-admin">
        <h2>{SETTINGS_UI.admin.title}</h2>
        <p>{SETTINGS_UI.admin.description}</p>

        {adminNotice ? <div className={`admin-warning show ${adminNotice.kind}`}>{adminNotice.message}</div> : null}

        <div className="settings-admin-tabs" role="tablist" aria-label={SETTINGS_UI.admin.title}>
          {categories.map((category) => (
            <button
              key={category.key}
              className={`settings-admin-tab ${activeAdminCategory === category.key ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeAdminCategory === category.key}
              onClick={() => {
                setActiveAdminCategory(category.key);
                cancelEdit();
              }}
            >
              {category.label}
            </button>
          ))}
        </div>

        {/* EN REJILLA Y NO EN FILAS DE LADO A LADO. Cada etiqueta es un nombre corto, y una fila por etiqueta
            gastaba el ancho entero para dos palabras: ocho géneros ya pedían scroll, y aquí acaban llegando
            cuarenta. En fichas caben tres o cuatro por línea y se ven todas de una vez. */}
        <div className="admin-grid">
          {activeCategory.values.length ? (
            activeCategory.values.map((tag) => {
              const isEditing = editingTag?.key === activeCategory.key && editingTag?.value === tag;

              return (
                <div key={`${activeCategory.key}-${tag}`} className={`admin-item ${isEditing ? 'editing' : ''}`}>
                  {isEditing ? (
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
                          saveEdit(activeCategory.key, tag, activeCategory.values);
                        }}
                      />
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-icon-text admin-action-btn" type="button" onClick={cancelEdit}>
                          <Icon name={COMMON_ICONS.close} />
                          <span>{UI_MESSAGES.admin.editCancelBtn}</span>
                        </button>
                        <button
                          className="btn btn-steam btn-icon-text admin-action-btn"
                          type="button"
                          onClick={() => saveEdit(activeCategory.key, tag, activeCategory.values)}
                        >
                          <Icon name={COMMON_ICONS.save} />
                          <span>{UI_MESSAGES.admin.editSaveBtn}</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="admin-item-name">{tag}</span>
                      {/* LAS ACCIONES, SIN RÓTULO PERO CON SU BOTÓN. Repetidas en cada ficha con su palabra —y
                          una de ellas en rojo a plena intensidad— eran lo primero que se veía de la pantalla,
                          cuando lo que se viene a mirar son los nombres. Lo que se quita es el TEXTO, no el
                          botón: siguen siendo el secundario y el de peligro de siempre, así que conservan la
                          forma que les da cada tema y su color. El rótulo va en el `aria-label` con el nombre
                          de la etiqueta, que es lo que distingue un «Eliminar» de los otros siete. */}
                      <div className="row-actions">
                        <button
                          className="btn btn-secondary btn-icon-text admin-action-btn is-compact"
                          type="button"
                          aria-label={`${UI_MESSAGES.admin.editBtn}: ${tag}`}
                          title={UI_MESSAGES.admin.editBtn}
                          onClick={() => startEdit(activeCategory.key, tag)}
                        >
                          <Icon name={COMMON_ICONS.edit} className="ui-icon" />
                        </button>
                        <button
                          className="btn btn-danger btn-icon-text admin-action-btn is-compact"
                          type="button"
                          aria-label={`${UI_MESSAGES.admin.deleteBtn}: ${tag}`}
                          title={UI_MESSAGES.admin.deleteBtn}
                          onClick={() => onDeleteTag(activeCategory.key, tag)}
                        >
                          <Icon name={COMMON_ICONS.trash} className="ui-icon" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          ) : (
            <span className="settings-admin-empty">{UI_MESSAGES.admin.noTags}</span>
          )}
        </div>
      </div>
    </section>
  );
});
