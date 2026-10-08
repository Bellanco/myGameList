import type { Page } from '@playwright/test';

/**
 * FIRESTORE, SERVIDO DESDE AQUÍ.
 *
 * La sección de premios lee su calendario —y el archivo publicado— de Firestore REAL y SIN SESIÓN: la
 * configuración de la edición es la única lectura pública de la porra (ver `fetchVotingConfig`). Probar contra
 * ese servidor hace que el recorrido enseñe una pantalla distinta según el mes: con una edición abierta se pinta
 * la portada, y sin ninguna en marcha `/premios` salta a los resultados publicados (ver el `Navigate` de
 * `PremiosHub`). Eso es lo que dejó esta auditoría con dieciséis casos en rojo al publicarse la edición de 2025
 * —el título de la portada ya no existía en esa dirección—, y ni uno de los dieciséis hablaba de color.
 *
 * Se responde al `batchGet` del SDK con los documentos que se le den, en el formato REST de Firestore: `found`
 * con los campos tipados, o `missing` para lo que no se sirva. Lo que no sea un `batchGet` —las consultas que
 * resuelven los perfiles de la clasificación— se contesta vacío: sin sesión tampoco llegarían a ninguna parte.
 *
 * Así cada recorrido FIJA el estado que quiere probar, y de paso prueba los que en producción duran semanas
 * sueltas: una votación abierta no está abierta casi nunca.
 */
const campoTexto = (value: string) => ({ stringValue: value });
const campoEntero = (value: number) => ({ integerValue: String(value) });
const campoDecimal = (value: number) => ({ doubleValue: value });
const campoBool = (value: boolean) => ({ booleanValue: value });
const campoMapa = (fields: Record<string, unknown>) => ({ mapValue: { fields } });
const campoLista = (values: unknown[]) => ({ arrayValue: { values } });

type DocumentosDePrueba = Record<string, Record<string, unknown>>;

export async function sirveFirestore(page: Page, documentos: DocumentosDePrueba): Promise<void> {
  await page.route('**/firestore.googleapis.com/**', async (route) => {
    const cuerpo = route.request().postDataJSON() as { documents?: string[] } | null;
    const readTime = new Date().toISOString();
    const salida = (cuerpo?.documents || []).map((name) => {
      // El nombre llega completo (`projects/…/documents/premiosConfig/voting`); la clave es lo que va detrás.
      const ruta = name.split('/documents/')[1] || '';
      const fields = documentos[ruta];
      return fields ? { found: { name, fields, createTime: readTime, updateTime: readTime }, readTime } : { missing: name, readTime };
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(salida) });
  });
}

/** Una edición ABIERTA, con su cierre a una semana vista: es el estado que más pinta la portada. */
export function edicionAbierta(): DocumentosDePrueba {
  const cierre = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return {
    'premiosConfig/voting': {
      isOpen: campoBool(true),
      season: campoEntero(2026),
      seasonId: campoTexto('2026'),
      seasonName: campoTexto('Premios de prueba 2026'),
      closesAt: campoTexto(new Date(cierre).toISOString()),
      closesAtMillis: campoEntero(cierre),
      visible: campoBool(true),
    },
  };
}

/**
 * Una edición YA PUBLICADA: sin plazo abierto y con archivo. Es lo que ve hoy cualquiera que entre en la
 * sección, porque la portada sin edición en marcha manda derecha a los resultados.
 *
 * El archivo va con lo que hace falta para que la pantalla enseñe TODO lo suyo: un empate en el primer puesto
 * —dos nombres en un escalón y el rótulo de empate—, los tres metales del podio, filas por debajo del podio y
 * un par de categorías con ganador.
 */
export function edicionPublicada(): DocumentosDePrueba {
  const filaDeClasificacion = (rank: number, profileId: string, nickname: string, points: number) =>
    campoMapa({ rank: campoEntero(rank), profileId: campoTexto(profileId), nickname: campoTexto(nickname), points: campoDecimal(points) });
  const categoriaArchivada = (id: string, es: string, en: string, winner: string, opciones: string[]) =>
    campoMapa({
      id: campoTexto(id),
      title: campoMapa({ es: campoTexto(es), en: campoTexto(en) }),
      winner: campoTexto(winner),
      weight: campoEntero(1),
      options: campoLista(opciones.map((name) => campoMapa({ id: campoTexto(name.toLowerCase()), name: campoTexto(name) }))),
    });

  return {
    'premiosConfig/voting': {
      isOpen: campoBool(false),
      season: campoEntero(2025),
      seasonId: campoTexto('2025'),
      seasonName: campoTexto('Premios de prueba 2025'),
      lastPublishedId: campoTexto('2025'),
      visible: campoBool(true),
    },
    'premiosResults/2025': {
      season: campoEntero(2025),
      seasonId: campoTexto('2025'),
      name: campoTexto('Premios de prueba 2025'),
      totalBallots: campoEntero(14),
      winners: campoMapa({ juego: campoTexto('hollow knight'), direccion: campoTexto('celeste') }),
      categoriesSnapshot: campoLista([
        categoriaArchivada('juego', 'Juego del año', 'Game of the year', 'hollow knight', ['Hollow Knight', 'Celeste']),
        categoriaArchivada('direccion', 'Mejor dirección', 'Best direction', 'celeste', ['Celeste', 'Hades']),
      ]),
      leaderboard: campoLista([
        filaDeClasificacion(1, 'perfil-uno', 'Primera', 16),
        filaDeClasificacion(1, 'perfil-dos', 'Segunda', 16),
        filaDeClasificacion(2, 'perfil-tres', 'Tercera', 14.5),
        filaDeClasificacion(3, 'perfil-cuatro', 'Cuarta', 12),
        filaDeClasificacion(4, 'perfil-cinco', 'Quinta', 9),
      ]),
    },
  };
}
