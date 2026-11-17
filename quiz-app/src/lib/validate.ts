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

// ── Passwords (server rule: at least 8, letters + digits) ──
export const PASSWORD_MIN = 8;

/** Arabic error text, or null when the password is acceptable. */
export function passwordProblem(p: string): string | null {
  if (p.length < PASSWORD_MIN) return `كلمة المرور لازم تكون ${PASSWORD_MIN} أحرف أو أكثر.`;
  if (p.length > 72) return 'كلمة المرور طويلة جداً (الحد 72 حرفاً).';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'كلمة المرور لازم تحتوي على حروف إنجليزية وأرقام.';
  return null;
}

// ── Team names (same rules as the server's start_game) ──
export const TEAM_NAME_MAX = 20;

/** Arabic error text, or null when both team names are acceptable. */
export function teamNamesProblem(a: string, b: string): string | null {
  const names = [a.trim(), b.trim()];
  // Count characters like Postgres char_length (an emoji is one character).
  if (names.some((n) => n.length === 0)) return 'اكتبوا اسم لكل فريق.';
  if (names.some((n) => [...n].length > TEAM_NAME_MAX)) return `اسم الفريق لازم يكون ${TEAM_NAME_MAX} حرف أو أقل.`;
  if (names[0].toLowerCase() === names[1].toLowerCase()) return 'اسما الفريقين لازم يكونون مختلفين.';
  return null;
}

// ── Phone sign-in without SMS ──
// Supabase phone sign-up needs an SMS provider, so a phone number is stored as an
// internal login name on a reserved domain (.invalid never receives mail).
const PHONE_DOMAIN = '@phone.jawla.invalid';

export function phoneLoginEmail(e164: string): string {
  return `${e164.replace(/^\+/, '')}${PHONE_DOMAIN}`;
}

/** +965… if this login email belongs to a phone account, else null. */
export function phoneFromLoginEmail(email: string | null | undefined): string | null {
  if (!email || !email.endsWith(PHONE_DOMAIN)) return null;
  return `+${email.slice(0, -PHONE_DOMAIN.length)}`;
}
