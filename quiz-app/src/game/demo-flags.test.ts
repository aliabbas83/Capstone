/// <reference types="node" />
/**
 * The free demo works with no connection at all, so its flag pictures are part of the app's
 * code (data URIs), not files fetched while playing. In Expo Go a "bundled" image file is
 * still downloaded from the dev server when it is first shown, and that download can fail.
 */
import { describe, expect, it } from '@jest/globals';
import { DEMO_QUESTIONS } from './demo-questions';

const flags = DEMO_QUESTIONS.filter((q) => q.categoryId === 'flags');

describe('demo flag pictures', () => {
  it('there are 7 flag questions and each has a picture', () => {
    expect(flags).toHaveLength(7);
    expect(flags.every((q) => !!q.image)).toBe(true);
  });

  it('every picture is inside the app (a PNG data URI), so nothing is downloaded', () => {
    for (const q of flags) {
      const image = q.image as { kind: string; uri?: string };
      expect(image.kind).toBe('png');
      expect(image.uri).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
      // The data really is a PNG file (its first bytes are the PNG signature).
      const bytes = Buffer.from(image.uri!.split(',')[1], 'base64');
      expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(bytes.length).toBeGreaterThan(100);
    }
  });

  it('each flag has its own picture', () => {
    const uris = new Set(flags.map((q) => (q.image as { uri?: string }).uri));
    expect(uris.size).toBe(7);
  });
});
