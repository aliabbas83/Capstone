import { describe, expect, it } from '@jest/globals';
import {
  cleanCode,
  maskPhone,
  normalizeEmail,
  normalizeKuwaitPhone,
  passwordProblem,
  phoneFromLoginEmail,
  phoneLoginEmail,
  toLatinDigits,
} from './validate';

describe('toLatinDigits', () => {
  it('turns Arabic-Indic and Persian digits into 0-9', () => {
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(toLatinDigits('۹۸۷')).toBe('987');
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases a valid email', () => {
    expect(normalizeEmail('  Ali@Example.COM ')).toBe('ali@example.com');
  });
  it('rejects broken emails', () => {
    for (const bad of ['', 'ali', 'ali@', '@x.com', 'a b@x.com', 'ali@x', 'ali@@x.com']) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe('normalizeKuwaitPhone', () => {
  it('accepts local 8-digit mobiles and adds +965', () => {
    expect(normalizeKuwaitPhone('99123456')).toBe('+96599123456');
    expect(normalizeKuwaitPhone('5512 3456')).toBe('+96555123456');
    expect(normalizeKuwaitPhone('٦٥٠١-٢٣٤٥')).toBe('+96565012345');
    expect(normalizeKuwaitPhone('41234567')).toBe('+96541234567');
  });
  it('accepts numbers that already have the country code', () => {
    expect(normalizeKuwaitPhone('+965 9912 3456')).toBe('+96599123456');
    expect(normalizeKuwaitPhone('0096599123456')).toBe('+96599123456');
    expect(normalizeKuwaitPhone('96599123456')).toBe('+96599123456');
  });
  it('rejects landlines, wrong lengths and other countries', () => {
    for (const bad of ['', '22123456', '9912345', '991234567', '+966501234567', 'abcdefgh']) {
      expect(normalizeKuwaitPhone(bad)).toBeNull();
    }
  });
});

describe('cleanCode', () => {
  it('keeps digits only, max 8', () => {
    expect(cleanCode(' 12 34-56 ')).toBe('123456');
    expect(cleanCode('١٢٣٤٥٦')).toBe('123456');
    expect(cleanCode('1234567890')).toBe('12345678');
  });
});

describe('maskPhone', () => {
  it('hides the middle digits', () => {
    expect(maskPhone('+96599123456')).toBe('+965 99•• ••56');
  });
});

describe('passwordProblem', () => {
  it('accepts 8+ chars with letters and digits', () => {
    expect(passwordProblem('jawla2026')).toBeNull();
    expect(passwordProblem('Abc12345')).toBeNull();
  });
  it('rejects short, letters-only, digits-only and too long', () => {
    expect(passwordProblem('ab12')).toMatch(/8/);
    expect(passwordProblem('abcdefgh')).not.toBeNull();
    expect(passwordProblem('12345678')).not.toBeNull();
    expect(passwordProblem('a1'.repeat(40))).not.toBeNull();
  });
});

describe('phone login email', () => {
  it('round-trips a +965 number', () => {
    const e = phoneLoginEmail('+96599123456');
    expect(e).toBe('96599123456@phone.jawla.invalid');
    expect(phoneFromLoginEmail(e)).toBe('+96599123456');
  });
  it('ignores normal emails', () => {
    expect(phoneFromLoginEmail('ali@example.com')).toBeNull();
    expect(phoneFromLoginEmail(null)).toBeNull();
  });
});
