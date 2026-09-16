import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Notice } from '../../src/view/components/Notice';
import { StatusBanner } from '../../src/view/components/StatusBanner';
import { HubOfflineNotice } from '../../src/view/components/socialhub/HubOfflineNotice';
import { SocialProfileScreen } from '../../src/view/components/socialhub/SocialProfileScreen';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';

/**
 * EL AVISO ES UNO SOLO.
 *
 * Lo que aquí se prueba no es cómo se ve —eso lo miden los recorridos de axe y el ojo—, sino la propiedad que
 * justificaba unificarlo: que los sitios que avisan usan LA MISMA PIEZA. Antes había cuatro bloques a medida
 * (`.status-banner > div`, `.update-notice-card`, `.hub-offline`, `.hub-profile-requirement`) y cambiar el
 * lenguaje de los avisos obligaba a acordarse de los cuatro. Si alguien vuelve a pintar uno por su cuenta, este
 * fichero se pone rojo.
 */

describe('Notice — la pieza', () => {
  it('pinta el tono, el título y el cuerpo', () => {
    const { container } = render(<Notice tone="err" title="Error">No se pudo guardar</Notice>);

    const aviso = container.querySelector('.ach-toast.is-notice');
    expect(aviso).toHaveClass('is-err');
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('No se pudo guardar')).toBeInTheDocument();
  });

  it('el peso ligero se distingue en el marcado, no solo a ojo', () => {
    const { container } = render(<Notice inline tone="warn" title="Sin conexión" />);

    expect(container.querySelector('.ach-toast.is-notice')).toHaveClass('is-compact');
  });

  it('sin acciones no deja la caja vacía, y el disco del tono va siempre', () => {
    const { container } = render(<Notice tone="ok">Guardado</Notice>);

    expect(container.querySelector('.ach-toast-action')).toBeNull();
    // El disco es lo que hace que esto se lea como un aviso de la app y no como una caja de texto.
    expect(container.querySelector('.ach-toast-disc')).toBeInTheDocument();
  });

  it('es la cápsula del aviso de logro, que es lo que hace que los skins de paleta la cuadren solos', () => {
    // `.ach-toast` no es decorativo: los skins cuelgan de esa clase (el chaflán del HUD en Sin futuro, la placa
    // recta en Cámara de pruebas). Si el aviso dejara de llevarla, perdería la identidad de los seis temas.
    const { container } = render(<Notice tone="ok" title="Guardado" />);

    expect(container.querySelector('.ach-toast')).toHaveClass('is-notice');
    expect(container.querySelector('.ach-toast-sheen')).toBeInTheDocument();
  });

  it('el aria y el role los pone quien lo usa: el aviso no se anuncia por su cuenta', () => {
    // Es deliberado. El de estado escribe en una región viva aparte que está SIEMPRE montada (montarla con el
    // mensaje ya dentro no anuncia nada), así que si esta pieza trajera `role="status"` de serie lo anunciaría
    // todo dos veces.
    const { container } = render(<Notice tone="ok">Guardado</Notice>);
    const aviso = container.querySelector('.ach-toast.is-notice');

    expect(aviso).not.toHaveAttribute('role');

    const { container: c2 } = render(<Notice inline tone="warn" role="status" aria-label="Sin conexión" />);
    expect(c2.querySelector('.ach-toast.is-notice')).toHaveAttribute('role', 'status');
  });
});

describe('Notice — los sitios que avisan usan la misma pieza', () => {
  it('el aviso de estado de la app', () => {
    const { container } = render(<StatusBanner notice={{ kind: 'ok', message: 'Juego guardado' }} />);

    // Ya no tiene franja propia: la cápsula va al carril flotante que monta `App` (ver `_notice.scss`).
    const aviso = container.querySelector('.ach-toast.is-notice');
    expect(aviso).toBeInTheDocument();
    expect(aviso).toHaveClass('is-ok');
    // Dentro del aviso, no con `getByText`: el mensaje sale DOS veces a propósito —una visible y otra en la
    // región viva de solo-lectores, que es la que lo anuncia— y eso es justo lo que no hay que romper.
    expect(aviso).toHaveTextContent('Juego guardado');
    expect(container.querySelector('.sr-only[role="status"]')).toHaveTextContent('Correcto: Juego guardado');
  });

  it('el «sin conexión» del espacio social', () => {
    const { container } = render(<HubOfflineNotice hasCachedData />);

    const aviso = container.querySelector('.ach-toast.is-notice');
    expect(aviso).toHaveClass('is-compact', 'is-warn');
    expect(aviso).toHaveAttribute('role', 'status');
    expect(screen.getByText(SOCIAL_UI.offline.body)).toBeInTheDocument();
  });

  it('el requisito de alta del editor de perfil', () => {
    const { container } = render(
      <SocialProfileScreen
        SOCIAL_UI={SOCIAL_UI}
        profileName=""
        setProfileName={vi.fn()}
        completedGames={[]}
        hydratingProfile={false}
        savingProfile={false}
        hasCreatedProfile={false}
        onSaveProfile={vi.fn()}
        onSignOut={vi.fn()}
        onBack={vi.fn()}
        status=""
        statusKind=""
        hiddenTabs={[]}
        onHiddenTabsChange={vi.fn()}
        hideReplayable={false}
        setHideReplayable={vi.fn()}
        hideRetry={false}
        setHideRetry={vi.fn()}
      />,
    );

    // Sin juegos completados no se puede crear el perfil, y eso se dice con la misma pieza que todo lo demás.
    const aviso = container.querySelector('.ach-toast.is-notice.is-compact');
    expect(aviso).toBeInTheDocument();
    expect(aviso).toHaveTextContent(SOCIAL_UI.profile.needsCompletedGames);
  });

  it('y nadie se ha quedado con su bloque a medida', () => {
    const { container } = render(<HubOfflineNotice hasCachedData={false} />);

    // Las clases viejas ya no existen en ningún sitio; si reaparecen es que alguien ha vuelto a pintar un aviso
    // por su cuenta en lugar de usar `Notice`.
    expect(container.querySelector('.hub-offline')).toBeNull();
    expect(container.querySelector('.hub-profile-requirement')).toBeNull();
    expect(container.querySelector('.update-notice-card')).toBeNull();
  });
});
