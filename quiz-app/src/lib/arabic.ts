/**
 * Loose Arabic normalisation for matching words:
 * removes tashkeel and tatweel, unifies alef / yaa / taa marbuta forms.
 */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim()
    .toLowerCase();
}

/** Splits a name into words and strips the "ال" prefix from each. */
export function nameWords(s: string): string[] {
  return normalizeArabic(s)
    .split(/[\s\-_.،,]+/)
    .filter(Boolean)
    .map((w) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w));
}
