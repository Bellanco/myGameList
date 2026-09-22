import { useSignatureEffects } from '../hooks/useSignatureEffects';

/**
 * LOS EFECTOS DE FIRMA, en un componente que no pinta nada, para poder sacarlos del chunk de arranque.
 *
 * El hook es lo que son: florituras que responden a una interacción —un clic en un botón, cerrar un juego,
 * cambiar de tema—, y ninguna puede ocurrir antes de que la pantalla esté delante. Como hook llamado desde
 * `App` entraba en el arranque con sus ~2,8 kB de dibujo y escucha; envuelto así, `lazy()` se lo lleva a su
 * propio chunk y `App` lo monta cuando el navegador queda ocioso, igual que el resto del sprite de iconos.
 *
 * NO SE TOCA EL HOOK. Este fichero existe precisamente para no tener que reescribirlo: los efectos no tienen
 * pruebas que los cubran, así que lo que se mueve es DÓNDE se monta, no lo que hace.
 */
export function SignatureEffects(): null {
  useSignatureEffects();
  return null;
}
