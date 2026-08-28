// Textos de compartir una reseña con enlace público.
//
// Aparte de `labels.ts` por el mismo motivo que `adminLabels`: quien los necesita —el diálogo de compartir, la
// tarjeta de gestión y la pantalla pública— llega por un chunk perezoso, y en `labels.ts` viajaban en el arranque.

/**
 * Compartir una reseña con enlace público (ver docs/plan-compartir-resenas.md).
 *
 * El tono importa aquí más que en otras pantallas: se está sacando a internet un texto que hasta ahora vivía en
 * los Gists del usuario. Los textos dicen con todas las letras qué se publica, qué no, cuánto dura y que se
 * puede retirar — y "Dejar de compartir" nunca se llama "Borrar", porque retirar un enlace no recoge las copias
 * que ya circulen.
 */
export const SHARE_UI = {
  action: 'Compartir',
  actionAria: 'Compartir esta reseña con un enlace público',
  shared: 'Compartida',
  dialogTitle: 'Compartir esta reseña',
  consentTitle: 'Vas a publicar esta reseña en internet',
  consentPublished: 'Se publica: el juego, tu nota, el texto completo de la reseña, sus plataformas, géneros y puntos fuertes y débiles, tu nick y la fecha.',
  consentPrivate: 'No se publica: tu correo, tu identificador, tus Gists, tus horas de juego, tu foto ni el resto de tu biblioteca.',
  // Los números salen del rango del perfil, pero al usuario se le dicen sin nombrarlo: lo que necesita saber es
  // cuántos enlaces puede tener y cuánto duran, no de dónde salen esas cifras.
  consentDuration: (days: number, maxActive: number) => {
    const duracion = `${days} ${days === 1 ? 'día' : 'días'}`;
    return maxActive === 1
      ? `Puedes tener 1 enlace activo a la vez, y dura ${duracion}.`
      : `Puedes tener ${maxActive} enlaces activos a la vez, y cada uno dura ${duracion}.`;
  },
  consentRevocable: 'Puedes retirarlo cuando quieras desde Ajustes. Eso lo deja inaccesible, pero no recoge las copias que ya se hayan compartido.',
  consentAccept: 'He leído lo anterior y quiero publicarla',
  signedAs: (nick: string) => `Se publicará firmada como «${nick}».`,
  // Se enseña cuando el nombre con el que se firmaría no lo eligió su dueño (ver `nickIsAccountName`). El texto
  // NO nombra de dónde sale ese nombre: lo que importa es que se revise y se pueda cambiar antes de publicar.
  signedAsAccountName: 'Si prefieres otro, cambia tu nombre en tu perfil social antes de publicar.',
  confirm: 'Publicar enlace',
  cancel: 'Cancelar',
  publishing: 'Publicando…',
  copyLink: 'Copiar enlace',
  copied: 'Enlace copiado',
  shareNative: 'Compartir',
  // Renovar rehace el MISMO enlace con el texto de ahora y le devuelve su duración completa. No crea otro, así
  // que el que ya circula por ahí sigue funcionando y no se gasta cuota.
  renew: 'Renovar enlace',
  renewing: 'Renovando…',
  accept: 'Aceptar',
  revoke: 'Dejar de compartir',
  revoking: 'Retirando…',
  renewed: 'Enlace actualizado con la reseña de ahora.',
  screenTitle: 'Reseñas compartidas',
  screenSubtitle: 'Enlaces públicos que has creado. Caducan solos; puedes retirarlos antes.',
  screenEmpty: 'No has compartido ninguna reseña todavía.',
  counter: (active: number, max: number) => `${active} de ${max} ${max === 1 ? 'enlace activo' : 'enlaces activos'}`,
  expiresIn: (days: number) => (days <= 0 ? 'Caduca hoy' : `Caduca en ${days} ${days === 1 ? 'día' : 'días'}`),
  bannedTitle: 'No puedes compartir reseñas',
  bannedReason: (reason: string) => (reason ? `Motivo: ${reason}` : 'La administración ha retirado esta posibilidad de tu cuenta.'),
  // Sin sesión de Google no se puede ofrecer el botón (publicar exige identidad), pero antes se quitaba sin decir
  // nada y quien lo buscaba no tenía forma de saber por qué no estaba. Se dice qué falta y dónde se resuelve.
  signInRequired: 'Entra con Google para compartir',
  signInRequiredHint: 'El enlace lleva tu nombre, así que primero tienes que entrar con Google. Puedes hacerlo en el Espacio social.',
  // El servidor dice QUÉ pasa y adjunta los datos; estos dos dicen QUÉ HACER, que es lo que convierte un error
  // en algo accionable. Solo se pintan cuando la respuesta trae el detalle de la cuota.
  quotaReached: (max: number) => `Tienes ${max} de ${max} enlaces activos.`,
  quotaHint: (days: number) =>
    days > 0
      ? `Retira uno o espera ${days} ${days === 1 ? 'día' : 'días'} a que caduque el más antiguo.`
      : 'Retira uno o espera a que caduque el más antiguo.',
  // Página pública: la lee alguien que puede no conocer la app ni tener cuenta. Nada de jerga interna, y el
  // aviso deja claro que esto lo publica una persona y puede dejar de estar.
  publicAria: 'Reseña compartida',
  publicLoading: 'Cargando la reseña…',
  publicGoneTitle: 'Este enlace ya no está disponible',
  publicGoneBody: 'Puede haber caducado o haberlo retirado quien lo compartió.',
  publicCta: 'Ir a la página principal',
  publicNavAria: 'Navegación',
} as const;
