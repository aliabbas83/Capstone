import { describe, expect, it } from '@jest/globals';
import { nameWords, normalizeArabic } from './arabic';

describe('normalizeArabic', () => {
  it('removes tashkeel (harakat, shadda, sukun, dagger alef)', () => {
    expect(normalizeArabic('مُحَمَّد')).toBe('محمد');
    expect(normalizeArabic('كِتَابٌ')).toBe('كتاب');
    expect(normalizeArabic('رَحْمٰن')).toBe('رحمن');
  });
  it('removes tatweel', () => {
    expect(normalizeArabic('جـــولة')).toBe('جوله');
  });
  it('unifies alef forms', () => {
    expect(normalizeArabic('أسد')).toBe('اسد');
    expect(normalizeArabic('إبل')).toBe('ابل');
    expect(normalizeArabic('آمال')).toBe('امال');
    expect(normalizeArabic('ٱلله')).toBe('الله');
  });
  it('unifies yaa, taa marbuta, hamza on waw and on yaa', () => {
    expect(normalizeArabic('مصطفى')).toBe('مصطفي');
    expect(normalizeArabic('قطة')).toBe('قطه');
    expect(normalizeArabic('مؤمن')).toBe('مومن');
    expect(normalizeArabic('ذئب')).toBe('ذيب');
  });
  it('makes differently written forms of the same word equal', () => {
    expect(normalizeArabic('الأُسُودُ')).toBe(normalizeArabic('الاسود'));
  });
  it('trims and lowercases Latin text', () => {
    expect(normalizeArabic('  Falcons ')).toBe('falcons');
  });
  it('returns an empty string for empty input', () => {
    expect(normalizeArabic('')).toBe('');
  });
});

describe('nameWords', () => {
  it('splits on spaces, dashes, underscores, dots and Arabic/Latin commas', () => {
    expect(nameWords('صقور-نمور_اسود.ذياب،قطط,خيل')).toEqual(['صقور', 'نمور', 'اسود', 'ذياب', 'قطط', 'خيل']);
  });
  it('strips the "ال" prefix from each word', () => {
    expect(nameWords('الصقور الذهبية')).toEqual(['صقور', 'ذهبيه']);
  });
  it('keeps "ال" on short words (3 letters or fewer)', () => {
    expect(nameWords('الف')).toEqual(['الف']);
    expect(nameWords('ال')).toEqual(['ال']);
  });
  it('normalises before splitting (tashkeel, hamza)', () => {
    expect(nameWords('الأُسُود')).toEqual(['اسود']);
  });
  it('drops empty parts from repeated separators', () => {
    expect(nameWords('  نمور   --  صقور  ')).toEqual(['نمور', 'صقور']);
  });
  it('returns no words for blank input', () => {
    expect(nameWords('   ')).toEqual([]);
  });
});
