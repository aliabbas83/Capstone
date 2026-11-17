/**
 * First-time tips: each one shows once per phone, the first time that moment happens in a race.
 */
import { describe, expect, it } from '@jest/globals';
import { hasSeenTip, withTipSeen } from './tips';

describe('first-time tips', () => {
  it('a new phone has seen no tips', () => {
    expect(hasSeenTip(null, 'steal')).toBe(false);
    expect(hasSeenTip('', 'choose')).toBe(false);
  });

  it('remembers a tip once it was shown, and keeps the others', () => {
    const one = withTipSeen(null, 'steal');
    expect(hasSeenTip(one, 'steal')).toBe(true);
    expect(hasSeenTip(one, 'comeback')).toBe(false);
    const two = withTipSeen(one, 'comeback');
    expect(hasSeenTip(two, 'steal')).toBe(true);
    expect(hasSeenTip(two, 'comeback')).toBe(true);
  });

  it('does not store a tip twice', () => {
    const once = withTipSeen(null, 'choose');
    expect(withTipSeen(once, 'choose')).toBe(once);
  });

  it('treats broken or strange saved values as "nothing seen" instead of crashing', () => {
    for (const raw of ['not json', '{"a":1}', '[1,2]', 'null', '"steal"']) {
      expect(hasSeenTip(raw, 'steal')).toBe(false);
      expect(hasSeenTip(withTipSeen(raw, 'steal'), 'steal')).toBe(true);
    }
  });

  it('ignores unknown tip names left by an older version', () => {
    expect(JSON.parse(withTipSeen('["old_tip","steal"]', 'choose'))).toEqual(['steal', 'choose']);
  });
});
