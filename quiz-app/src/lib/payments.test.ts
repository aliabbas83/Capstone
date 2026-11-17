import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Fakes for the network and the browser: these tests never leave the machine.
const mockInvoke = jest.fn<(name: string, opts: { body: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }>>();
const mockOpenAuth = jest.fn<(url: string, returnUrl: string) => Promise<{ type: string }>>();

jest.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: [string, never]) => mockInvoke(...a) } } }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: (...a: [string, string]) => mockOpenAuth(...a) }));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `jawla://${path}` }));

// eslint-disable-next-line import/first
import { buyGame, PAY_MESSAGES, PaymentError, paymentErrorMessage, paymentReturnUrl, verifyOrder } from './payments';

/** A fake Response-like error context, as supabase-js gives for non-2xx function replies. */
function httpError(body: unknown, status = 400) {
  const context = new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), { context });
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpenAuth.mockReset();
});

describe('paymentReturnUrl', () => {
  it('points back to the in-app payment screen', () => {
    expect(paymentReturnUrl()).toBe('jawla://payment');
  });
});

describe('buyGame', () => {
  it('sends only the return URL: no price, amount or user data from the device', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { orderId: 'o1', url: 'https://pay.test/inv' }, error: null });
    mockOpenAuth.mockResolvedValueOnce({ type: 'success' });
    mockInvoke.mockResolvedValueOnce({ data: { status: 'paid' }, error: null });

    await buyGame();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'create-payment', { body: { returnUrl: 'jawla://payment' } });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'verify-payment', { body: { orderId: 'o1' } });
  });

  it('opens the server-made payment page and returns the server status', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { orderId: 'o1', url: 'https://pay.test/inv' }, error: null });
    mockOpenAuth.mockResolvedValueOnce({ type: 'success' });
    mockInvoke.mockResolvedValueOnce({ data: { status: 'paid' }, error: null });

    await expect(buyGame()).resolves.toEqual({ orderId: 'o1', status: 'paid' });
    expect(mockOpenAuth).toHaveBeenCalledWith('https://pay.test/inv', 'jawla://payment');
  });

  it('calls it "cancelled" when the player closed the page and the server still says pending', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { orderId: 'o2', url: 'https://pay.test/inv' }, error: null });
    mockOpenAuth.mockResolvedValueOnce({ type: 'cancel' });
    mockInvoke.mockResolvedValueOnce({ data: { status: 'pending' }, error: null });

    await expect(buyGame()).resolves.toEqual({ orderId: 'o2', status: 'cancelled' });
  });

  it('keeps "pending" when the browser came back normally', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { orderId: 'o3', url: 'https://pay.test/inv' }, error: null });
    mockOpenAuth.mockResolvedValueOnce({ type: 'success' });
    mockInvoke.mockResolvedValueOnce({ data: { status: 'pending' }, error: null });

    await expect(buyGame()).resolves.toEqual({ orderId: 'o3', status: 'pending' });
  });

  it('trusts the server over the browser: closed page but paid = paid', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { orderId: 'o4', url: 'https://pay.test/inv' }, error: null });
    mockOpenAuth.mockResolvedValueOnce({ type: 'dismiss' });
    mockInvoke.mockResolvedValueOnce({ data: { status: 'paid' }, error: null });

    await expect(buyGame()).resolves.toEqual({ orderId: 'o4', status: 'paid' });
  });

  it('does not open the browser when the server refuses to create a payment', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'rate_limited' }) });

    await expect(buyGame()).rejects.toEqual(new PaymentError('rate_limited'));
    expect(mockOpenAuth).not.toHaveBeenCalled();
  });
});

describe('verifyOrder errors', () => {
  it('uses the error code from the server reply', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'not_found' }) });
    const err = await verifyOrder('o1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect((err as PaymentError).code).toBe('not_found');
  });

  it('says "network" for a fetch failure', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('Failed to send a request: TypeError: Network request failed') });
    await expect(verifyOrder('o1')).rejects.toMatchObject({ code: 'network' });
  });

  it('says "unknown" when the reply has no readable code', async () => {
    const context = new Response('not json', { status: 500 });
    mockInvoke.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('boom'), { context }) });
    await expect(verifyOrder('o1')).rejects.toMatchObject({ code: 'unknown' });
  });

  it('treats a 401 without an error code as an expired session', async () => {
    // e.g. the Supabase gateway rejecting an old token: {"code":401,"message":"Invalid JWT"}
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError({ code: 401, message: 'Invalid JWT' }, 401) });
    const err = await verifyOrder('o1').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'unauthorized' });
    expect(paymentErrorMessage(err)).toMatch(/انتهت جلستك/);
  });

  it('treats a 401 with a non-JSON body as an expired session too', async () => {
    const context = new Response('Unauthorized', { status: 401 });
    mockInvoke.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('x'), { context }) });
    await expect(verifyOrder('o1')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('still prefers the server error code on a 401', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'not_configured' }, 401) });
    await expect(verifyOrder('o1')).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('keeps the fallback code when the JSON has no "error" field', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError({ message: 'x' }) });
    await expect(verifyOrder('o1')).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('paymentErrorMessage', () => {
  it.each(['not_configured', 'rate_limited', 'gateway_failed', 'unauthorized', 'not_found', 'bad_order', 'network'])(
    'gives a specific Arabic message for %s',
    (code) => {
      const msg = paymentErrorMessage(new PaymentError(code));
      expect(msg).toMatch(/[؀-ۿ]/);
      expect(msg).not.toBe(paymentErrorMessage(new PaymentError('something_else')));
    },
  );

  it('never leaks raw error text from other errors', () => {
    const msg = paymentErrorMessage(new Error('secret internal detail'));
    expect(msg).not.toContain('secret');
    expect(msg).toBe(paymentErrorMessage(null));
  });
});

describe('rate limit messages', () => {
  it('create-payment limit says wait 10 minutes', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'rate_limited' }, 429) });
    const err = await buyGame().catch((e: unknown) => e);
    expect(paymentErrorMessage(err)).toMatch(/١٠ دقائق/);
  });

  it('verify-payment limit says wait a minute', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'rate_limited' }, 429) });
    const err = await verifyOrder('o1').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'rate_limited' });
    const msg = paymentErrorMessage(err);
    expect(msg).toMatch(/دقيقة/);
    expect(msg).not.toMatch(/١٠/);
  });
});

describe('PAY_MESSAGES', () => {
  it('has an Arabic message for every status', () => {
    for (const s of ['paid', 'pending', 'failed', 'cancelled'] as const) {
      expect(PAY_MESSAGES[s]).toMatch(/[؀-ۿ]/);
    }
  });
});
