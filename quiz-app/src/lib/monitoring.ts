import * as Sentry from '@sentry/react-native';

/**
 * Crash and error reports go to Sentry. It is switched on only when
 * EXPO_PUBLIC_SENTRY_DSN is set in .env.local; without it nothing is sent.
 * Privacy: no emails, phone numbers, IP addresses or screenshots are sent,
 * only the error, the screen it happened on, and an anonymous account id.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const monitoringOn = !!dsn;

const PHONE_OR_EMAIL = /(\+?\d[\d\s-]{6,}\d)|([\w.+-]+@[\w-]+\.[\w.-]+)/g;
const scrub = (s?: string) => s?.replace(PHONE_OR_EMAIL, '[hidden]');

if (dsn) {
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    attachScreenshot: false,
    tracesSampleRate: __DEV__ ? 0 : 0.1,
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      event.message = scrub(event.message);
      event.exception?.values?.forEach((v) => (v.value = scrub(v.value)));
      return event;
    },
    beforeBreadcrumb(crumb) {
      crumb.message = scrub(crumb.message);
      // Network breadcrumbs can carry tokens or emails in URLs; keep only the path.
      if (crumb.data?.url && typeof crumb.data.url === 'string') crumb.data.url = crumb.data.url.split('?')[0];
      return crumb;
    },
  });
}

/** Wraps the root component so render crashes are caught and reported. */
export const withMonitoring = (C: React.ComponentType<Record<string, unknown>>) => (dsn ? Sentry.wrap(C) : C);

/** Remember which account is playing (anonymous id only), or forget it on log out. */
export function setMonitoringUser(id: string | null) {
  if (dsn) Sentry.setUser(id ? { id } : null);
}

/** Report an error we handled ourselves (e.g. a failed server call), with a short tag. */
export function reportError(error: unknown, where: string) {
  if (dsn) Sentry.captureException(error, { tags: { where } });
}
