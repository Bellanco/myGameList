// EL RESTO DEL SPRITE DE ICONOS: los que NINGUNA pieza del arranque dibuja.
//
// POR QUÉ ESTÁ PARTIDO. El sprite general entra en el chunk de arranque de todo el mundo, y hay un presupuesto
// vigilado (`BOOT_CRITICAL_BUDGET_KB` en `scripts/ci-validate.js`). Medido sobre el build —el grafo de arranque
// se lee de los sourcemaps de los chunks que cuelgan de `index.html`, no a ojo—, de sus 51 símbolos el arranque
// solo dibujaba 36. De los otros 15, dos (`uncharted` y `keyboard-arrow-up`) no los pintaba NADIE y se
// borraron; los 13 que quedan aquí (6,4 kB de marcado) los pintan pantallas perezosas: ajustes, hub social,
// estadísticas, panel, los modales y las pantallas legales.
//
// SE MONTA UNA VEZ, DESDE `App`, EN CUANTO EL NAVEGADOR ESTÁ OCIOSO, y no desde cada pantalla como
// `AchievementSprite`. La diferencia está en a quién sirve cada uno: aquel lo piden cinco pantallas que nunca
// coinciden, así que tiene sentido que lo monte la que esté; esto lo necesitan una decena de sitios repartidos,
// entre ellos modales que se abren ENCIMA de cualquier pantalla. Con un solo montaje no hay forma de olvidarse
// de ponerlo en un sitio nuevo y quedarse con un icono hueco —que es un fallo que no avisa—, y por eso tampoco
// hace falta el relevo por orden de llegada que aquel necesita.
//
// LO QUE NO SE MUEVE. Los filtros de textura del `<defs>` se quedan en el sprite del arranque: los referencia
// el CSS (`filter: url(#wt-desgarro)`) y tienen que existir en el documento desde el primer pintado.
//
// SI AÑADES UN ICONO da igual en cuál de los dos lo pongas: `tests/unit/iconSprite.test.ts` comprueba que todo
// nombre del catálogo está declarado exactamente una vez entre los dos, y el recorrido de extremo a extremo
// comprueba que ningún `<use>` de la página apunta a un símbolo que no exista.
export function IconSpriteRest() {
  return (
    <svg aria-hidden="true" className="svg-sprite">
      <symbol id="icon-grav" viewBox="0 0 512 512"><path d="M301.1 212c4.4 4.4 4.4 11.9 0 16.3l-9.7 9.7c-4.4 4.7-11.9 4.7-16.6 0l-10.5-10.5c-4.4-4.7-4.4-11.9 0-16.6l9.7-9.7c4.4-4.4 11.9-4.4 16.6 0l10.5 10.8zm-30.2-19.7c3-3 3-7.8 0-10.5-2.8-3-7.5-3-10.5 0-2.8 2.8-2.8 7.5 0 10.5 3.1 2.8 7.8 2.8 10.5 0zm-26 5.3c-3 2.8-3 7.5 0 10.2 2.8 3 7.5 3 10.5 0 2.8-2.8 2.8-7.5 0-10.2-3-3-7.7-3-10.5 0zm72.5-13.3c-19.9-14.4-33.8-43.2-11.9-68.1 21.6-24.9 40.7-17.2 59.8.8 11.9 11.3 29.3 24.9 17.2 48.2-12.5 23.5-45.1 33.2-65.1 19.1zm47.7-44.5c-8.9-10-23.3 6.9-15.5 16.1 7.4 9 32.1 2.4 15.5-16.1zM504 256c0 137-111 248-248 248S8 393 8 256 119 8 256 8s248 111 248 248zm-66.2 42.6c2.5-16.1-20.2-16.6-25.2-25.7-13.6-24.1-27.7-36.8-54.5-30.4 11.6-8 23.5-6.1 23.5-6.1.3-6.4 0-13-9.4-24.9 3.9-12.5.3-22.4.3-22.4 15.5-8.6 26.8-24.4 29.1-43.2 3.6-31-18.8-59.2-49.8-62.8-22.1-2.5-43.7 7.7-54.3 25.7-23.2 40.1 1.4 70.9 22.4 81.4-14.4-1.4-34.3-11.9-40.1-34.3-6.6-25.7 2.8-49.8 8.9-61.4 0 0-4.4-5.8-8-8.9 0 0-13.8 0-24.6 5.3 11.9-15.2 25.2-14.4 25.2-14.4 0-6.4-.6-14.9-3.6-21.6-5.4-11-23.8-12.9-31.7 2.8.1-.2.3-.4.4-.5-5 11.9-1.1 55.9 16.9 87.2-2.5 1.4-9.1 6.1-13 10-21.6 9.7-56.2 60.3-56.2 60.3-28.2 10.8-77.2 50.9-70.6 79.7.3 3 1.4 5.5 3 7.5-2.8 2.2-5.5 5-8.3 8.3-11.9 13.8-5.3 35.2 17.7 24.4 15.8-7.2 29.6-20.2 36.3-30.4 0 0-5.5-5-16.3-4.4 27.7-6.6 34.3-9.4 46.2-9.1 8 3.9 8-34.3 8-34.3 0-14.7-2.2-31-11.1-41.5 12.5 12.2 29.1 32.7 28 60.6-.8 18.3-15.2 23-15.2 23-9.1 16.6-43.2 65.9-30.4 106 0 0-9.7-14.9-10.2-22.1-17.4 19.4-46.5 52.3-24.6 64.5 26.6 14.7 108.8-88.6 126.2-142.3 34.6-20.8 55.4-47.3 63.9-65 22 43.5 95.3 94.5 101.1 59z"/></symbol>
      {/* Caballo de ajedrez (Font Awesome Free **7**, classic REGULAR). Es el icono de los LOGROS.
          LA VERSIÓN IMPORTA: la 7 REDIBUJÓ este icono, y el de la 6 es un caballo distinto —parecido de
          lejos y con otro trazo de cerca—. La web de Font Awesome sirve ya la 7, así que ese es el que se
          ve al buscarlo y el que hay que traer.
          Y EL `viewBox` NO ES EL DEL FICHERO: el SVG que publica Font Awesome trae `0 0 448 512`, pero su
          trazado va de y=-32 a y=464, así que con esa caja el caballo sale RECORTADO POR ARRIBA —las orejas—.
          Se sube el origen a -32 para que quepa entero, conservando el tamaño de caja (448×512) y por tanto las
          proporciones con las que conviven los demás iconos.
          ATRIBUCIÓN: los iconos de Font Awesome Free van bajo CC BY 4.0, que EXIGE citar la fuente —a
          diferencia de los Material Symbols del resto del sprite, que son Apache 2.0—. La cita tiene que
          estar en un sitio visible para el usuario; ver `core/constants/legalContent`. */}
      <symbol id="icon-chess-knight" viewBox="0 -32 448 512"><path d="M232-32c110.5 0 200 89.5 200 200l0 127.7c0 18.9-6.1 37.1-17.2 52.2l-5.1 6.2-36.3 40.7 32.1 40.2c6.7 8.4 10.4 18.8 10.4 29.6l-.2 4.8c-2.4 23.9-22.6 42.5-47.1 42.5l-289.2 0-4.8-.2c-23.9-2.4-42.5-22.6-42.5-47.1 0-10.8 3.7-21.2 10.4-29.6l37.6-47 0-24.3c0-24.3 10.1-47.6 27.8-64.2l63.5-59.5-17.4 0-.2 .2c-20.3 20.3-49.6 28.2-77.1 21.1l-5.5-1.6c-30.9-10.3-52.3-38-54.9-70.1l-.2-6.4 0-1.4c0-19.7 7.1-38.8 19.9-53.8l76.1-88.8 0-47.1 .1-2.5C113.4-22.6 123.6-32 136-32l96 0zM80.7 464l286.6 0-38.4-48-209.9 0-38.4 48zM160 48c0 5.7-2.1 11.3-5.8 15.6L72.3 159.1C67 165.4 64 173.4 64 181.7l0 1.4 .4 5.2c1.9 11.9 10.3 21.9 21.9 25.8l4.5 1.1c10.5 1.9 21.3-1.4 29-9l7.2-7.2 3.7-3c3.9-2.6 8.5-4 13.3-4l88 0c9.8 0 18.7 6 22.3 15.2s1.3 19.6-5.9 26.3l-107.8 101c-8.1 7.6-12.7 18.1-12.7 29.2l0 4.3 205.2 0 40.7-45.8 2.3-2.8c5.1-6.8 7.8-15.2 7.8-23.7L384 168c0-83.9-68.1-152-152-152l-72 0 0 32zm32 72a24 24 0 1 1 0-48 24 24 0 1 1 0 48z" /></symbol>
      <symbol id="icon-gear" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41L9.25 5.35c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.73 8.87c-.11.2-.06.47.12.61l2.03 1.58c-.04.3-.06.61-.06.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.11-.2.06-.47-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" /></symbol>
      <symbol id="icon-save" viewBox="0 -960 960 960"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h480l160 160v212q-19-8-39.5-10.5t-40.5.5v-169L647-760H200v560h240v80H200Zm0-640v560-560ZM520-40v-123l221-220q9-9 20-13t22-4q12 0 23 4.5t20 13.5l37 37q8 9 12.5 20t4.5 22q0 11-4 22.5T863-260L643-40H520Zm300-263-37-37 37 37ZM580-100h38l121-122-18-19-19-18-122 121v38Zm141-141-19-18 37 37-18-19ZM240-560h360v-160H240v160Zm240 320h4l116-115v-5q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Z" /></symbol>
      <symbol id="icon-eye-off" viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 2.99-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 11.5c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2z" /></symbol>
      <symbol id="icon-google-recover" viewBox="0 -960 960 960">
        <path d="M220-100q-17 0-34.5-10.5T160-135L60-310q-8-14-8-34.5t8-34.5l260-446q8-14 25.5-24.5T380-860h200q17 0 34.5 10.5T640-825l182 312q-23-6-47.5-8t-48.5 2L574-780H386L132-344l94 164h316q11 23 25.5 43t33.5 37H220Zm70-180-29-51 183-319h72l101 176q-17 13-31.5 28.5T560-413l-80-139-110 192h164q-7 19-10.5 39t-3.5 41H290Zm430 160v-120H600v-80h120v-120h80v120h120v80H800v120h-80Z" />
      </symbol>
      <symbol id="icon-sync-copy" viewBox="0 -960 960 960">
        <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z" />
      </symbol>
      {/* Copiar (Material Symbols Outlined «content_copy», FILL 0 · peso 400 · grado 0 · tamaño óptico 24). */}
      <symbol id="icon-content-copy" viewBox="0 -960 960 960"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z" /></symbol>
      <symbol id="icon-eye" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" /></symbol>
      <symbol id="icon-chevron-down" viewBox="0 0 512 512"><path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></symbol>
      <symbol id="icon-cloud-sync" viewBox="0 0 24 24"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" /></symbol>
      {/* Persona a TRAZO, el avatar de quien no muestra foto. Único icono del sprite dibujado con `stroke` y no
          con relleno: el grosor y los remates del trazo son lo que cada tema ajusta para que la silueta se lea con
          su propia mano (`--deco-avatar-stroke`). Sin `stroke-width` aquí: se hereda del CSS, que es heredable en
          SVG y llega al contenido del `<use>`. */}
      <symbol id="icon-person" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="8.4" r="3.75" />
        <path d="M4.6 20.2c0-4.1 3.3-6.7 7.4-6.7s7.4 2.6 7.4 6.7" />
      </symbol>
      <symbol id="icon-arrow-back" viewBox="0 -960 960 960"><path d="m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z" /></symbol>
    </svg>
  );
}
