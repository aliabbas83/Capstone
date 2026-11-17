import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Follows the phone's "Reduce Motion" setting. When it is on, looping decorations
 * (waves, oars, flag waving, confetti) stop and entrances appear without bouncing.
 */
let reduced = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  reduced = v;
  listeners.forEach((l) => l());
};

AccessibilityInfo.isReduceMotionEnabled?.().then(set).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', set);

export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => reduced,
    () => false,
  );
}
