// Textos de la pantalla de Ajustes y de las tarjetas que la componen (apariencia, escala, sincronización,
// respaldo, zona peligrosa, legal).
//
// Aparte de `labels.ts` por peso y por orden: son ~11 kB que solo consumen chunks perezosos (`SettingsHub`,
// `AccountHub`, `LegalScreen`…), mientras que `labels.ts` viaja en el arranque.
//
// El texto de la ANALÍTICA se quedó fuera a propósito, en `consentLabels`: lo pinta también `ConsentBanner`, que
// sale en la primera visita, y traerlo aquí le haría descargar estos 11 kB por catorce líneas.
export const SETTINGS_UI = {
  title: 'Ajustes',
  /**
   * LOS CUATRO GRUPOS. Cada título rotula su pantalla y le da nombre accesible a su sección. Los rótulos del
   * MENÚ viven aparte, en `labels.ts`: ese fichero viaja en el arranque con la barra y estos no.
   */
  groups: {
    /** El selector de tema, que es lo que cambia la pantalla entera. */
    themes: 'Temas',
    /**
     * Lo que antes se llamaba «Ajustes de cuenta»: aquel nombre venía de cuando la pantalla entera era «Cuenta»
     * y ya no dice nada —la mitad de lo que hay dentro no depende de ninguna sesión—. Son preferencias: cómo se
     * puntúa y los cinco interruptores de la interfaz.
     */
    preferences: 'Preferencias',
    design: {
      title: 'Diseño',
    },
    filters: {
      title: 'Filtros',
    },
    /**
     * Las DOS MITADES de «Datos». Siguen teniendo nombre propio aunque compartan pantalla: son el `aria-label`
     * de cada región, y es lo que permite saltar de una a otra sin verlas.
     */
    integration: {
      title: 'Integración',
    },
    legal: {
      title: 'Legal',
    },
  },
  account: {
    title: 'Ajustes de cuenta',
  },
  // L3 — borrado de cuenta (RGPD art. 17).
  danger: {
    title: 'Zona de riesgo',
    deleteTitle: 'Borrar mi cuenta',
    deleteBody: 'Elimina tu perfil social, tus amistades y la configuración guardada en la nube, y borra los datos de este dispositivo (listas locales, sesión y token). No se puede deshacer.',
    deleteGistsNote: 'Tus gists de GitHub no se tocan al borrar la cuenta: viven en tu cuenta y solo tú puedes borrarlos. (La única excepción, ajena a este borrado, es la retirada del canal social antiguo que la app migró a no listado.)',
    deleteGistsLink: 'Ver mis Gists',
    deleteGistsUrl: 'https://gist.github.com',
    deleteBtn: 'Borrar cuenta',
    confirmTitle: '¿Borrar tu cuenta y los datos de este dispositivo?',
    confirmHint: 'Escribe BORRAR para confirmar.',
    confirmWord: 'BORRAR',
    confirmLabel: 'Borrar definitivamente',
    deleting: 'Borrando...',
    deletedOk: 'Cuenta borrada. Se han eliminado tus datos de la nube y de este dispositivo.',
    deletedPartial: 'Cuenta borrada, pero algunos datos de la nube no se han podido eliminar. Vuelve a intentarlo o escribe al contacto de privacidad.',
    deleteError: 'No se pudo completar el borrado. Revisa la conexión e inténtalo de nuevo.',
    deleteRetryLater: 'Ahora mismo no podemos completar el borrado: el servicio no responde. Tu sesión y los datos de este dispositivo siguen intactos; vuelve a intentarlo más tarde (normalmente basta con esperar a mañana).',
  },
  // L4 — enlaces a los documentos legales.
  legal: {
    title: 'Legal',
    subtitle: 'Condiciones de uso, tratamiento de datos, cookies y créditos.',
    back: 'Volver',
    updated: (version: string) => `Última actualización: ${version}`,
    contact: 'Contacto',
  },
  scoreScale: {
    title: 'Puntuación',
    groupAria: 'Escala de puntuación',
    starsLabel: 'Estrellas',
    starsHint: 'Escala clásica de 0 a 5',
    gradeLabel: 'Nota 0–100',
    gradeHint: 'Aro numérico, de rojo a verde',
    lockedHint: 'Asocia tu cuenta de Google para elegir la escala (se guarda y sincroniza entre dispositivos).',
  },
  sync: {
    title: 'Sincronización',
    status: 'Estado actual',
    gistConnectedPrefix: 'Gist conectado',
    /** Lo que hace, en una frase: es lo primero que se lee antes del botón. */
    lead: 'Guarda tus listas en tu propia cuenta de GitHub y llévalas a cualquier dispositivo.',
    perks: [
      { icon: 'save', text: 'Copia de seguridad automática' },
      { icon: 'repeat', text: 'Las mismas listas en el móvil y en el PC' },
      { icon: 'lock', text: 'Se guardan en un gist privado de tu cuenta' },
    ],
    oauthHowto: 'Te identificas en GitHub y vuelves aquí ya conectado, sin tener que crear ningún token.',
    manualNoOauth: 'En esta versión no está el acceso directo con GitHub: conecta con un token personal.',
    helpConfigTitle: 'Cómo configurar',
    helpConfigBody: 'Necesitas una cuenta de GitHub y un token personal con permiso gist para conectar tu respaldo en la nube.',
    helpConfigLinkLabel: 'Abrir configuración de tokens en GitHub',
    helpConfigLinkUrl: 'https://github.com/settings/tokens',
    helpConfigExpand: 'Ver pasos detallados',
    helpConfigCollapse: 'Ocultar pasos detallados',
    helpConfigStep1: 'Inicia sesión en GitHub o crea una cuenta si aún no la tienes.',
    helpConfigStep2: 'Abre la página de tokens y crea un token nuevo.',
    helpConfigStep3: 'Ponle un nombre que te ayude a reconocerlo.',
    helpConfigStep4: 'En fecha de caducidad selecciona Sin caducidad (o el periodo que prefieras).',
    helpConfigStep5: 'En permisos marca gist y guarda el token.',
    helpConfigStep6: 'Copia el token y pégalo en el campo Token de esta pantalla. No se lo pases a nadie.',
    helpConfigStep7: 'Si es tu primera conexión, deja vacío el ID del gist. Si ya tenías uno, pégalo para reutilizarlo.',
    tokenLabel: 'Token *',
    tokenPlaceholder: 'ghp_xxxxxxxxxxxxxxxxxxxxxxx',
    tokenToggle: (shown: boolean) => (shown ? 'Ocultar el token' : 'Mostrar el token'),
    gistLabel: 'ID del gist (vacío la primera vez)',
    gistPlaceholder: 'Ej: a1b2c3d4e5f6...',
    oauthConnectBtn: 'Conectar con GitHub',
    oauthConnectingBtn: 'Conectando con GitHub...',
    manualToggleShow: 'Conectar a mano, con token e ID del gist',
    manualToggleHide: 'Ocultar la conexión manual',
    connectBtn: 'Conectar',
    syncBtn: 'Sincronizar',
    disconnectBtn: 'Desconectar',
    copyBtn: 'Copiar ID del gist',
    recoverBtn: 'Recuperar de Google',
    recoveringBtn: 'Recuperando...',
    copyAriaLabel: 'Copiar el ID del gist',
    recoverAriaLabel: 'Recuperar el ID del gist desde Google',
  },
  backup: {
    title: 'Respaldo de datos',
    note: 'Control total sobre tus listas, tanto local como en la nube.',
    description: 'Exporta o importa tus listados en formato JSON.',
    overwriteLabel: 'Sobrescribir los datos de aquí y del gist',
    overwriteHint: 'Reemplaza por completo los datos guardados y, si tienes la sincronización activa, también tu gist.',
    exportBtn: 'Exportar',
    importBtn: 'Importar',
    importAriaLabel: 'Seleccionar archivo para importar',
  },
  admin: {
    title: 'Administración de filtros',
    description: 'Gestiona géneros, plataformas y etiquetas comunes por categoría.',
    genres: 'Géneros',
    platforms: 'Plataformas',
    strengths: 'Puntos fuertes',
    weaknesses: 'Puntos débiles / razón',
    collapseAria: 'Ocultar categoría',
    expandAria: 'Mostrar categoría',
    noTags: 'No hay etiquetas',
    editPlaceholder: 'Escribe el nuevo valor',
    editBtn: 'Editar',
    deleteBtn: 'Eliminar',
    editCancelBtn: 'Cancelar',
    editSaveBtn: 'Guardar',
  },
} as const;
