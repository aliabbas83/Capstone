// Input clean-up for sign-in. The server (Supabase Auth) validates again;
// this is only to give quick, friendly feedback.

const ARABIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

export function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC.indexOf(d);
    return String(i >= 0 ? i : PERSIAN.indexOf(d));
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Lower-cased email, or null if it does not look like an email. */
export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

/** Kuwaiti mobile in E.164 form (+965XXXXXXXX), or null. Mobiles start with 4, 5, 6 or 9. */
export function normalizeKuwaitPhone(input: string): string | null {
  let d = toLatinDigits(input).replace(/[\s\-().]/g, '');
  if (d.startsWith('+965')) d = d.slice(4);
  else if (d.startsWith('00965')) d = d.slice(5);
  else if (d.startsWith('965') && d.length === 11) d = d.slice(3);
  return /^[4569]\d{7}$/.test(d) ? `+965${d}` : null;
}

/** Digits only, at most 8 (Supabase codes are 6 by default). */
export function cleanCode(input: string): string {
  return toLatinDigits(input).replace(/\D/g, '').slice(0, 8);
}

export function maskPhone(e164: string): string {
  const local = e164.replace('+965', '');
  return `+965 ${local.slice(0, 2)}•• ••${local.slice(-2)}`;
}
