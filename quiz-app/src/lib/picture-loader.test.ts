/**
 * Question pictures (maps) are downloaded once, tried again if the network drops,
 * and never wait for ever.
 */
import { describe, expect, it } from '@jest/globals';
import { createPictureLoader, withTimeout } from './picture-loader';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L5 5"/></svg>';
const noWait = () => Promise.resolve();

describe('map pictures', () => {
  it('downloads a picture once, however many times it is asked for', async () => {
    let calls = 0;
    const loader = createPictureLoader({ fetchText: async () => (calls++, SVG), sleep: noWait });
    expect(await loader.loadSvg('https://x/a.svg')).toBe(SVG);
    expect(await loader.loadSvg('https://x/a.svg')).toBe(SVG);
    expect(calls).toBe(1);
  });

  it('two requests at the same moment share one download', async () => {
    let calls = 0;
    const loader = createPictureLoader({ fetchText: async () => (calls++, SVG), sleep: noWait });
    const [a, b] = await Promise.all([loader.loadSvg('https://x/a.svg'), loader.loadSvg('https://x/a.svg')]);
    expect([a, b]).toEqual([SVG, SVG]);
    expect(calls).toBe(1);
  });

  it('tries again by itself when the network drops', async () => {
    let calls = 0;
    const loader = createPictureLoader({
      fetchText: async () => {
        if (++calls < 3) throw new Error('network');
        return SVG;
      },
      sleep: noWait,
    });
    expect(await loader.loadSvg('https://x/a.svg')).toBe(SVG);
    expect(calls).toBe(3);
  });

  it('gives up after three tries, and a later request starts fresh (a failure is not remembered)', async () => {
    let calls = 0;
    let online = false;
    const loader = createPictureLoader({
      fetchText: async () => {
        calls++;
        if (!online) throw new Error('network');
        return SVG;
      },
      sleep: noWait,
    });
    await expect(loader.loadSvg('https://x/a.svg')).rejects.toThrow();
    expect(calls).toBe(3);
    online = true;
    expect(await loader.loadSvg('https://x/a.svg')).toBe(SVG);
    expect(calls).toBe(4);
  });

  it('refuses a reply that is not a picture (for example an error page)', async () => {
    const loader = createPictureLoader({ fetchText: async () => '<html>Not found</html>', sleep: noWait });
    await expect(loader.loadSvg('https://x/a.svg')).rejects.toThrow();
  });

  it('a download that hangs is stopped by the time limit', async () => {
    const loader = createPictureLoader({ fetchText: () => new Promise<string>(() => {}), sleep: noWait, timeoutMs: 20, tries: 2 });
    await expect(loader.loadSvg('https://x/a.svg')).rejects.toThrow('timeout');
  });
});

describe('time limit', () => {
  it('passes a fast result through and stops a slow one', async () => {
    expect(await withTimeout(Promise.resolve(7), 50)).toBe(7);
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow('timeout');
  });
});
