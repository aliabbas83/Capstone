import { describe, expect, it } from '@jest/globals';
import {
  cleanCode,
  maskPhone,
  normalizeEmail,
  normalizeKuwaitPhone,
  passwordProblem,
  phoneFromLoginEmail,
  phoneLoginEmail,
  teamNamesProblem,
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

const HAS_ARABIC = /[؀-ۿ]/;

describe('toLatinDigits (more)', () => {
  it('leaves Latin digits and other text alone', () => {
    expect(toLatinDigits('abc 123 جولة')).toBe('abc 123 جولة');
  });
  it('handles mixed Arabic-Indic and Latin digits', () => {
    expect(toLatinDigits('٩٩1٢٣')).toBe('99123');
  });
});

describe('normalizeEmail (more)', () => {
  it('accepts plus-addressing and subdomains', () => {
    expect(normalizeEmail('ali+quiz@mail.example.co')).toBe('ali+quiz@mail.example.co');
  });
  it('rejects a one-letter top-level domain', () => {
    expect(normalizeEmail('ali@example.c')).toBeNull();
  });
  it('rejects emails longer than 254 characters', () => {
    expect(normalizeEmail(`${'a'.repeat(250)}@x.com`)).toBeNull();
  });
  it('rejects whitespace inside the email', () => {
    expect(normalizeEmail('ali@exa mple.com')).toBeNull();
  });
});

describe('normalizeKuwaitPhone (more)', () => {
  it('accepts a full Arabic-Indic number with spaces and country code', () => {
    expect(normalizeKuwaitPhone('+٩٦٥ ٩٩١٢ ٣٤٥٦')).toBe('+96599123456');
  });
  it('accepts Persian digits', () => {
    expect(normalizeKuwaitPhone('۵۵۱۲۳۴۵۶')).toBe('+96555123456');
  });
  it('accepts brackets, dots and dashes', () => {
    expect(normalizeKuwaitPhone('(965) 6501.2345')).toBe('+96565012345');
    expect(normalizeKuwaitPhone('9912-3456')).toBe('+96599123456');
  });
  it('accepts every Kuwaiti mobile prefix (4, 5, 6, 9)', () => {
    for (const first of ['4', '5', '6', '9']) {
      expect(normalizeKuwaitPhone(`${first}1234567`)).toBe(`+965${first}1234567`);
    }
  });
  it('rejects other first digits (landline 2, and 0/1/3/7/8)', () => {
    for (const first of ['0', '1', '2', '3', '7', '8']) {
      expect(normalizeKuwaitPhone(`${first}1234567`)).toBeNull();
    }
  });
  it('rejects a bare 965 prefix on a number of the wrong length', () => {
    expect(normalizeKuwaitPhone('9659123456')).toBeNull();
  });
  it('rejects a leading 0 trunk prefix and letters mixed in', () => {
    expect(normalizeKuwaitPhone('099123456')).toBeNull();
    expect(normalizeKuwaitPhone('9912345a')).toBeNull();
  });
  it('rejects +965 followed by a too-short number', () => {
    expect(normalizeKuwaitPhone('+965 9912 345')).toBeNull();
  });
});

describe('passwordProblem (more)', () => {
  it('accepts exactly 8 and exactly 72 characters', () => {
    expect(passwordProblem('abcdef12')).toBeNull();
    expect(passwordProblem('a1'.repeat(36))).toBeNull();
  });
  it('rejects 7 and 73 characters', () => {
    expect(passwordProblem('abcde12')).not.toBeNull();
    expect(passwordProblem(`${'a1'.repeat(36)}b`)).toMatch(/72/);
  });
  it('needs English letters: Arabic letters + digits are not enough', () => {
    expect(passwordProblem('جولةجولة1234')).not.toBeNull();
  });
  it('needs Latin digits: Arabic-Indic digits do not count', () => {
    expect(passwordProblem('abcdefgh٤٥')).not.toBeNull();
  });
  it('allows symbols when letters and digits are present', () => {
    expect(passwordProblem('ab!@#$12')).toBeNull();
  });
  it('returns Arabic text', () => {
    expect(passwordProblem('short')).toMatch(HAS_ARABIC);
  });
});

describe('phone login email (more)', () => {
  it('builds <digits>@phone.jawla.invalid from a normalised Arabic-digit phone', () => {
    const phone = normalizeKuwaitPhone('٥٥١٢ ٣٤٥٦');
    expect(phone).toBe('+96555123456');
    expect(phoneLoginEmail(phone!)).toBe('96555123456@phone.jawla.invalid');
  });
  it('the login name passes the email check', () => {
    expect(normalizeEmail(phoneLoginEmail('+96599123456'))).toBe('96599123456@phone.jawla.invalid');
  });
  it('ignores undefined, empty and look-alike domains', () => {
    expect(phoneFromLoginEmail(undefined)).toBeNull();
    expect(phoneFromLoginEmail('')).toBeNull();
    expect(phoneFromLoginEmail('96599123456@phone.jawla.invalid.evil.com')).toBeNull();
    expect(phoneFromLoginEmail('96599123456@xphone.jawla.com')).toBeNull();
  });
});

describe('maskPhone (more)', () => {
  it('never shows the full number', () => {
    const masked = maskPhone('+96565012345');
    expect(masked).toBe('+965 65•• ••45');
    expect(masked).not.toContain('5012345');
  });
});

// Same rules as the server's start_game: trimmed, 1-20 characters, different (ignoring case).
describe('teamNamesProblem', () => {
  it('accepts two different names', () => {
    expect(teamNamesProblem('الصقور', 'النمور')).toBeNull();
    expect(teamNamesProblem('Team A', 'Team B')).toBeNull();
  });
  it('rejects an empty or blank name', () => {
    expect(teamNamesProblem('', 'النمور')).not.toBeNull();
    expect(teamNamesProblem('الصقور', '   ')).not.toBeNull();
  });
  it('rejects names longer than 20 characters after trimming', () => {
    expect(teamNamesProblem('أ'.repeat(21), 'ب')).not.toBeNull();
    expect(teamNamesProblem(`  ${'أ'.repeat(20)}  `, 'ب')).toBeNull();
  });
  it('counts an emoji as one character, like the server', () => {
    expect(teamNamesProblem('🦅'.repeat(20), 'ب')).toBeNull();
  });
  it('rejects the same name, ignoring surrounding spaces and letter case', () => {
    expect(teamNamesProblem('الصقور', ' الصقور ')).not.toBeNull();
    expect(teamNamesProblem('Falcons', 'falcons')).not.toBeNull();
  });
  it('returns Arabic text', () => {
    expect(teamNamesProblem('a', 'a')).toMatch(HAS_ARABIC);
  });
});
