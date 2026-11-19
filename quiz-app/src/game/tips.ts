/**
 * First-time tips, shown once per phone the first time a moment happens in a race.
 * Pure helpers over the saved value (a JSON list of tip names), so they can be unit tested.
 */
export const TIP_IDS = ['steal', 'comeback', 'choose'] as const;
export type TipId = (typeof TIP_IDS)[number];

/** AsyncStorage key for the tips this phone has already shown. */
export const TIPS_KEY = 'jawla.tips.v1';

function parse(raw: string | null): TipId[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is TipId => (TIP_IDS as readonly unknown[]).includes(x)) : [];
  } catch {
    return [];
  }
}

export const hasSeenTip = (raw: string | null, id: TipId): boolean => parse(raw).includes(id);

/** The saved value after showing `id` (unchanged when it was already there). */
export function withTipSeen(raw: string | null, id: TipId): string {
  const seen = parse(raw);
  if (seen.includes(id) && raw !== null) return raw;
  return JSON.stringify([...seen.filter((x) => x !== id), id]);
}

/** The tip text for each moment. Short: the host reads it out while the teams wait. */
export const TIP_TEXT: Record<TipId, string> = {
  steal: 'فرصة السرقة: عندكم 15 ثانية. إذا جاوبتوا صح الخطوات لكم، وفي الحالتين الدور الجاي لكم.',
  comeback: 'سؤال الإنقاذ: الخصم قرّب من خط النهاية، فعندكم سؤال واحد بـ5 خطوات. تستخدمونه مرة وحدة وبأي فئة.',
  choose: 'تقدّموا بسبّاحكم، أو رجّعوا سبّاح الخصم نفس عدد الخطوات. القرار لكم!',
};
