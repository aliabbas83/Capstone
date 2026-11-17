// MyFatoorah webhook signature check (MyFatoorah-Signature header).
//
// How MyFatoorah signs (docs, checked 2026-11-17):
//   https://docs.myfatoorah.com/docs/webhook-signature
//   https://docs.myfatoorah.com/docs/webhook-sample-code
//   https://docs.myfatoorah.com/docs/transaction-data-model           (v1)
//   https://docs.myfatoorah.com/docs/webhook-v2-payment-status-data-model (v2)
// 1. Build one string "Key=Value,Key=Value,..." from the event's Data fields (null -> empty string).
//    - Webhook v1 (Event "TransactionsStatusChanged"): every property of Data, keys sorted
//      alphabetically, case-insensitive (the PHP sample uses uksort(..., 'strcasecmp')).
//    - Webhook v2 (Event.Code 1 / "PAYMENT_STATUS_CHANGED"): this fixed order:
//      Invoice.Id, Invoice.Status, Transaction.Status, Transaction.PaymentId, Invoice.ExternalIdentifier
// 2. HMAC-SHA256 over that string (UTF-8) with the webhook secret key from the MyFatoorah portal.
// 3. Base64 the binary result and compare with the MyFatoorah-Signature header.
//
// Pure functions (no Deno.env) so they can be unit tested.

const enc = new TextEncoder();

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/** The exact string MyFatoorah signs, or null if this is not a payment-status event we know. */
// deno-lint-ignore no-explicit-any
export function signatureString(body: any): string | null {
  if (!body || typeof body !== 'object' || !body.Data || typeof body.Data !== 'object') return null;

  // v2: { Event: { Code: 1, Name: 'PAYMENT_STATUS_CHANGED' }, Data: { Invoice, Transaction, ... } }
  if (body.Event && typeof body.Event === 'object') {
    if (body.Event.Code !== 1 && body.Event.Name !== 'PAYMENT_STATUS_CHANGED') return null;
    const inv = body.Data.Invoice ?? {};
    const tx = body.Data.Transaction ?? {};
    return [
      `Invoice.Id=${str(inv.Id)}`,
      `Invoice.Status=${str(inv.Status)}`,
      `Transaction.Status=${str(tx.Status)}`,
      `Transaction.PaymentId=${str(tx.PaymentId)}`,
      `Invoice.ExternalIdentifier=${str(inv.ExternalIdentifier)}`,
    ].join(',');
  }

  // v1: { EventType: 1, Event: 'TransactionsStatusChanged', Data: { flat fields } }
  if (body.EventType === 1 || body.Event === 'TransactionsStatusChanged') {
    const data = body.Data as Record<string, unknown>;
    const keys = Object.keys(data).sort((a, b) => {
      const x = a.toLowerCase();
      const y = b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return keys.map((k) => `${k}=${str(data[k])}`).join(',');
  }
  return null;
}

/** Base64 HMAC-SHA256 of `message` with `secret`. */
export async function hmacBase64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  let bin = '';
  for (const b of mac) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Constant-time string compare (length leak only, which is fixed for a SHA-256 base64). */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** True only if the header is present and matches the signature of this payment-status event. */
// deno-lint-ignore no-explicit-any
export async function verifySignature(body: any, header: string | null, secret: string): Promise<boolean> {
  if (!secret || !header) return false;
  const msg = signatureString(body);
  if (msg === null) return false;
  return safeEqual(await hmacBase64(secret, msg), header.trim());
}
