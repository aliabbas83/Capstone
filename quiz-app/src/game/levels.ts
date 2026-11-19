/**
 * The three normal question levels, named by their points. More points means a harder question
 * (2 = the easiest, 4 = the hardest). Pure text helpers, so they can be unit tested.
 */
import type { LevelPoints } from './engine';

const LABELS: Record<LevelPoints, string> = { 2: 'نقطتين', 3: '3 نقاط', 4: '4 نقاط' };

export const levelLabel = (points: LevelPoints): string => LABELS[points];

export const LEVELS: readonly { points: LevelPoints; label: string }[] = ([2, 3, 4] as const).map((points) => ({
  points,
  label: LABELS[points],
}));

/** "How many times are left" in words, so the count is never mixed up with the points. */
export function timesLabel(n: number): string {
  if (n <= 0) return 'خلصت';
  if (n === 1) return 'مرة';
  if (n === 2) return 'مرتين';
  return `${n} مرات`;
}
