/**
 * Lectura de categorías y nominados: título, etiqueta e id estable.
 *
 * Todo aquí existe por la misma razón: **el dato puede llegar en tres formas** —la actual (`{ id, name }`), la
 * bilingüe de antes (`{ id, es, en }`) y la cadena pelada de los primeros datos— y ninguna se migra. Se normaliza
 * al leer, y así un documento sin tocar desde hace dos ediciones no rompe una pantalla.
 *
 * `resolveOptionId` es la pieza importante: convierte cualquier valor guardado —id nuevo o nombre viejo— en el id
 * estable. El recuento y la clasificación pasan por ella, que es lo que permite que un voto de hace años siga
 * contando sin haberlo reescrito.
 */
import type {
  PremiosCategory,
  PremiosLanguage,
  PremiosOption,
  PremiosOptionLike,
  PremiosTitle,
} from '../../model/types/premios';

/** Idioma por defecto mientras la app sea monolingüe (ver `docs/plan-unificar-premios.md` §7). */
const DEFAULT_LANGUAGE: PremiosLanguage = 'es';

/**
 * Texto de un campo que puede ser bilingüe (`{ es, en }`), de nombre único (`{ name }`) o una cadena.
 *
 * El orden de respaldo no es casual: primero el idioma pedido, luego español —que es el que siempre hay—, luego
 * inglés y por último `name`. Así un título al que todavía no se ha traducido no sale vacío.
 */
export function tField(
  field: PremiosTitle | PremiosOptionLike | null | undefined,
  language: PremiosLanguage = DEFAULT_LANGUAGE,
): string {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  const campo = field as Record<string, unknown>;
  const candidatos = [campo[language], campo.es, campo.en, campo.name];
  const texto = candidatos.find((valor) => typeof valor === 'string' && valor !== '');
  return typeof texto === 'string' ? texto : '';
}

/** Título de una categoría en el idioma pedido. */
export function getCategoryTitle(
  category: PremiosCategory | null | undefined,
  language: PremiosLanguage = DEFAULT_LANGUAGE,
): string {
  return tField(category?.title, language);
}

/**
 * ¿Esta categoría tiene título en algún idioma?
 *
 * Sustituye al `category.title.trim()` de cuando el título era una cadena: hoy es un objeto y eso lanzaría.
 */
export function hasTitle(category: PremiosCategory | null | undefined): boolean {
  const title = category?.title;
  if (!title) return false;
  if (typeof title === 'string') return title.trim().length > 0;
  return Boolean(title.es?.trim() || title.en?.trim());
}

/**
 * Id estable de un nominado.
 *
 * El respaldo por índice (`<categoría>_option_<n>`) es SOLO para leer datos antiguos que no traían id. Nunca se
 * usa para escribir: ver la advertencia de `options.ts`, donde está el motivo con todas las letras.
 */
export function getOptionId(option: PremiosOptionLike, categoryId: string, index: number): string {
  if (option && typeof option === 'object' && option.id) return option.id;
  return `${categoryId}_option_${index}`;
}

/** Busca un nominado por su id dentro de la categoría. */
export function getOptionById(
  category: PremiosCategory | null | undefined,
  optionId: string,
): PremiosOptionLike | undefined {
  if (!category) return undefined;
  return (category.options || []).find(
    (option, index) => getOptionId(option, category.id, index) === optionId,
  );
}

/**
 * ¿Este nominado se llama así? Compara contra las TRES formas en que pudo guardarse el nombre —cadena pelada,
 * `name` actual, o el par `es`/`en` de la época bilingüe—, que es justo lo que hace falta para resolver un voto
 * antiguo guardado por nombre.
 *
 * En un solo sitio a propósito: estaba escrito dos veces, y dos copias de una comparación tolerante con datos
 * viejos son dos sitios donde olvidarse de una forma.
 */
function matchesLabel(option: PremiosOptionLike, label: string): boolean {
  if (typeof option === 'string') return option === label;
  const campo = option as Record<string, unknown>;
  return campo.name === label || campo.es === label || campo.en === label;
}

/** Busca un nominado por su etiqueta, en cualquiera de las formas en que pudo guardarse. */
export function getOptionByLabel(
  category: PremiosCategory | null | undefined,
  label: string,
): PremiosOptionLike | undefined {
  return (category?.options || []).find((option) => matchesLabel(option, label));
}

/**
 * Etiqueta de un nominado a partir de lo que se guardó (id nuevo o nombre viejo).
 *
 * Si no se encuentra, devuelve el valor tal cual: enseñar el dato crudo es feo, pero es mejor que dejar un hueco
 * en la papeleta y que nadie sepa qué se votó.
 */
export function getOptionLabel(
  category: PremiosCategory | null | undefined,
  value: string,
  language: PremiosLanguage = DEFAULT_LANGUAGE,
): string {
  const option = getOptionById(category, value) || getOptionByLabel(category, value);
  return option ? tField(option, language) : value;
}

/**
 * Normaliza cualquier valor guardado al id estable del nominado.
 *
 * ES LA PIEZA DE LA QUE CUELGA EL RECUENTO: el voto y el ganador pasan los dos por aquí antes de compararse, así
 * que da igual que uno se guardara por id y el otro por nombre. Lo que no se puede resolver se devuelve intacto,
 * y simplemente no casará con nada.
 */
export function resolveOptionId(
  category: PremiosCategory | null | undefined,
  value: string | null | undefined,
): string {
  if (!value) return value || '';
  if (getOptionById(category, value)) return value;

  const options = category?.options || [];
  const index = options.findIndex((option) => matchesLabel(option, value));
  if (index >= 0 && category) return getOptionId(options[index], category.id, index);
  return value;
}

/**
 * Convierte las selecciones guardadas (`{ categoría: optionId }`) a lo que usa el flujo de votación en memoria
 * (`{ categoría: { id, name } }`).
 *
 * Hace falta al CORREGIR un voto: en Firestore solo vive el id —para que el voto no dependa del idioma— pero la
 * pantalla necesita además el nombre para pintarlo.
 *
 * Las selecciones de categorías que ya no existen se DESCARTAN. Votar a una categoría borrada no significa nada,
 * y al reenviar el voto las reglas lo rechazarían entero por un resto que la persona no puede ni ver.
 */
export function selectionsToVotes(
  selections: Record<string, string> | null | undefined,
  categories: PremiosCategory[] | null | undefined,
  language: PremiosLanguage = DEFAULT_LANGUAGE,
): Record<string, PremiosOption> {
  const votes: Record<string, PremiosOption> = {};
  (categories || []).forEach((category) => {
    const stored = selections?.[category.id];
    if (!stored) return;
    const optionId = resolveOptionId(category, stored);
    if (!optionId) return;
    votes[category.id] = { id: optionId, name: getOptionLabel(category, optionId, language) };
  });
  return votes;
}
