import { afterEach, describe, expect, it, jest } from '@jest/globals';

// A fake Supabase client: no network. Only storage upload is used below.
const mockUpload = jest.fn<(path: string, body: ArrayBuffer, opts: Record<string, unknown>) => Promise<{ error: unknown }>>();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ upload: (...a: [string, ArrayBuffer, never]) => mockUpload(...a) }) } }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

// eslint-disable-next-line import/first
import { gameErrorMessage, uploadTeamPhoto } from './supabase';

const realFetch = globalThis.fetch;
function fakeFetch(bytes: number) {
  globalThis.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(bytes) })) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  mockUpload.mockReset();
});

describe('gameErrorMessage', () => {
  const generic = gameErrorMessage(new Error('???'));

  it.each([
    ['no credit left', /رصيد/],
    ['team names must differ', /مختلفين/],
    ['team name must be 1-20 characters', /20/],
    ['need 8 distinct categories', /8/],
    ['photo_too_big', /كبيرة/],
    ['storage upload failed', /صورة/],
    ['game expired', /6/],
    ['question limit reached', /الأقصى/],
    ['game not active', /انتهت/],
    ['not signed in', /جلستك/],
    ['JWT expired', /جلستك/],
    ['Network request failed', /اتصال/],
  ])('maps "%s" to a specific message', (msg, expected) => {
    const out = gameErrorMessage(new Error(msg));
    expect(out).toMatch(expected);
    expect(out).not.toBe(generic);
  });

  it('reads PostgrestError-like plain objects too', () => {
    expect(gameErrorMessage({ message: 'no credit', code: 'P0001' })).toMatch(/رصيد/);
  });

  it('checks "team names must differ" before the general team name rule', () => {
    expect(gameErrorMessage(new Error('team names must differ'))).toMatch(/مختلفين/);
  });

  it('falls back to a generic Arabic message for unknown, null or string errors', () => {
    expect(generic).toMatch(/[؀-ۿ]/);
    expect(gameErrorMessage(null)).toBe(generic);
    expect(gameErrorMessage('no credit')).toBe(generic);
  });
});

describe('uploadTeamPhoto', () => {
  it('uploads into the user\'s own folder with a matching content type', async () => {
    fakeFetch(1000);
    mockUpload.mockResolvedValueOnce({ error: null });

    const path = await uploadTeamPhoto('user-1', 'file:///photo.PNG');

    expect(path).toMatch(/^user-1\/[a-z0-9]+\.png$/);
    expect(mockUpload).toHaveBeenCalledWith(path, expect.any(ArrayBuffer), { contentType: 'image/png', upsert: false });
  });

  it('detects webp and falls back to jpeg', async () => {
    fakeFetch(10);
    mockUpload.mockResolvedValue({ error: null });

    expect(await uploadTeamPhoto('u', 'data:image/webp;base64,AAAA')).toMatch(/\.webp$/);
    expect(await uploadTeamPhoto('u', 'file:///a.heic')).toMatch(/\.jpg$/);
    expect(mockUpload.mock.calls[1][2]).toEqual({ contentType: 'image/jpeg', upsert: false });
  });

  it('refuses photos over 2 MB without uploading', async () => {
    fakeFetch(2 * 1024 * 1024 + 1);
    await expect(uploadTeamPhoto('u', 'file:///big.jpg')).rejects.toThrow('photo_too_big');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('turns the daily photo limit (storage RLS insert denied) into photo_limit', async () => {
    fakeFetch(10);
    const rls = Object.assign(new Error('new row violates row-level security policy'), { statusCode: '403' });
    mockUpload.mockResolvedValueOnce({ error: rls });
    const err = await uploadTeamPhoto('u', 'file:///a.jpg').catch((e: unknown) => e);
    expect(err).toEqual(new Error('photo_limit'));
    expect(gameErrorMessage(err)).toMatch(/اليوم/);
    expect(gameErrorMessage(err)).toMatch(/شخصية/);
  });

  it('passes storage errors on', async () => {
    fakeFetch(10);
    mockUpload.mockResolvedValueOnce({ error: new Error('mime type not allowed') });
    await expect(uploadTeamPhoto('u', 'file:///a.jpg')).rejects.toThrow('mime type');
  });
});
