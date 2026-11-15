import { describe, expect, it } from '@jest/globals';
import { suggestMascot } from './mascots';

describe('suggestMascot', () => {
  it.each([
    ['الصقور', 'falcon'],
    ['النمور', 'tiger'],
    ['أسود الخليج', 'lion'],
    ['قروش البحر', 'shark'],
    ['فرسان الكويت', 'horse'],
    ['Sharks', 'shark'],
  ])('%s → %s', (name, id) => {
    expect(suggestMascot(name)?.id).toBe(id);
  });

  it('returns null when nothing matches', () => {
    expect(suggestMascot('فريق ١')).toBeNull();
    expect(suggestMascot('')).toBeNull();
  });
});
