/** Sección de metadatos (plataformas, géneros, puntos fuertes/débiles) como lista de chips. Nula si no hay items. */
export function MetaSection({ label, items, cls }: { label: string; items?: string[]; cls: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="hub-metadata-section">
      <strong>{label}</strong>
      <div className="chips">
        {items.map((item) => (
          <span key={item} className={`chip ${cls}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
