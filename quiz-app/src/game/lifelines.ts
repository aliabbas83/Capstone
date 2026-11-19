/**
 * Words for the lifelines, and the two answers shown by "pick from two answers".
 * Pure helpers, so they can be unit tested.
 */
import { EXTRA_SECONDS, type Lifeline } from './engine';

export const LIFELINE_LABELS: Record<Lifeline, string> = {
  two: 'جوابين',
  time: `+${EXTRA_SECONDS} ثانية`,
  swap: 'غيّر السؤال',
};

/** What each lifeline does, for screen readers and the how-to-play sheet. */
export const LIFELINE_HINTS: Record<Lifeline, string> = {
  two: 'يطلع لكم جوابين، واحد صح وواحد غلط، وتختارون',
  time: `يزيد الوقت ${EXTRA_SECONDS} ثانية لهذا السؤال`,
  swap: 'يتبدّل السؤال بسؤال ثاني من نفس الفئة ونفس النقاط',
};

/** A small steady number from the question id, so the order is the same every time it is drawn. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The right answer and the wrong one, in a steady mixed order.
 * Null when the question has no usable wrong answer (the lifeline is then not offered).
 */
export function twoChoices(q: { id: string; a: string; w?: string | null }): [string, string] | null {
  const wrong = q.w?.trim();
  if (!wrong || wrong === q.a.trim()) return null;
  return hash(q.id) % 2 === 0 ? [q.a, wrong] : [wrong, q.a];
}
