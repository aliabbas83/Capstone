import { nameWords, normalizeArabic } from '@/lib/arabic';

export interface Mascot {
  id: string;
  label: string;
  emoji: string;
  bg: string;
  /** Normalised Arabic / English stems that suggest this mascot. */
  keywords: string[];
}

// Placeholder art: emoji on a coloured badge. Illustrated mascots replace these in milestone M7.
export const MASCOTS: Mascot[] = [
  { id: 'falcon', label: 'صقر', emoji: '🦅', bg: '#FFE1B8', keywords: ['صقر', 'صقور', 'نسر', 'نسور', 'شاهين', 'falcon', 'eagle', 'hawk'] },
  { id: 'tiger', label: 'نمر', emoji: '🐯', bg: '#FFD9A8', keywords: ['نمر', 'نمور', 'tiger', 'tigers'] },
  { id: 'lion', label: 'أسد', emoji: '🦁', bg: '#FFE8A3', keywords: ['اسد', 'اسود', 'ليث', 'ضرغام', 'lion', 'lions'] },
  { id: 'shark', label: 'قرش', emoji: '🦈', bg: '#CDEBFF', keywords: ['قرش', 'قروش', 'shark', 'sharks'] },
  { id: 'camel', label: 'جمل', emoji: '🐫', bg: '#F6DDB5', keywords: ['جمل', 'جمال', 'ابل', 'بعير', 'ناقه', 'هجن', 'camel'] },
  { id: 'wolf', label: 'ذئب', emoji: '🐺', bg: '#DDE3EE', keywords: ['ذيب', 'ذياب', 'ذءب', 'ذئب', 'ذيءاب', 'wolf', 'wolves'] },
  { id: 'horse', label: 'خيل', emoji: '🐎', bg: '#EBD9C8', keywords: ['خيل', 'خيول', 'حصان', 'فرس', 'فرسان', 'فارس', 'horse'] },
  { id: 'cheetah', label: 'فهد', emoji: '🐆', bg: '#FFEAB0', keywords: ['فهد', 'فهود', 'cheetah', 'leopard'] },
  { id: 'dolphin', label: 'دلفين', emoji: '🐬', bg: '#C9F1FF', keywords: ['دلفين', 'دلافين', 'dolphin'] },
  { id: 'octopus', label: 'أخطبوط', emoji: '🐙', bg: '#FFD6E5', keywords: ['اخطبوط', 'octopus'] },
  { id: 'bear', label: 'دب', emoji: '🐻', bg: '#E9D3BE', keywords: ['دب', 'دببه', 'bear'] },
  { id: 'fox', label: 'ثعلب', emoji: '🦊', bg: '#FFD8BF', keywords: ['ثعلب', 'ثعالب', 'fox'] },
  { id: 'owl', label: 'بومة', emoji: '🦉', bg: '#E7DCF8', keywords: ['بومه', 'بوم', 'owl'] },
  { id: 'bee', label: 'نحل', emoji: '🐝', bg: '#FFF1A8', keywords: ['نحل', 'نحله', 'bee', 'bees'] },
  { id: 'dragon', label: 'تنين', emoji: '🐉', bg: '#CFF5D6', keywords: ['تنين', 'تنانين', 'dragon'] },
  { id: 'pirate', label: 'قراصنة', emoji: '🏴‍☠️', bg: '#E2E5EA', keywords: ['قرصان', 'قراصنه', 'pirate', 'pirates'] },
  { id: 'wave', label: 'موج', emoji: '🌊', bg: '#CDEFFF', keywords: ['موج', 'امواج', 'بحر', 'بحار', 'بحاره', 'wave', 'sea'] },
  { id: 'lightning', label: 'برق', emoji: '⚡', bg: '#FFF3B0', keywords: ['برق', 'رعد', 'صاعقه', 'lightning', 'thunder'] },
  { id: 'fire', label: 'نار', emoji: '🔥', bg: '#FFD7C2', keywords: ['نار', 'شعله', 'لهب', 'جمر', 'fire', 'flame'] },
  { id: 'star', label: 'نجم', emoji: '⭐', bg: '#FFF0B3', keywords: ['نجم', 'نجوم', 'نجمه', 'star', 'stars'] },
  { id: 'crown', label: 'ملوك', emoji: '👑', bg: '#FFEBA8', keywords: ['ملك', 'ملوك', 'امير', 'امراء', 'king', 'kings'] },
  { id: 'trophy', label: 'أبطال', emoji: '🏆', bg: '#FFE6A0', keywords: ['بطل', 'ابطال', 'فايز', 'فايزين', 'champion', 'champions'] },
  { id: 'rocket', label: 'صاروخ', emoji: '🚀', bg: '#DCE4FF', keywords: ['صاروخ', 'صواريخ', 'rocket'] },
  { id: 'palm', label: 'نخلة', emoji: '🌴', bg: '#D7F5CF', keywords: ['نخل', 'نخله', 'نخيل', 'palm'] },
];

export const MASCOT_BY_ID: Record<string, Mascot> = Object.fromEntries(MASCOTS.map((m) => [m.id, m]));

/** Finds the mascot that best fits a team name, or null if nothing matches. */
export function suggestMascot(teamName: string): Mascot | null {
  const words = nameWords(teamName);
  if (words.length === 0) return null;
  for (const m of MASCOTS) {
    const keys = m.keywords.map(normalizeArabic);
    if (words.some((w) => keys.some((k) => w === k || (k.length >= 3 && w.startsWith(k))))) return m;
  }
  return null;
}
