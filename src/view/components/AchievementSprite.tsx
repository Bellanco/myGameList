// Sprite de las MEDALLAS: los 38 cuadros del catálogo más el filtro `#imp` que los pinta.
//
// SE MONTA UNA VEZ POR PANTALLA Y NUNCA DESDE `App.tsx`. El sprite general (`IconSprite`) sí entra en el
// arranque, y el presupuesto son 215 kB comprimidos (`BOOT_PAYLOAD_BUDGET_KB` en `scripts/ci-validate.js`):
// meter ahí otros 38 símbolos que solo se ven en dos rutas perezosas es exactamente el error que esa validación
// está puesta para cazar. Lo montan la pantalla de logros y la ficha del hub, que viven en chunks distintos, así
// que el empaquetador lo sacará a un chunk compartido — es lo correcto y no hay que forzarlo. Como son rutas
// distintas, nunca hay dos sprites a la vez y no hay colisión de `id` que temer; el prefijo `ach-` tampoco
// choca con el `icon-` del sprite general.
//
// CADA CUADRO es una escena plana sobre `viewBox` 32 en cinco tonos (`--sc-*`, definidos en
// `styles/achievements.scss`) que el filtro convierte en pintura: dos desplazamientos por turbulencia, un
// desenfoque que funde los tonos y un relieve de empaste iluminado a contraluz. Coste de autoría: cero por
// icono, porque el filtro es uno solo y lo comparten las 38.
//
// GENERADO desde `docs/logros/achievement-sprite.svg`, que es la fuente de diseño. Al retocar un cuadro se
// retoca allí y se vuelve a traer.
export function AchievementSprite() {
  return (
    <svg aria-hidden="true" className="svg-sprite">
      <filter id="imp" x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
          <feTurbulence type="turbulence" baseFrequency="0.055" numOctaves="2" seed="11" result="sw"/>
          <feDisplacementMap in="SourceGraphic" in2="sw" scale="1.9" xChannelSelector="R" yChannelSelector="G" result="d1"/>
          <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed="5" result="br"/>
          <feDisplacementMap in="d1" in2="br" scale="0.65" xChannelSelector="R" yChannelSelector="B" result="d2"/>
          <feGaussianBlur in="d2" stdDeviation="0.3" result="paint"/>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="9" result="bump"/>
          <feDiffuseLighting in="bump" lightingColor="#ffffff" surfaceScale="1.35" diffuseConstant="1" result="lit">
            <feDistantLight azimuth="228" elevation="52"/>
          </feDiffuseLighting>
          <feComposite in="lit" in2="paint" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/>
        </filter>


        <symbol id="ach-completados" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="2" y="3" width="28" height="21" rx="2" fill="var(--sc-sky)" opacity=".22"/><rect x="9" y="6" width="14" height="3.4" rx="1.2" fill="var(--sc-hi)"/><rect x="6" y="13" width="20" height="2.2" rx="1.1" fill="var(--sc-lt)" opacity=".85"/><rect x="8" y="17" width="16" height="2.2" rx="1.1" fill="var(--sc-lt)" opacity=".5"/><rect x="10" y="21" width="12" height="2.2" rx="1.1" fill="var(--sc-lt)" opacity=".25"/><rect x="6" y="27" width="20" height="3" rx="1.5" fill="var(--sc-far)"/></symbol>


        <symbol id="ach-abandonos-razonados" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><rect y="24" width="32" height="8" fill="var(--sc-near)"/><path d="M6 16l2.5 8h4l-1.5-8z" fill="var(--sc-hi)" opacity=".45"/><path d="M17 16l1 8h4l-2-8z" fill="var(--sc-hi)" opacity=".45"/><path d="M3 7h13l6 4.5-6 4.5H3z" fill="var(--sc-far)"/><path d="M3 7l3-5h3l-1 5z" fill="var(--sc-far)"/><circle cx="8" cy="11.5" r="2.3" fill="var(--sc-lt)"/><rect x="10" y="27" width="12" height="2.6" rx="1.3" fill="var(--sc-hi)"/></symbol>


        <symbol id="ach-constancia" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="1" y="1" width="30" height="30" fill="var(--sc-sky)" opacity=".14"/><ellipse cx="7" cy="16" rx="4.6" ry="9" fill="var(--sc-far)"/><ellipse cx="7" cy="16" rx="2.6" ry="6.6" fill="var(--sc-near)"/><ellipse cx="25" cy="16" rx="4.6" ry="9" fill="var(--sc-hi)"/><ellipse cx="25" cy="16" rx="2.6" ry="6.6" fill="var(--sc-near)"/><rect x="13" y="12.5" width="7" height="7" rx="1" fill="var(--sc-lt)"/><path d="M14.6 14.2h3.8v3.8h-3.8z" fill="var(--sc-far)" opacity=".5"/></symbol>


        <symbol id="ach-generos" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><circle cx="24" cy="7.5" r="4.4" fill="var(--sc-hi)"/><path d="M0 23l8-8 5.5 5 5-6L32 23v9H0z" fill="var(--sc-far)"/><rect x="25" y="12" width="3" height="8" fill="var(--sc-far)"/><path d="M25 10.5l1.5-2.5L28 10.5z" fill="var(--sc-far)"/><path d="M0 25h13l3 7H0z" fill="var(--sc-near)"/><rect x="6" y="19" width="2" height="6.5" fill="var(--sc-near)"/><circle cx="7" cy="17.6" r="1.9" fill="var(--sc-near)"/></symbol>


        <symbol id="ach-plataformas" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><rect x="1" y="7" width="13" height="17" rx="1" fill="var(--sc-near)"/><rect x="3" y="9.5" width="9" height="6" rx="1" fill="var(--sc-lt)" opacity=".75"/><rect x="4" y="20" width="7" height="2.4" fill="var(--sc-hi)"/><circle cx="23" cy="15" r="7.6" fill="var(--sc-far)"/><path d="M23 7.4a7.6 7.6 0 0 1 6.6 3.8L23 15z" fill="var(--sc-lt)" opacity=".45"/><circle cx="23" cy="15" r="2.4" fill="var(--sc-sky)"/></symbol>


        <symbol id="ach-rejugados" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><ellipse cx="16" cy="15" rx="12" ry="13.5" fill="var(--sc-far)"/><ellipse cx="16" cy="15" rx="8.2" ry="9.6" fill="var(--sc-sky)"/><ellipse cx="16" cy="15" rx="4.6" ry="5.8" fill="var(--sc-lt)" opacity=".6"/><rect x="14.4" y="10.4" width="3.2" height="9.2" rx="1.5" fill="var(--sc-hi)"/><rect x="11.4" y="13.4" width="9.2" height="3.2" rx="1.5" fill="var(--sc-hi)"/></symbol>


        <symbol id="ach-maraton" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M0 0h32v32H0z" fill="var(--sc-hi)" opacity=".1"/><path d="M2 24L14 0h6L8 24z" fill="var(--sc-hi)" opacity=".22"/><path d="M2.5 13.5C2.5 9.4 8.5 6.6 16 6.6s13.5 2.8 13.5 6.9c0 5.2-5 8.6-13.5 8.6S2.5 18.7 2.5 13.5z" fill="var(--sc-lt)"/><path d="M6.6 13c1.9-2.6 5.3-2.6 7.2 0-1.9 2.6-5.3 2.6-7.2 0z" fill="var(--sc-near)"/><path d="M18.2 13c1.9-2.6 5.3-2.6 7.2 0-1.9 2.6-5.3 2.6-7.2 0z" fill="var(--sc-near)"/><rect x="14.6" y="6.8" width="2.8" height="15" fill="var(--sc-near)" opacity=".18"/></symbol>


        <symbol id="ach-paciencia" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M0 0h12v12z" fill="var(--sc-lt)" opacity=".2"/><path d="M0 0l12 12M0 6l6 6M6 0l6 6M0 12L12 0" stroke="var(--sc-lt)" strokeWidth="1" opacity=".55" fill="none"/><rect x="1" y="24" width="30" height="3.5" fill="var(--sc-far)"/><rect x="8" y="7" width="11" height="17" rx="1" fill="var(--sc-far)"/><rect x="9.5" y="9" width="8" height="7" rx="1" fill="var(--sc-lt)" opacity=".5"/><rect x="9.5" y="19" width="8" height="1.8" fill="var(--sc-hi)"/><rect x="20" y="10" width="4" height="14" rx="1" fill="var(--sc-near)" opacity=".7"/></symbol>


        <symbol id="ach-criterio" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M16 3l13 9.5-5 15.5H8L3 12.5z" fill="var(--sc-far)" opacity=".45"/><path d="M16 3v25M3 12.5h26M16 3l8 25M16 3L8 28" stroke="var(--sc-sky)" strokeWidth=".7" opacity=".5" fill="none"/><path d="M16 6.5l9.5 7-3 8-8.5 3-7-9z" fill="var(--sc-hi)"/><circle cx="16" cy="6.5" r="1.6" fill="var(--sc-lt)"/><circle cx="25.5" cy="13.5" r="1.6" fill="var(--sc-lt)"/><circle cx="7" cy="15.5" r="1.6" fill="var(--sc-lt)"/></symbol>


        <symbol id="ach-memoria-larga" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><path d="M5 4h22v24H10l-5-5z" fill="var(--sc-lt)"/><rect x="5" y="4" width="22" height="6.5" fill="var(--sc-far)"/><rect x="8" y="6" width="7" height="2.6" rx="1" fill="var(--sc-near)" opacity=".55"/><rect x="9" y="13" width="14" height="9" rx="1" fill="var(--sc-hi)"/><rect x="11" y="15.5" width="10" height="1.6" fill="var(--sc-near)" opacity=".45"/><rect x="11" y="18.5" width="7" height="1.6" fill="var(--sc-near)" opacity=".45"/></symbol>


        <symbol id="ach-deshielo" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><circle cx="26" cy="6" r="4" fill="var(--sc-hi)"/><rect y="25" width="32" height="7" fill="var(--sc-near)"/><path d="M5 6h17v17H5z" fill="var(--sc-lt)" opacity=".9"/><path d="M5 23h17l-2.5 3H7.5z" fill="var(--sc-lt)" opacity=".45"/><rect x="8.5" y="12" width="10" height="8" rx="1" fill="var(--sc-hi)"/><rect x="8.5" y="15" width="10" height="2" fill="var(--sc-near)"/><ellipse cx="12" cy="26" rx="10" ry="2.4" fill="var(--sc-far)"/></symbol>


        <symbol id="ach-estanteria" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><rect x="2" y="23" width="27" height="6" rx="1" fill="var(--sc-near)"/><rect x="4" y="24.4" width="5" height="3.2" fill="var(--sc-lt)" opacity=".35"/><rect x="4" y="16" width="23" height="6" rx="1" fill="var(--sc-far)"/><rect x="6" y="17.4" width="5" height="3.2" fill="var(--sc-lt)" opacity=".35"/><rect x="3" y="9" width="25" height="6" rx="1" fill="var(--sc-near)"/><rect x="5" y="10.4" width="5" height="3.2" fill="var(--sc-lt)" opacity=".35"/><rect x="6" y="2" width="20" height="6" rx="1" fill="var(--sc-hi)"/><rect x="8" y="3.4" width="5" height="3.2" fill="var(--sc-near)" opacity=".35"/></symbol>


        <symbol id="ach-veterano" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><rect x="11" y="1" width="9" height="7" rx="1" fill="var(--sc-hi)"/><rect x="13" y="2.6" width="5" height="2.6" fill="var(--sc-near)" opacity=".4"/><rect x="2" y="9" width="28" height="18" rx="3" fill="var(--sc-near)"/><rect x="5" y="12" width="18" height="12" rx="1.5" fill="var(--sc-far)"/><rect x="7.5" y="14.5" width="8" height="5" fill="var(--sc-lt)" opacity=".4"/><circle cx="26.5" cy="15" r="1.6" fill="var(--sc-lt)" opacity=".6"/><circle cx="26.5" cy="20" r="1.6" fill="var(--sc-lt)" opacity=".35"/><rect x="8" y="27" width="13" height="3" rx="1.5" fill="var(--sc-far)"/></symbol>


        <symbol id="ach-horas" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="2" y="2" width="28" height="28" rx="4" fill="var(--sc-sky)" opacity=".2"/><circle cx="16" cy="15" r="11.5" fill="var(--sc-far)"/><path d="M16 3.5a11.5 11.5 0 0 1 11.5 11.5H16z" fill="var(--sc-hi)"/><circle cx="16" cy="15" r="8" fill="var(--sc-near)"/><rect x="14.9" y="7.8" width="2.2" height="8" rx="1.1" fill="var(--sc-lt)"/><rect x="15.4" y="14" width="7" height="2.1" rx="1" fill="var(--sc-lt)"/></symbol>


        <symbol id="ach-resenas" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="1.5" y="6" width="29" height="19" rx="2.5" fill="var(--sc-far)"/><rect x="3.5" y="8" width="25" height="15" rx="1.5" fill="var(--sc-near)"/><rect x="6" y="11" width="20" height="2.4" rx="1.2" fill="var(--sc-lt)" opacity=".9"/><rect x="6" y="15.5" width="13" height="2.4" rx="1.2" fill="var(--sc-lt)" opacity=".6"/><path d="M13.5 20h5l-2.5 3z" fill="var(--sc-hi)"/></symbol>


        <symbol id="ach-cobertura" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-far)"/><rect x="2.5" y="2.5" width="27" height="27" rx="2" fill="var(--sc-lt)"/><rect x="5.5" y="6" width="4.5" height="4.5" rx="1" fill="var(--sc-hi)"/><rect x="12" y="7.2" width="14" height="2.2" fill="var(--sc-near)" opacity=".55"/><rect x="5.5" y="13" width="4.5" height="4.5" rx="1" fill="var(--sc-hi)"/><rect x="12" y="14.2" width="14" height="2.2" fill="var(--sc-near)" opacity=".55"/><rect x="5.5" y="20" width="4.5" height="4.5" rx="1" fill="var(--sc-hi)"/><rect x="12" y="21.2" width="9" height="2.2" fill="var(--sc-near)" opacity=".55"/><path d="M6.4 8.2l1.3 1.3 2-2.4M6.4 15.2l1.3 1.3 2-2.4M6.4 22.2l1.3 1.3 2-2.4" stroke="var(--sc-near)" strokeWidth="1.1" fill="none"/></symbol>


        <symbol id="ach-ficha-completa" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="2" y="2" width="13" height="13" rx="1.5" fill="var(--sc-far)"/><rect x="17" y="2" width="13" height="13" rx="1.5" fill="var(--sc-far)"/><rect x="2" y="17" width="13" height="13" rx="1.5" fill="var(--sc-far)"/><rect x="17" y="17" width="13" height="13" rx="1.5" fill="var(--sc-far)"/><rect x="7.4" y="4.5" width="2.2" height="8" fill="var(--sc-lt)"/><path d="M5.6 6.5h5.8" stroke="var(--sc-lt)" strokeWidth="1.6"/><path d="M23.5 4.5a3 3 0 0 1 3 3v5h-6v-5a3 3 0 0 1 3-3z" fill="var(--sc-hi)"/><path d="M8.5 19.5h5l1.2 4-3.7 5-3.7-5z" fill="var(--sc-lt)"/><rect x="20" y="19.5" width="7" height="9" rx="1" fill="var(--sc-hi)"/></symbol>


        <symbol id="ach-autopsia" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M16 2c6.6 0 11 4.6 11 10.6 0 3.7-1.9 6.4-4.4 8v3.4H9.4v-3.4C6.9 19 5 16.3 5 12.6 5 6.6 9.4 2 16 2z" fill="var(--sc-lt)"/><ellipse cx="11.6" cy="13.4" rx="3" ry="3.4" fill="var(--sc-near)"/><ellipse cx="20.4" cy="13.4" rx="3" ry="3.4" fill="var(--sc-near)"/><path d="M14.4 18h3.2l-1.6-3.2z" fill="var(--sc-near)"/><rect x="3" y="26" width="26" height="4" rx="1" fill="var(--sc-hi)"/></symbol>


        <symbol id="ach-luces-y-sombras" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><rect x="16" width="16" height="32" fill="var(--sc-near)"/><path d="M0 22l6-7 4 4.5 5-6.5v19H0z" fill="var(--sc-hi)"/><path d="M32 22l-6-7-4 4.5-5-6.5v19h15z" fill="var(--sc-far)" opacity=".55"/><rect y="28" width="16" height="4" fill="var(--sc-far)"/><rect x="16" y="28" width="16" height="4" fill="var(--sc-lt)" opacity=".18"/></symbol>


        <symbol id="ach-amistades" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><rect x="0.5" y="7" width="15" height="10" rx="4.5" fill="var(--sc-far)"/><rect x="4.4" y="9.6" width="1.7" height="4.8" rx=".8" fill="var(--sc-near)"/><rect x="2.8" y="11.2" width="4.9" height="1.7" rx=".8" fill="var(--sc-near)"/><circle cx="11.8" cy="11.2" r="1.2" fill="var(--sc-near)"/><circle cx="11.8" cy="14" r="1.2" fill="var(--sc-near)"/><rect x="16.5" y="16" width="15" height="10" rx="4.5" fill="var(--sc-hi)"/><rect x="20.4" y="18.6" width="1.7" height="4.8" rx=".8" fill="var(--sc-near)"/><rect x="18.8" y="20.2" width="4.9" height="1.7" rx=".8" fill="var(--sc-near)"/><circle cx="27.8" cy="20.2" r="1.2" fill="var(--sc-near)"/></symbol>


        <symbol id="ach-conversador" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><rect y="26" width="32" height="6" fill="var(--sc-near)"/><path d="M20 13h2.8a4.2 4.2 0 0 1 0 8.4H20" stroke="var(--sc-lt)" strokeWidth="2.8" fill="none"/><path d="M5 9h15v17H5z" fill="var(--sc-far)"/><path d="M5 9c0-3.3 3.4-5.2 7.5-5.2S20 5.7 20 9z" fill="var(--sc-lt)"/><rect x="5" y="15.5" width="15" height="2.2" fill="var(--sc-hi)"/><rect x="5" y="20" width="15" height="1.6" fill="var(--sc-hi)" opacity=".5"/></symbol>


        <symbol id="ach-ano-redondo" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><circle cx="4" cy="4" r=".9" fill="var(--sc-lt)"/><circle cx="16" cy="3" r=".7" fill="var(--sc-lt)" opacity=".7"/><circle cx="28" cy="6" r=".9" fill="var(--sc-lt)" opacity=".8"/><circle cx="10" cy="19" r=".7" fill="var(--sc-lt)" opacity=".5"/><circle cx="9.5" cy="11" r="5.5" fill="var(--sc-hi)"/><path d="M25 5.5a6.6 6.6 0 0 0 0 13 7.2 7.2 0 0 1 0-13z" fill="var(--sc-lt)"/><path d="M0 22c5-2.4 9 2.4 13.5 0S23 20 32 22v10H0z" fill="var(--sc-far)"/><path d="M3 26c4-1.6 7 1.6 11 0" stroke="var(--sc-lt)" strokeWidth="1.1" opacity=".45" fill="none"/></symbol>


        <symbol id="ach-buena-cosecha" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><rect y="19" width="32" height="13" fill="var(--sc-near)"/><path d="M0 22h32M0 26h32M0 30h32" stroke="var(--sc-far)" strokeWidth="1.6" opacity=".55"/><rect x="14.9" y="9" width="2.2" height="13" fill="var(--sc-far)"/><path d="M16 9c0-3.6 2.8-6.2 6.4-6.2C22.4 6.4 19.6 9 16 9zM16 9c0-3.6-2.8-6.2-6.4-6.2C9.6 6.4 12.4 9 16 9z" fill="var(--sc-hi)"/><path d="M16 15.5c0-2.9 2.2-5 5.1-5-.1 2.9-2.2 5-5.1 5zM16 15.5c0-2.9-2.2-5-5.1-5 .1 2.9 2.2 5 5.1 5z" fill="var(--sc-hi)" opacity=".68"/></symbol>


        <symbol id="ach-obra-maestra" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="2.5" y="3" width="27" height="21" fill="var(--sc-hi)"/><rect x="5.5" y="6" width="21" height="15" fill="var(--sc-sky)"/><circle cx="21" cy="10.5" r="2.6" fill="var(--sc-lt)"/><path d="M5.5 21l6-6.5 4.5 4 3.5-3 7 5.5z" fill="var(--sc-far)"/><rect x="10" y="26" width="12" height="2.4" rx="1.2" fill="var(--sc-hi)" opacity=".5"/></symbol>


        <symbol id="ach-sofa" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><path d="M2 12h28v10H2z" fill="var(--sc-far)" opacity=".55"/><rect x="0" y="15" width="4" height="10" rx="2" fill="var(--sc-far)"/><rect x="28" y="15" width="4" height="10" rx="2" fill="var(--sc-far)"/><rect x="2" y="10" width="28" height="12" rx="5" fill="var(--sc-near)"/><rect x="9" y="12.5" width="14" height="7" rx="1" fill="var(--sc-hi)"/><circle cx="5.8" cy="14" r="1.9" fill="var(--sc-lt)" opacity=".8"/><circle cx="26.2" cy="14" r="1.9" fill="var(--sc-lt)" opacity=".8"/><circle cx="5.8" cy="19" r="1.2" fill="var(--sc-lt)" opacity=".4"/></symbol>


        <symbol id="ach-speedrun" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="1" y="5" width="11" height="2.4" rx="1.2" fill="var(--sc-far)"/><rect x="0" y="10" width="8" height="2.4" rx="1.2" fill="var(--sc-far)" opacity=".65"/><rect x="2" y="15" width="10" height="2.4" rx="1.2" fill="var(--sc-far)" opacity=".4"/><path d="M23 1l-9 15h5.5l-2.5 12 10.5-16H22z" fill="var(--sc-hi)"/><rect x="1" y="21" width="18" height="7" rx="1.5" fill="var(--sc-far)"/><rect x="3" y="23" width="3.4" height="3" fill="var(--sc-lt)"/><rect x="8" y="23" width="3.4" height="3" fill="var(--sc-lt)"/><rect x="13" y="23" width="3.4" height="3" fill="var(--sc-lt)" opacity=".6"/></symbol>


        <symbol id="ach-segunda-vuelta" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M16 1c1.8 5.6-1.2 7.4-1.2 10.8 0 1.9 1.5 3.1 1.5 3.1s-3.4-.7-4.5-3.4C10 15 7.5 18 7.5 21.2a8.5 8.5 0 0 0 17 0c0-5.4-4.5-9.6-8.5-20.2z" fill="var(--sc-hi)"/><path d="M16 12.5c1.9 3.4 3.9 5.2 3.9 7.9a3.9 3.9 0 0 1-7.8 0c0-2.4 2-4.2 3.9-7.9z" fill="var(--sc-lt)" opacity=".85"/><rect x="15.1" y="3" width="1.8" height="22" fill="var(--sc-lt)"/><rect x="10.5" y="9" width="11" height="1.8" rx=".9" fill="var(--sc-lt)"/><path d="M0 26c5-3.4 21-3.4 26 0v6H0z" fill="var(--sc-far)"/></symbol>


        <symbol id="ach-estanteria-cero" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><circle cx="26" cy="3" r=".8" fill="var(--sc-lt)" opacity=".6"/><circle cx="4" cy="6" r=".8" fill="var(--sc-lt)" opacity=".45"/><path d="M6 1h17l-3.5 4h-10z" fill="var(--sc-far)"/><rect x="12" y="4" width="4" height="2" fill="var(--sc-far)"/><path d="M11.5 6h5l6 15h-17z" fill="var(--sc-hi)" opacity=".33"/><rect x="12.8" y="6" width="2.6" height="15" fill="var(--sc-hi)"/><circle cx="14" cy="23" r="7.6" fill="var(--sc-far)"/><path d="M6.8 20.4c4.6 2.3 9.6 2.3 14.2 0" stroke="var(--sc-sky)" strokeWidth="1.7" fill="none"/><path d="M6.5 25.6h15" stroke="var(--sc-sky)" strokeWidth="1.5" opacity=".5" fill="none"/></symbol>


        <symbol id="ach-orgullo" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><path d="M0 32l14-20 6 8 4-5 8 17z" fill="var(--sc-far)"/><path d="M0 32l14-20 5 7L9 32z" fill="var(--sc-near)"/><rect x="12.6" y="3" width="2.2" height="12" fill="var(--sc-near)"/><path d="M14.8 3.8h11l-3 4 3 4h-11z" fill="var(--sc-hi)"/></symbol>


        <symbol id="ach-no-eres-tu" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><path d="M8 5h6v3h4V5h6v3h3v6h-3v3h-3v3h-3v3h-4v-3h-3v-3H8v-3H5V8h3z" fill="var(--sc-far)"/><path d="M8 5h6v3h4V5h6v3h3v6h-3v3h-3v3h-3v3h-2V5z" fill="var(--sc-near)" opacity=".35"/><path d="M17 3l-3.4 7.5 5 2.8-4 8.7" stroke="var(--sc-hi)" strokeWidth="2.1" fill="none"/><rect y="27" width="32" height="5" fill="var(--sc-near)"/></symbol>


        <symbol id="ach-tesis" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M2 5c5-2.2 10-2.2 13.2 1.4V28C12 24.8 7 24.8 2 27z" fill="var(--sc-lt)"/><path d="M30 5c-5-2.2-10-2.2-13.2 1.4V28c3.2-3.2 8.2-3.2 13.2-1z" fill="var(--sc-lt)" opacity=".82"/><path d="M4.5 9.5h8.5M4.5 13h8.5M4.5 16.5h8.5M4.5 20h6" stroke="var(--sc-near)" strokeWidth="1.2" opacity=".5" fill="none"/><path d="M19 9.5h8.5M19 13h8.5M19 16.5h8.5M19 20h6" stroke="var(--sc-near)" strokeWidth="1.2" opacity=".35" fill="none"/><rect x="14.9" y="5" width="2.2" height="23" fill="var(--sc-far)"/><rect x="22" y="2" width="3.5" height="9" fill="var(--sc-hi)"/><path d="M22 11l1.75 2L25.5 11z" fill="var(--sc-hi)"/></symbol>


        <symbol id="ach-vida-entera" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="2" y="3" width="28" height="24" rx="2.5" fill="var(--sc-far)"/><rect x="5" y="6" width="22" height="4" rx="2" fill="var(--sc-near)"/><rect x="5" y="6" width="22" height="4" rx="2" fill="var(--sc-hi)"/><rect x="5" y="13.5" width="5.5" height="9" rx="1" fill="var(--sc-lt)"/><rect x="12" y="13.5" width="5.5" height="9" rx="1" fill="var(--sc-lt)"/><rect x="19" y="13.5" width="5.5" height="9" rx="1" fill="var(--sc-lt)"/><rect x="6.4" y="17" width="2.7" height="1.6" fill="var(--sc-near)"/><rect x="13.4" y="17" width="2.7" height="1.6" fill="var(--sc-near)"/><rect x="20.4" y="17" width="2.7" height="1.6" fill="var(--sc-near)"/></symbol>


        <symbol id="ach-paso-primer-juego" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="2" y="4" width="28" height="24" rx="2.5" fill="var(--sc-far)" opacity=".45"/><rect x="7" y="9" width="18" height="3.6" rx="1.2" fill="var(--sc-lt)" opacity=".8"/><rect x="10" y="14" width="12" height="2" rx="1" fill="var(--sc-lt)" opacity=".4"/><rect x="7" y="19.5" width="18" height="5" rx="2.5" fill="var(--sc-hi)"/></symbol>


        <symbol id="ach-paso-resena" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M0 20h5v12H0zM7 13h4.5v19H7zM13.5 23h5v9h-5zM20 9h5.5v23H20zM27.5 17H32v15h-4.5z" fill="var(--sc-far)"/><rect x="8" y="16" width="2.2" height="9" fill="var(--sc-hi)"/><rect x="21.5" y="12" width="2.5" height="6" fill="var(--sc-hi)"/><rect x="1.5" y="22" width="2" height="6" fill="var(--sc-hi)" opacity=".6"/><rect y="2" width="32" height="5" fill="var(--sc-hi)"/><path d="M-1 2l4 5M5 2l4 5M11 2l4 5M17 2l4 5M23 2l4 5M29 2l4 5" stroke="var(--sc-near)" strokeWidth="2.2"/></symbol>


        <symbol id="ach-paso-sync" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><path d="M8.5 20a6 6 0 0 1-.5-12 8 8 0 0 1 15.3 2 5 5 0 0 1-1.3 10z" fill="var(--sc-lt)"/><path d="M16 30V22M16 20.5l-4 4.5M16 20.5l4 4.5" stroke="var(--sc-hi)" strokeWidth="2.6" fill="none"/><rect x="12" y="10" width="8" height="8" rx="1" fill="var(--sc-far)"/><rect x="14" y="10" width="4" height="3.4" fill="var(--sc-lt)"/></symbol>


        <symbol id="ach-paso-nota" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M16 4a13 13 0 0 1 13 13v3H3v-3A13 13 0 0 1 16 4z" fill="var(--sc-far)"/><path d="M16 4a13 13 0 0 1 13 13h-8a5 5 0 0 0-5-5z" fill="var(--sc-hi)"/><path d="M16 9.5a7.5 7.5 0 0 1 7.5 7.5v3h-15v-3A7.5 7.5 0 0 1 16 9.5z" fill="var(--sc-near)"/><path d="M14.6 20l8-8.6 2.4 2L17.4 21z" fill="var(--sc-lt)"/><rect x="3" y="20" width="26" height="4" rx="1.5" fill="var(--sc-far)"/></symbol>


        <symbol id="ach-paso-ruleta" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><path d="M16 1.5l13 7.5v14L16 30.5 3 23V9z" fill="var(--sc-far)"/><path d="M16 1.5l13 7.5L16 13.5 3 9z" fill="var(--sc-hi)"/><path d="M16 13.5L29 9v14L16 30.5z" fill="var(--sc-near)" opacity=".45"/><path d="M10.5 17l5.5-2 5.5 2-5.5 6.5z" fill="var(--sc-lt)" opacity=".7"/></symbol>


        <symbol id="ach-paso-tema" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="2" y="5" width="7" height="13" fill="var(--sc-near)"/><rect x="9" y="5" width="7" height="13" fill="var(--sc-far)" opacity=".55"/><rect x="16" y="5" width="7" height="13" fill="var(--sc-far)"/><rect x="23" y="5" width="7" height="13" fill="var(--sc-lt)"/><rect x="2" y="22" width="28" height="3" rx="1.5" fill="var(--sc-far)"/><rect x="18" y="19.5" width="4.5" height="8" rx="1.5" fill="var(--sc-hi)"/></symbol>

        <symbol id="ach-ritmo" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M16 2.5l7.5 27H8.5z" fill="var(--sc-far)"/><path d="M16 2.5l7.5 27h-7.5z" fill="var(--sc-near)" opacity=".3"/><rect x="8.5" y="24" width="15" height="2.4" fill="var(--sc-lt)" opacity=".55"/><path d="M16 27L23 9" stroke="var(--sc-hi)" strokeWidth="1.8" fill="none"/><rect x="18.4" y="14" width="5" height="3.4" rx=".8" fill="var(--sc-hi)" transform="rotate(-21 20.9 15.7)"/><circle cx="16" cy="27" r="1.8" fill="var(--sc-lt)"/></symbol>


        <symbol id="ach-degustacion" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><circle cx="16" cy="16" r="12.5" fill="var(--sc-lt)" opacity=".22"/><circle cx="16" cy="16" r="9.5" fill="var(--sc-far)"/><path d="M16 16V6.5A9.5 9.5 0 0 1 24.2 21z" fill="var(--sc-hi)"/><path d="M16 16l8.2 5A9.5 9.5 0 0 1 7.8 21z" fill="var(--sc-lt)" opacity=".85"/><circle cx="16" cy="16" r="1.9" fill="var(--sc-near)"/></symbol>


        <symbol id="ach-volvere" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="5" y="4" width="22" height="24" rx="2" fill="var(--sc-far)"/><rect x="8" y="7.5" width="12" height="1.8" fill="var(--sc-lt)" opacity=".45"/><rect x="8" y="11.5" width="9" height="1.8" fill="var(--sc-lt)" opacity=".3"/><path d="M20 4h5v14l-2.5-2.6L20 18z" fill="var(--sc-hi)"/><path d="M9 24.5a5.5 5.5 0 0 0 9-2" stroke="var(--sc-lt)" strokeWidth="1.8" fill="none"/><path d="M8 21.5l1 3.4 3.3-1.2z" fill="var(--sc-lt)"/></symbol>


        <symbol id="ach-revancha" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M6 5.5l14.5 17-2.6 2.2L4 7.5z" fill="var(--sc-lt)" opacity=".9"/><path d="M26 5.5L11.5 22.5l2.6 2.2L28 7.5z" fill="var(--sc-lt)" opacity=".55"/><rect x="14.4" y="14" width="3.2" height="3.2" fill="var(--sc-hi)" transform="rotate(45 16 15.6)"/><rect x="3.5" y="24" width="6" height="2.6" rx="1.3" fill="var(--sc-far)" transform="rotate(-40 6.5 25.3)"/><rect x="22.5" y="24" width="6" height="2.6" rx="1.3" fill="var(--sc-far)" transform="rotate(40 25.5 25.3)"/></symbol>


        <symbol id="ach-cadena-de-anos" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><rect x="1.5" y="12" width="12" height="8" rx="4" fill="none" stroke="var(--sc-lt)" strokeWidth="2.6"/><rect x="10" y="12" width="12" height="8" rx="4" fill="none" stroke="var(--sc-hi)" strokeWidth="2.6"/><rect x="18.5" y="12" width="12" height="8" rx="4" fill="none" stroke="var(--sc-lt)" strokeWidth="2.6"/><rect y="26" width="32" height="6" fill="var(--sc-near)" opacity=".5"/></symbol>


        <symbol id="ach-dieta" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="4" y="6" width="24" height="4.5" rx="1.2" fill="var(--sc-far)"/><rect x="4" y="13.5" width="17" height="4.5" rx="1.2" fill="var(--sc-far)" opacity=".7"/><rect x="4" y="21" width="9" height="4.5" rx="1.2" fill="var(--sc-hi)"/><path d="M27 15l-3.5 7h7z" fill="var(--sc-lt)" opacity=".8"/></symbol>


        <symbol id="ach-tutorial" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M3 5h26a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H12l-6 5v-5H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="var(--sc-far)"/><path d="M9 13.5l4.5 4.5L23 8.5" stroke="var(--sc-hi)" strokeWidth="3.2" fill="none"/></symbol>


        <symbol id="ach-platino" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><path d="M9 4h14v8a7 7 0 0 1-14 0z" fill="var(--sc-hi)"/><path d="M9 6H5v2.5A4.5 4.5 0 0 0 9.5 13zM23 6h4v2.5A4.5 4.5 0 0 1 22.5 13z" fill="var(--sc-lt)" opacity=".55"/><rect x="14" y="18.5" width="4" height="4.5" fill="var(--sc-hi)" opacity=".8"/><rect x="9.5" y="23" width="13" height="2.6" rx="1" fill="var(--sc-lt)"/><rect x="7.5" y="25.6" width="17" height="3" rx="1.2" fill="var(--sc-far)"/></symbol>


        <symbol id="ach-escaparate" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="2" y="9" width="28" height="17" fill="var(--sc-far)"/><rect x="4.5" y="11.5" width="10" height="12" fill="var(--sc-sky)"/><rect x="17.5" y="11.5" width="10" height="12" fill="var(--sc-sky)" opacity=".7"/><path d="M0 9l4-5h24l4 5z" fill="var(--sc-hi)"/><path d="M4 4l-1.5 5M10 4l-1 5M16 4v5M22 4l1 5M28 4l1.5 5" stroke="var(--sc-near)" strokeWidth="1.6"/><rect x="8" y="16" width="3" height="7.5" fill="var(--sc-lt)"/><rect x="21" y="16" width="3" height="7.5" fill="var(--sc-lt)" opacity=".8"/></symbol>


        <symbol id="ach-aniversario" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="4" y="15" width="24" height="11" rx="2" fill="var(--sc-lt)" opacity=".9"/><path d="M4 19c2.5 2.5 5 0 7.5 0S16.5 21.5 19 19s5 2.5 9 0v-2H4z" fill="var(--sc-far)"/><rect x="14.8" y="6.5" width="2.4" height="8" rx="1" fill="var(--sc-far)"/><path d="M16 2c2 2.4 2.6 3.6 2.6 4.7a2.6 2.6 0 0 1-5.2 0C13.4 5.6 14 4.4 16 2z" fill="var(--sc-hi)"/><rect x="4" y="24" width="24" height="2.4" fill="var(--sc-far)" opacity=".6"/></symbol>


        <symbol id="ach-paso-proximos" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-near)"/><rect x="6" y="20" width="20" height="7" rx="1.2" fill="var(--sc-far)"/><rect x="8" y="13" width="16" height="7" rx="1.2" fill="var(--sc-far)" opacity=".75"/><rect x="10" y="6" width="12" height="7" rx="1.2" fill="var(--sc-hi)"/><rect x="14.6" y="20" width="2.8" height="7" fill="var(--sc-near)" opacity=".35"/><rect x="15.2" y="6" width="1.6" height="7" fill="var(--sc-near)" opacity=".3"/></symbol>


        <symbol id="ach-paso-abandono" viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--sc-sky)"/><rect y="24" width="32" height="8" fill="var(--sc-near)"/><rect x="7" y="4" width="2.6" height="24" rx="1" fill="var(--sc-far)"/><path d="M9.6 5.5h15l-3.5 5 3.5 5h-15z" fill="var(--sc-lt)"/><path d="M9.6 5.5h15l-3.5 5H9.6z" fill="var(--sc-lt)" opacity=".6"/><circle cx="8.3" cy="3.4" r="1.6" fill="var(--sc-hi)"/></symbol>

    </svg>
  );
}
