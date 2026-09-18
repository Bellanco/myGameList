/**
 * EL COMPOSITOR DEL FEED, Y LO QUE SE MUDÓ CON ÉL.
 *
 * El borrador era estado del hub y ahora es estado de esta pieza, así que lo que antes comprobaba
 * `socialCompose.test.ts` sobre el hook —que el cuadro se vacía al publicar y NO se vacía si falla— se comprueba
 * aquí, que es donde el cuadro vive. El hook solo conserva el contrato: devuelve `true` o `false`.
 *
 * Por qué importa la segunda mitad: perder un texto largo porque no había red sería lo peor que puede pasar en
 * esta pantalla, y es exactamente lo que promete su aviso («el texto sigue aquí, inténtalo al recuperar la red»).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { FeedComposer } from '../../src/view/components/socialhub/FeedComposer';

function renderComposer(onPublish: (text: string) => Promise<boolean>, opciones: { max?: number; contador?: boolean } = {}) {
  return render(
    <FeedComposer
      SOCIAL_UI={SOCIAL_UI}
      publishing={false}
      postMaxLength={opciones.max ?? 1000}
      showPostCounter={opciones.contador ?? true}
      onPublish={onPublish}
    />,
  );
}

const cuadro = () => screen.getByLabelText(SOCIAL_UI.feed.postComposerLabel) as HTMLTextAreaElement;
const boton = () => screen.getByRole('button', { name: SOCIAL_UI.feed.postPublish });

describe('compositor del feed', () => {
  it('publica lo escrito y vacía el cuadro cuando salió', async () => {
    const onPublish = vi.fn(async () => true);
    renderComposer(onPublish);

    fireEvent.change(cuadro(), { target: { value: 'Hola feed' } });
    fireEvent.click(boton());

    await waitFor(() => expect(onPublish).toHaveBeenCalledWith('Hola feed'));
    await waitFor(() => expect(cuadro().value).toBe(''));
  });

  it('si no salió, el texto se queda para reintentar', async () => {
    const onPublish = vi.fn(async () => false);
    renderComposer(onPublish);

    fireEvent.change(cuadro(), { target: { value: 'Sin red' } });
    fireEvent.click(boton());

    await waitFor(() => expect(onPublish).toHaveBeenCalledOnce());
    expect(cuadro().value).toBe('Sin red');
  });

  it('el botón está apagado mientras el cuadro esté vacío o en blanco', () => {
    renderComposer(async () => true);

    expect(boton()).toBeDisabled();
    fireEvent.change(cuadro(), { target: { value: '   ' } });
    expect(boton()).toBeDisabled();
    fireEvent.change(cuadro(), { target: { value: 'algo' } });
    expect(boton()).toBeEnabled();
  });

  it('Ctrl+Enter publica; Enter solo, no', async () => {
    const onPublish = vi.fn(async () => true);
    renderComposer(onPublish);

    fireEvent.change(cuadro(), { target: { value: 'Por teclado' } });
    fireEvent.keyDown(cuadro(), { key: 'Enter' });
    expect(onPublish).not.toHaveBeenCalled();

    fireEvent.keyDown(cuadro(), { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(onPublish).toHaveBeenCalledWith('Por teclado'));
  });

  it('el contador cuenta sobre el tope del rango, y el aviso solo aparece al 90 %', () => {
    renderComposer(async () => true, { max: 10 });

    fireEvent.change(cuadro(), { target: { value: 'abcd' } });
    expect(screen.getByText(SOCIAL_UI.feed.postCharCount(4, 10))).toBeInTheDocument();
    // Al 40 % no hay nada que anunciar: la región viva está vacía para no hablar en cada pulsación.
    expect(screen.getByRole('status')).toHaveTextContent('');

    fireEvent.change(cuadro(), { target: { value: 'abcdefghi' } });
    expect(screen.getByRole('status')).toHaveTextContent(SOCIAL_UI.feed.postCharNearLimit);

    fireEvent.change(cuadro(), { target: { value: 'abcdefghij' } });
    expect(screen.getByRole('status')).toHaveTextContent(SOCIAL_UI.feed.postCharLimitReached);
  });

  it('sin contador (mithril) no hay tope en el campo ni pie de conteo', () => {
    renderComposer(async () => true, { contador: false });

    expect(cuadro()).not.toHaveAttribute('maxLength');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
