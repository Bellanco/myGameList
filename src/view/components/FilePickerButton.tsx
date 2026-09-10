import { COMMON_ICONS } from '../../core/constants/icons';
import { Icon } from './Icon';

/**
 * Botón que abre el selector de archivos del sistema.
 *
 * POR QUÉ ES UN COMPONENTE Y NO TRES BLOQUES SUELTOS: es un `<input type="file">` oculto dentro de una `<label>`
 * disfrazada de botón, y ese montaje tiene una trampa que se coló en los tres sitios donde estaba copiado. El
 * input se ocultaba con `display: none`, que además de esconderlo lo saca del orden de tabulación; y una
 * `<label>` no es focusable ni responde a Intro. Resultado: importar la biblioteca y restaurar la copia de
 * seguridad no se podían hacer con el teclado (WCAG 2.1.1, nivel A). Ni Lighthouse ni axe lo detectan, porque
 * los dos ven una etiqueta con texto y dan por bueno el conjunto.
 *
 * El arreglo vive en `.input-hidden` (recorte con `clip-path` en vez de `display:none`, así conserva el foco) y
 * en `.settings-import-label:focus-within`, que pinta el anillo por él. Aquí lo que importa es que ese montaje
 * exista UNA vez: la próxima pantalla que necesite un selector de archivo no puede volver a equivocarse.
 *
 * El `id` lo pide quien lo usa porque en Ajustes hay DOS a la vez (importar biblioteca y restaurar copia) y
 * tienen que ser distintos; sirve además de `name`, que es lo que el navegador necesita para no tratar el campo
 * como anónimo.
 */
export function FilePickerButton({
  id,
  className,
  label,
  ariaLabel,
  accept,
  onPick,
}: {
  id: string;
  /** Variante visual del botón (`btn btn-primary`, `btn btn-secondary`…). */
  className: string;
  /** Rótulo visible. */
  label: string;
  /** Nombre accesible del campo: dice QUÉ archivo se espera, que el rótulo no siempre aclara. */
  ariaLabel: string;
  /** Filtro del diálogo del sistema (`.json`, `.json,application/json`…). */
  accept: string;
  onPick: (file: File) => void;
}) {
  return (
    <label className={`${className} settings-import-label`} htmlFor={id}>
      <Icon name={COMMON_ICONS.upload} />
      <span>{label}</span>
      <input
        id={id}
        name={id}
        type="file"
        accept={accept}
        className="input-hidden"
        aria-label={ariaLabel}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          // Se limpia para que elegir DOS VECES SEGUIDAS el mismo archivo vuelva a disparar `change`.
          event.currentTarget.value = '';
        }}
      />
    </label>
  );
}
