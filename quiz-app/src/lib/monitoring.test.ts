import { afterEach, describe, expect, it, jest } from '@jest/globals';

type SentryMock = {
  init: jest.Mock;
  wrap: jest.Mock;
  setUser: jest.Mock;
  captureException: jest.Mock;
};
type Monitoring = typeof import('./monitoring');
// Minimal shapes of what Sentry hands to our hooks.
type Hooks = {
  beforeSend: (e: Record<string, any>) => Record<string, any>;
  beforeBreadcrumb: (c: Record<string, any>) => Record<string, any>;
  sendDefaultPii: boolean;
  attachScreenshot: boolean;
  dsn: string;
};

const ORIGINAL_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** Load monitoring.ts fresh with (or without) a DSN, against a fake Sentry. */
function load(dsn: string | undefined): { m: Monitoring; sentry: SentryMock } {
  if (dsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
  const sentry: SentryMock = {
    init: jest.fn(),
    wrap: jest.fn((c: unknown) => ({ wrapped: c })),
    setUser: jest.fn(),
    captureException: jest.fn(),
  };
  let m!: Monitoring;
  jest.isolateModules(() => {
    jest.doMock('@sentry/react-native', () => sentry);
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh copy per test
    m = require('./monitoring');
  });
  return { m, sentry };
}

const hooksOf = (sentry: SentryMock) => sentry.init.mock.calls[0][0] as Hooks;

afterEach(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
  jest.resetModules();
});

describe('monitoring without a DSN', () => {
  it('is off and never starts Sentry', () => {
    const { m, sentry } = load(undefined);
    expect(m.monitoringOn).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('sends nothing: no user, no errors, no wrapping', () => {
    const { m, sentry } = load(undefined);
    const Root = () => null;
    m.setMonitoringUser('user-1');
    m.reportError(new Error('boom'), 'lobby');
    expect(m.withMonitoring(Root)).toBe(Root);
    expect(sentry.setUser).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.wrap).not.toHaveBeenCalled();
  });

  it('treats an empty DSN as off', () => {
    const { m, sentry } = load('');
    expect(m.monitoringOn).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
  });
});

describe('monitoring with a DSN', () => {
  const DSN = 'https://public@o0.ingest.sentry.io/0';

  it('starts Sentry with personal data, screenshots and IPs switched off', () => {
    const { m, sentry } = load(DSN);
    expect(m.monitoringOn).toBe(true);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    const opts = hooksOf(sentry);
    expect(opts.dsn).toBe(DSN);
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.attachScreenshot).toBe(false);
  });

  it('only sends the anonymous account id and forgets it on log out', () => {
    const { m, sentry } = load(DSN);
    m.setMonitoringUser('b3c1-uuid');
    m.setMonitoringUser(null);
    expect(sentry.setUser).toHaveBeenNthCalledWith(1, { id: 'b3c1-uuid' });
    expect(sentry.setUser).toHaveBeenNthCalledWith(2, null);
  });

  it('reports handled errors with a "where" tag', () => {
    const { m, sentry } = load(DSN);
    const err = new Error('boom');
    m.reportError(err, 'payment');
    expect(sentry.captureException).toHaveBeenCalledWith(err, { tags: { where: 'payment' } });
  });

  it('wraps the root component', () => {
    const { m, sentry } = load(DSN);
    const Root = () => null;
    expect(m.withMonitoring(Root)).toEqual({ wrapped: Root });
    expect(sentry.wrap).toHaveBeenCalledWith(Root);
  });

  it('beforeSend strips everything from the user except the id', () => {
    const { sentry } = load(DSN);
    const out = hooksOf(sentry).beforeSend({
      user: { id: 'u1', email: 'ali@example.com', ip_address: '1.2.3.4', username: 'ali' },
    });
    expect(out.user).toEqual({ id: 'u1' });
  });

  it('beforeSend hides emails and phone numbers in messages and exceptions', () => {
    const { sentry } = load(DSN);
    const out = hooksOf(sentry).beforeSend({
      message: 'sign in failed for ali.k+1@example.com',
      exception: {
        values: [
          { value: 'bad phone +965 9912 3456' },
          { value: 'login 96599123456@phone.jawla.invalid' },
          { value: 'plain error' },
          {},
        ],
      },
    });
    expect(out.message).toBe('sign in failed for [hidden]');
    const values = out.exception.values.map((v: { value?: string }) => v.value);
    expect(values[0]).toBe('bad phone [hidden]');
    expect(values[1]).not.toContain('99123456');
    expect(values[2]).toBe('plain error');
    expect(values[3]).toBeUndefined();
  });

  it('beforeSend keeps an event without user or message', () => {
    const { sentry } = load(DSN);
    const out = hooksOf(sentry).beforeSend({ level: 'error' });
    expect(out.level).toBe('error');
    expect(out.user).toBeUndefined();
  });

  it('beforeBreadcrumb hides personal data and drops URL query strings', () => {
    const { sentry } = load(DSN);
    const crumb = hooksOf(sentry).beforeBreadcrumb({
      message: 'typed 55123456',
      data: { url: 'https://x.supabase.co/auth/v1/token?email=ali@example.com&grant_type=password', method: 'POST' },
    });
    expect(crumb.message).toBe('typed [hidden]');
    expect(crumb.data.url).toBe('https://x.supabase.co/auth/v1/token');
    expect(crumb.data.method).toBe('POST');
  });

  it('beforeBreadcrumb leaves non-string URLs and empty crumbs alone', () => {
    const { sentry } = load(DSN);
    const hooks = hooksOf(sentry);
    expect(hooks.beforeBreadcrumb({ data: { url: 42 } }).data.url).toBe(42);
    expect(hooks.beforeBreadcrumb({}).message).toBeUndefined();
  });
});
