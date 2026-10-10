// Los textos de la cápsula del aviso legal (`LegalConsentToast`): condiciones nuevas por aceptar, para quien no abre
// el hub (docs/plan-feed-sin-vacio.md, Fase 6). Viven aquí y no en `legal.ts` porque ese módulo viaja en el arranque
// (lo usa la puerta del hub) y estos textos solo los pinta una cápsula perezosa que casi nunca sale.
export const LEGAL_NOTICE_UI = {
  kicker: 'Condiciones',
  title: 'Hay condiciones nuevas',
  text: 'Acéptalas para que tus amigos sigan viendo tu actividad.',
  aria: 'Hay condiciones nuevas del espacio social. Abrir para revisarlas y aceptarlas',
  announce: 'Hay condiciones nuevas del espacio social: acéptalas para que tus amigos sigan viendo tu actividad.',
} as const;
