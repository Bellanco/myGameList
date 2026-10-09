// LAS ESCRITURAS DEL CANAL SOCIAL, EN FILA.
//
// Cada escritura del gist social es «leer el gist entero → cambiarlo → escribirlo entero». Dos a la vez en la
// misma pestaña —publicar un post nada más abrir el hub mientras corre la reconciliación, guardar una reseña desde
// la lista con el hub abierto, el saneado de la foto— leían lo mismo y la que escribía la última pisaba a la otra: el
// post desaparecía sin aviso (09-10-2026). Aquí van una detrás de otra.
//
// NO ES REENTRANTE, y es a propósito: una tarea en fila que espera a otra también en fila se bloquearía. Por eso se
// envuelve el tramo de leer → escribir, nunca lo que se lanza después (guardar el perfil dispara una reconciliación
// que escribe por su cuenta: va fuera). Cubre esta pestaña; entre dispositivos manda la última escritura, como antes.
//
// LA ESPERA TIENE TOPE. Las peticiones a GitHub ya caducan solas (`githubHttp`), pero una tarea también espera a
// Firestore, y una que no terminara nunca dejaría TODAS las escrituras siguientes esperando para siempre. Pasados
// `MAX_WAIT_MS`, la siguiente sigue igualmente: se vuelve a lo de antes —dos que se pueden cruzar— en vez de a nada.

const MAX_WAIT_MS = 45_000;

let tail: Promise<void> = Promise.resolve();

function waitAtMost(previous: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    void previous.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Ejecuta `task` cuando terminen las escrituras del canal que ya estaban en fila. Devuelve lo que devuelva `task`. */
export function serializeSocialWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = waitAtMost(tail, MAX_WAIT_MS).then(task);
  // La fila sigue aunque una tarea falle: el fallo es de quien la pidió, no de las que vienen detrás.
  tail = run.then(() => undefined, () => undefined);
  return run;
}

/** Vacía la fila. Para las pruebas: una tarea colgada a propósito en un test no debe retener las del siguiente. */
export function resetSocialWriteQueueForTests(): void {
  tail = Promise.resolve();
}
