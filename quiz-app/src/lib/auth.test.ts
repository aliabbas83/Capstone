import { describe, expect, it, jest } from '@jest/globals';

// auth.tsx talks to Supabase and Sentry when it loads; stub both so nothing leaves the machine.
jest.mock('./supabase', () => ({
  supabaseConfigured: false,
  supabase: { auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() } },
}));
jest.mock('./monitoring', () => ({ setMonitoringUser: jest.fn() }));

// eslint-disable-next-line import/first
import { authErrorMessage } from './auth';

/** An object shaped like supabase-js's AuthError. */
const authError = (message: string, code?: string, status?: number) =>
  Object.assign(new Error(message), { code, status, __isAuthError: true }) as unknown as Error;

describe('authErrorMessage', () => {
  it('returns an empty string when there is no error', () => {
    expect(authErrorMessage(null)).toBe('');
    expect(authErrorMessage(undefined)).toBe('');
  });

  it('wrong email/phone or password, by code or by message', () => {
    const byCode = authErrorMessage(authError('x', 'invalid_credentials', 400));
    expect(byCode).toMatch(/غير صحيحة/);
    expect(authErrorMessage(new Error('Invalid login credentials'))).toBe(byCode);
  });

  it('does not reveal whether the account exists on a failed sign-in', () => {
    // Same message for "no such user" and "wrong password": both come back as invalid_credentials.
    expect(authErrorMessage(authError('Invalid login credentials', 'invalid_credentials'))).not.toMatch(/موجود/);
  });

  it('account already exists, by code or by message', () => {
    const msg = authErrorMessage(authError('x', 'user_already_exists'));
    expect(msg).toMatch(/موجود/);
    expect(authErrorMessage(authError('x', 'email_exists'))).toBe(msg);
    expect(authErrorMessage(new Error('User already registered'))).toBe(msg);
  });

  it('weak password explains the rule (8+, letters and digits)', () => {
    expect(authErrorMessage(authError('x', 'weak_password'))).toMatch(/8/);
  });

  it('rate limits by code or by HTTP 429', () => {
    const msg = authErrorMessage(authError('x', 'over_request_rate_limit'));
    expect(authErrorMessage(authError('Too many', undefined, 429))).toBe(msg);
  });

  it('network failures', () => {
    expect(authErrorMessage(new Error('Network request failed'))).toMatch(/اتصال/);
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toMatch(/اتصال/);
  });

  it('treats HTTP status 0 as a network failure', () => {
    expect(authErrorMessage(authError('{}', undefined, 0))).toMatch(/اتصال/);
  });

  it('treats AuthRetryableFetchError as a network failure', () => {
    const e = Object.assign(authError('{}', undefined, 502), { name: 'AuthRetryableFetchError' });
    expect(authErrorMessage(e)).toMatch(/اتصال/);
  });

  it.each(['email_address_invalid', 'signup_disabled'])('has a specific message for %s', (code) => {
    expect(authErrorMessage(authError('x', code))).not.toBe(authErrorMessage(new Error('???')));
  });

  it('falls back to a generic Arabic message and never shows the raw server text', () => {
    const msg = authErrorMessage(new Error('pq: relation "auth.users" internal detail'));
    expect(msg).toMatch(/[؀-ۿ]/);
    expect(msg).not.toContain('auth.users');
  });
});
