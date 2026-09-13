// EL LIENZO DE LA ACTIVIDAD: el contrato entre este marcado y los seis `themes/*.scss`.
//
// El lienzo es la superficie que da suelo a la zona de actividad del feed (ver `.hub-feed-lienzo` en
// `_layout.scss`). Lo que sostienen estos tests NO es su aspecto —eso es CSS y cambia con la paleta— sino las
// tres cosas que los skins dan por hechas y que, si alguien las cambia aquí, se rompen EN SILENCIO: en un tema
// distinto del que tenga puesto quien hizo el cambio, y sin que falle nada.
//
//  1. Que el lienzo existe y ENVUELVE el contenido de la actividad. Si alguien lo saca de en medio, el vacío
//     vuelve a flotar sobre el fondo de la tarjeta, que es el problema que el lienzo resuelve.
//  2. Que hay EXACTAMENTE DOS ranuras (`<i>`). Cámara de pruebas, Sol y luna y Solo hay guerra las direccionan
//     con `:first-child` y `:last-child`; con una tercera, el selector se lleva la que no es y la decoración
//     aparece donde no toca. Con una sola, el segundo skin de cada par deja de pintar.
//  3. Que las ranuras son DECORATIVAS: van dentro de `aria-hidden`, porque no dicen nada que un lector de
//     pantalla deba anunciar.
//  4. Que el `data-fx` que sortea el componente cae SIEMPRE dentro del rango que los temas tienen escrito. Solo
//     hay guerra lo usa para elegir uno de sus trece sellos; un número de más se queda con el de reserva y nadie
//     se entera, porque el sello sigue saliendo — solo que siempre el mismo.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { SocialFeedScreen } from '../../src/view/components/socialhub/SocialFeedScreen';
import type { SocialFeedDayGroup, SocialFeedItem } from '../../src/viewmodel/social/socialFeed';

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  reportHandledError: vi.fn(async () => {}),
}));

function renderFeed(items: SocialFeedItem[] = []) {
  const groups: SocialFeedDayGroup[] = items.length ? [{ dayHeader: 'hoy', dayDate: new Date(), items }] : [];
  return render(
    <SocialFeedScreen
      SOCIAL_UI={SOCIAL_UI}
      socialDisplayName="Yo"
      ownVisiblePhotoURL=""
      currentSocialGistId="ffee1122aabb0001"
      loadingDirectory={false}
      openProfileDetail={() => {}}
      openProfileAchievements={() => {}}
      onOpenProfiles={() => {}}
      onOpenOwnProfile={() => {}}
      onOpenRequests={() => {}}
      pendingIncomingCount={0}
      groupedFeedItems={groups}
      feedItems={items}
      hasMoreFeed={false}
      showMoreFeed={() => {}}
      openActivityDetail={() => {}}
      openMoveReview={() => {}}
      handleActivityItemKeyDown={() => {}}
      composePostText=""
      setComposePostText={() => {}}
      publishingPost={false}
      handlePublishPost={() => {}}
      canPublishPosts={false}
      postMaxLength={1000}
      showPostCounter
      status=""
      statusKind="ok"
      handleSignOut={() => {}}
      offline={false}
      offlineHasCachedData={false}
    />,
  );
}

describe('lienzo de la actividad social', () => {
  it('envuelve el estado vacío, que es donde más se nota', () => {
    const { container } = renderFeed();

    const lienzo = container.querySelector('.hub-feed-lienzo');
    expect(lienzo).toBeTruthy();
    // El mensaje del vacío y su botón van DENTRO: si quedan fuera, vuelven a flotar sobre la tarjeta.
    expect(lienzo?.querySelector('.hub-feed-empty')?.textContent).toContain(SOCIAL_UI.feed.activityEmptyNoFriends);
  });

  it('sigue envolviendo la lista cuando sí hay actividad', () => {
    const { container } = renderFeed([
      {
        kind: 'post',
        id: 'p1',
        socialGistId: 'ffee1122aabb0001',
        profileId: 'u1',
        profileDisplayName: 'Marta',
        authorName: 'Marta',
        photoURL: '',
        text: 'Hola',
        updatedAt: new Date().toISOString(),
      } as unknown as SocialFeedItem,
    ]);

    expect(container.querySelector('.hub-feed-lienzo .hub-feed-activity-list')).toBeTruthy();
  });

  it('expone exactamente dos ranuras decorativas, que es lo que los skins direccionan', () => {
    const { container } = renderFeed();

    const fx = container.querySelector('.hub-feed-lienzo-fx');
    expect(fx).toBeTruthy();
    // Dos: ni una (Sol y luna perdería el destello de la fugaz) ni tres (`:last-child` cambiaría de elemento).
    expect(fx?.querySelectorAll('i')).toHaveLength(2);
    expect(fx?.getAttribute('aria-hidden')).toBe('true');
  });

  it('sortea un `data-fx` dentro del rango, y no cambia mientras la pantalla está montada', () => {
    // Cien montajes: suficiente para que un rango mal puesto (un `Math.random() * n` de más) salga a la primera.
    const vistos = new Set<number>();
    for (let i = 0; i < 100; i += 1) {
      const { container, unmount } = renderFeed();
      const fx = container.querySelector('.hub-feed-lienzo-fx')?.getAttribute('data-fx');
      expect(fx).not.toBeNull();
      const n = Number(fx);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(13);
      vistos.add(n);
      unmount();
    }
    // Y que de verdad rota: con cien tiradas sobre trece huecos, ver uno solo sería un sorteo roto.
    expect(vistos.size).toBeGreaterThan(1);
  });

  it('Solo hay guerra tiene un sello escrito para cada número que el componente puede sortear', () => {
    // El acoplamiento es CSS↔TSX y ningún test de render lo ve: aquí se lee la hoja y se comprueba a mano.
    const skin = readFileSync('src/styles/themes/grimdark.scss', 'utf8');
    const declarados = new Set([...skin.matchAll(/\.hub-feed-lienzo-fx\[data-fx="(\d+)"\]/g)].map((m) => Number(m[1])));
    for (let i = 0; i < 13; i += 1) {
      expect(declarados, `falta el sello para data-fx="${i}"`).toContain(i);
    }
  });
});
