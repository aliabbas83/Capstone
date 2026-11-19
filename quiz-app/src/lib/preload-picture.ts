import { Image } from 'react-native';
import type { QuestionImage } from '@/game/demo-questions';
import { pictures, withTimeout } from './picture-loader';

/**
 * Start downloading a question's picture before its card opens, and wait a short moment for it,
 * so the picture is usually there the instant the card appears. Never throws: if the picture
 * is slow or fails, the card opens anyway and shows its own loading / retry state.
 */
export async function preloadPicture(image: QuestionImage | undefined, waitMs = 2500): Promise<void> {
  // A data URI is already inside the app: nothing to download.
  if (!image || image.uri.startsWith('data:')) return;
  const load =
    image.kind === 'svg'
      ? pictures.loadSvg(image.uri)
      : Image.prefetch(image.uri).then((ok) => (ok ? true : Image.prefetch(image.uri)));
  await withTimeout(Promise.resolve(load), waitMs).catch(() => {});
}
