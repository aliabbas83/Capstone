/**
 * Downloads map pictures (SVG text) for picture questions.
 * Each picture is downloaded once and remembered, tried again when the network drops,
 * and stopped by a time limit so the card never waits for ever.
 * No React or React Native in here, so it can be unit tested.
 */

/** Stops waiting for `p` after `ms` (rejects with "timeout"). */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

export const PICTURE_TRIES = 3;
export const PICTURE_TIMEOUT_MS = 8000;

async function fetchText(uri: string): Promise<string> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`picture ${res.status}`);
  return await res.text();
}

export function createPictureLoader({
  fetchText: get = fetchText,
  tries = PICTURE_TRIES,
  timeoutMs = PICTURE_TIMEOUT_MS,
  waitMs = 400,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
}: {
  fetchText?: (uri: string) => Promise<string>;
  tries?: number;
  timeoutMs?: number;
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const done = new Map<string, string>();
  const running = new Map<string, Promise<string>>();

  async function download(uri: string): Promise<string> {
    let last: unknown = new Error('picture');
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const text = await withTimeout(get(uri), timeoutMs);
        if (!/<svg[\s>]/i.test(text)) throw new Error('not a picture');
        return text;
      } catch (e) {
        last = e;
        if (attempt < tries) await sleep(waitMs * attempt);
      }
    }
    throw last;
  }

  return {
    /** The SVG text for this address. Asked for twice, it is downloaded once. */
    loadSvg(uri: string): Promise<string> {
      const ready = done.get(uri);
      if (ready !== undefined) return Promise.resolve(ready);
      let job = running.get(uri);
      if (!job) {
        job = download(uri)
          .then((text) => {
            done.set(uri, text);
            return text;
          })
          .finally(() => running.delete(uri));
        running.set(uri, job);
      }
      return job;
    },
    /** The picture, if it is already downloaded (so the card can show it at once). */
    peek: (uri: string): string | null => done.get(uri) ?? null,
    clear() {
      done.clear();
      running.clear();
    },
  };
}

/** The app's one picture loader. */
export const pictures = createPictureLoader();
