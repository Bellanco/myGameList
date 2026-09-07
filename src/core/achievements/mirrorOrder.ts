// EL ORDEN DE LOS BITS DEL ESPEJO, CONGELADO A MANO. Ver docs/plan-logros.md §5.3 y `pack.ts`.
//
// POR QUÉ NO SE DERIVA DEL CATÁLOGO. Se derivaba (`ACHIEVEMENTS.filter(...).map(id)`), y eso ataba dos cosas que
// no tienen por qué ir juntas: el ORDEN EN QUE SE LEEN los logros y el SIGNIFICADO DE CADA BIT publicado. Con
// aquello, insertar el umbral 25 entre el 10 y el 50 —que es la operación más normal del mundo cuando ves que un
// salto es demasiado grande— corría todos los bits siguientes y reescribía la vitrina de TODO EL MUNDO. La
// alternativa que quedaba era declarar el escalón nuevo al final de su escalera, y entonces el grado (que sale de
// la posición) y su romano mentían: el 25 se pintaba como el último escalón de la escalera.
//
// Con la lista aquí, las dos cosas se separan: el catálogo declara sus umbrales EN ORDEN —grado y romano
// correctos— y el espejo conserva el significado de cada bit.
//
// CÓMO SE AÑADE UN ESCALÓN (o una escalera): su `id` va **AL FINAL** de esta lista, nunca intercalado. Da igual
// que su umbral sea intermedio: aquí no se ordena nada, se numeran bits. Un test lo comprueba en las dos
// direcciones (`tests/unit/achievements.test.ts`), así que olvidarse rompe la batería en vez de las vitrinas.
//
// LO QUE NO SE HACE JAMÁS: quitar un `id`, reordenarlos, o reutilizar uno. Los RETIRADOS siguen aquí —retirar no
// puede correr los índices de los que van detrás— y los «primeros pasos» no están porque no se publican nunca.
export const MIRROR_IDS: readonly string[] = [
  'completados-10', 'completados-25', 'completados-50', 'completados-75',
  'completados-100', 'completados-150', 'completados-200', 'completados-250',
  'completados-300', 'completados-400', 'completados-500', 'abandonos-razonados-5',
  'abandonos-razonados-10', 'abandonos-razonados-20', 'abandonos-razonados-35', 'abandonos-razonados-50',
  'abandonos-razonados-75', 'abandonos-razonados-100', 'abandonos-razonados-150', 'constancia-2',
  'constancia-4', 'constancia-8', 'constancia-12', 'constancia-18',
  'constancia-26', 'constancia-39', 'constancia-52', 'ritmo-2',
  'ritmo-3', 'ritmo-6', 'ritmo-9', 'ritmo-12',
  'ritmo-18', 'ritmo-24', 'ritmo-36', 'generos-5',
  'generos-8', 'generos-12', 'generos-16', 'generos-20',
  'generos-25', 'generos-30', 'generos-40', 'degustacion-1',
  'degustacion-3', 'degustacion-5', 'degustacion-10', 'degustacion-15',
  'degustacion-25', 'plataformas-3', 'plataformas-5', 'plataformas-7',
  'plataformas-9', 'plataformas-12', 'plataformas-15', 'rejugados-1',
  'rejugados-2', 'rejugados-3', 'rejugados-5', 'rejugados-7',
  'rejugados-10', 'volvere-3', 'volvere-10', 'volvere-20',
  'volvere-30', 'volvere-40', 'volvere-50', 'revancha-1',
  'revancha-5', 'revancha-10', 'revancha-20', 'revancha-35',
  'revancha-50', 'maraton-1', 'maraton-3', 'maraton-5',
  'maraton-10', 'maraton-15', 'maraton-25', 'maraton-40',
  'maraton-60', 'maraton-75', 'paciencia-1', 'paciencia-2',
  'paciencia-3', 'paciencia-4', 'paciencia-5', 'criterio-25',
  'criterio-50', 'criterio-75', 'criterio-100', 'criterio-150',
  'criterio-200', 'criterio-300', 'criterio-400', 'criterio-500',
  'memoria-larga-3', 'memoria-larga-8', 'memoria-larga-15', 'memoria-larga-25',
  'cadena-de-anos-3', 'cadena-de-anos-5', 'cadena-de-anos-8', 'cadena-de-anos-10',
  'cadena-de-anos-12', 'cadena-de-anos-15', 'cadena-de-anos-17', 'cadena-de-anos-20',
  'deshielo-2', 'deshielo-3', 'deshielo-4', 'deshielo-6',
  'deshielo-8', 'estanteria-5', 'estanteria-10', 'estanteria-20',
  'estanteria-35', 'estanteria-50', 'estanteria-75', 'estanteria-100',
  'dieta-1', 'veterano-1', 'veterano-2', 'veterano-3',
  'veterano-5', 'tutorial-1', 'obra-maestra-1', 'obra-maestra-2',
  'sofa-5', 'sofa-15', 'sofa-25', 'sofa-50',
  'sofa-75', 'speedrun-1', 'speedrun-3', 'segunda-vuelta-1',
  'segunda-vuelta-3', 'segunda-vuelta-5', 'segunda-vuelta-10', 'segunda-vuelta-20',
  'segunda-vuelta-35', 'segunda-vuelta-50', 'estanteria-cero-50', 'estanteria-cero-25',
  'estanteria-cero-10', 'estanteria-cero-5', 'estanteria-cero-1', 'orgullo-1',
  'orgullo-3', 'orgullo-5', 'no-eres-tu-1', 'no-eres-tu-3',
  'no-eres-tu-5', 'vida-entera-1', 'vida-entera-2', 'vida-entera-4',
  'platino-3', 'platino-10', 'horas-10', 'horas-25',
  'horas-40', 'horas-60', 'horas-80', 'horas-100',
  'horas-125', 'horas-150', 'resenas-5', 'resenas-25',
  'resenas-50', 'resenas-75', 'resenas-100', 'resenas-150',
  'resenas-200', 'cobertura-25', 'cobertura-40', 'cobertura-50',
  'cobertura-60', 'cobertura-75', 'cobertura-90', 'ficha-completa-10',
  'ficha-completa-25', 'ficha-completa-50', 'ficha-completa-100', 'ficha-completa-150',
  'ficha-completa-250', 'autopsia-3', 'autopsia-10', 'autopsia-20',
  'autopsia-30', 'autopsia-50', 'autopsia-75', 'luces-y-sombras-5',
  'luces-y-sombras-25', 'luces-y-sombras-50', 'luces-y-sombras-75', 'luces-y-sombras-100',
  'luces-y-sombras-150', 'luces-y-sombras-200', 'luces-y-sombras-250', 'tesis-1',
  'tesis-5', 'tesis-20', 'tesis-50', 'tesis-100',
  'amistades-1', 'amistades-3', 'amistades-5', 'amistades-10',
  'amistades-15', 'amistades-20', 'amistades-30', 'amistades-40',
  'conversador-2', 'conversador-8', 'conversador-16', 'conversador-26',
  'conversador-39', 'conversador-52', 'conversador-78', 'conversador-104',
  'escaparate-1', 'escaparate-5', 'escaparate-15', 'escaparate-30',
  'escaparate-50', 'escaparate-75', 'escaparate-100', 'escaparate-150',
  'ano-redondo-1', 'ano-redondo-2', 'ano-redondo-3', 'ano-redondo-4',
  'ano-redondo-5', 'ano-redondo-10', 'ano-redondo-15', 'ano-redondo-20',
  'ano-redondo-25', 'ano-redondo-30', 'buena-cosecha-5', 'buena-cosecha-8',
  'buena-cosecha-12', 'buena-cosecha-16', 'buena-cosecha-20', 'buena-cosecha-25',
  'aniversario-1', 'aniversario-2', 'aniversario-3', 'aniversario-5',
  'aniversario-10', 'aniversario-15', 'aniversario-20', 'aniversario-25',
  'aniversario-30',

  // ── AMPLIACIÓN DEL CATÁLOGO: 54 escalones nuevos en 20 escaleras. VAN AL FINAL, como manda la cabecera de
  // este fichero: aquí no se ordena nada, se numeran bits, y colocar un umbral intermedio en su sitio
  // «natural» correría el significado de todos los que van detrás en las vitrinas ya publicadas.
  'abandonos-razonados-200', 'abandonos-razonados-250', 'generos-50', 'generos-60', 'plataformas-18',
  'plataformas-20', 'volvere-60', 'volvere-75', 'volvere-100', 'revancha-70', 'revancha-100', 'criterio-250',
  'criterio-350', 'memoria-larga-20', 'cadena-de-anos-25', 'cadena-de-anos-30', 'cadena-de-anos-35',
  'obra-maestra-3', 'obra-maestra-5', 'sofa-100', 'sofa-125', 'orgullo-8', 'orgullo-12', 'orgullo-15',
  'no-eres-tu-10', 'no-eres-tu-20', 'no-eres-tu-35', 'no-eres-tu-50', 'vida-entera-7', 'vida-entera-10',
  'vida-entera-15', 'vida-entera-20', 'platino-5', 'platino-7', 'platino-15', 'resenas-10',
  'resenas-125', 'resenas-175', 'resenas-250', 'ficha-completa-75', 'ficha-completa-125', 'ficha-completa-200',
  'autopsia-5', 'autopsia-15', 'autopsia-40', 'autopsia-60', 'tesis-10', 'tesis-35', 'tesis-75', 'tesis-150',
  'conversador-130', 'conversador-150', 'buena-cosecha-30',
];
