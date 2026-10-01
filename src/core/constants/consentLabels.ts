// Textos de los dos avisos del carril de abajo: el consentimiento de analítica y la invitación a instalar.
//
// Aparte de `labels.ts` porque los dos avisos llegan por `lazy()` (ver `LaneBanners`): casi nunca hay ninguno que
// enseñar —el consentimiento se decide una vez, la invitación se ofrece una vez—, y en `labels.ts` viajarían en
// cada arranque.

/**
 * Textos del consentimiento de analítica: el aviso (`ConsentBanner`) y la tarjeta de Ajustes › Legal. Fuera de
 * `settingsLabels` a propósito: el aviso sale en la primera visita, y tenerlos allí le haría descargar los ~11 kB
 * de Ajustes para pintar dos frases.
 */
export const ANALYTICS_UI = {
  title: 'Analítica',
  subtitle: 'Estadísticas de uso anónimas (Google Analytics) para saber qué falla y qué se usa.',
  groupAria: 'Consentimiento de analítica',
  on: 'Activada',
  off: 'Desactivada',
  /**
   * QUÉ SE MIRA Y QUÉ NO, dicho en dos listas. La tarjeta tenía una frase y dos botones, y se quedaba a medias
   * —medio palmo de tarjeta vacía— justo donde hace falta lo contrario: nadie decide sobre un permiso sin saber
   * qué alcanza. Lo que sale aquí no es relleno; es la respuesta a la única pregunta que se hace al leerlo.
   */
  collectsLabel: 'Qué se registra',
  collects: ['Qué pantallas se visitan', 'Errores de la aplicación', 'Navegador y tamaño de pantalla'],
  neverLabel: 'Qué no sale nunca de aquí',
  never: ['Tus listas y tus notas', 'Tus reseñas', 'Tu correo o tu nombre'],
  bannerTitle: 'Analítica opcional',
  /* CUATRO LÍNEAS ERAN TRES DE MÁS, y tres seguían siendo una de más: el aviso se lee de pie, tapando la
     pantalla, y lo único que hay que saber para decidir cabe en dos —qué se recoge y que se puede cambiar de
     idea—. El detalle —qué identificadores, cuánto duran— está en la política de cookies, que tiene su enlace
     justo debajo. Y ya no manda a «Cuenta», que era una pantalla que ha dejado de existir.

     SOBRABA «Solo se activan si aceptas»: lo dicen ya los dos botones, que es donde se mira antes de decidir, y
     costaba una línea entera de aviso —de ella depende el alto que publica `--consent-h`, y de ese alto, lo que
     se aparta todo lo que se apoya sobre la barra—. El hecho no cambia: sin decisión guardada no se inicializa
     Analytics (ver `ConsentBanner`), y la promesa por escrito sigue en la política de cookies. */
  bannerBody: 'Estadísticas de uso anónimas para saber qué falla y qué se usa. Puedes cambiarlo cuando quieras en Ajustes › Legal.',
  bannerAccept: 'Aceptar',
  bannerReject: 'Rechazar',
  bannerMore: 'Política de cookies',
  bannerAria: 'Consentimiento de analítica',
} as const;

/**
 * INVITACIÓN A INSTALAR. Se ofrece una vez y se puede decir que no una vez.
 *
 * El cuerpo dice lo que se GANA, no lo que se hace: «añadir a la pantalla de inicio» es el gesto, y el gesto no
 * convence a nadie. Lo que convence es que se abra sin la barra del navegador y que arranque sin conexión —las
 * dos cosas que esta app ya sabe hacer y que, sin instalar, no se llegan a ver nunca.
 *
 * NO se menciona que ocupe poco ni que «no es una descarga»: es cierto, pero defenderse de una objeción que
 * nadie ha puesto la planta en la cabeza de quien lee.
 */
export const INSTALL_UI = {
  bannerAria: 'Instalar la aplicación',
  bannerTitle: 'Ten Mis Listas a mano',
  bannerBody: 'Añádela a tu pantalla de inicio: se abre sin la barra del navegador y arranca aunque no haya conexión.',
  bannerAccept: 'Añadir',
  bannerReject: 'Ahora no',
} as const;
