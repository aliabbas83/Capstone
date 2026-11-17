// MyFatoorah webhook (backup for when the player closes the browser before returning).
// 1. If MYFATOORAH_WEBHOOK_SECRET is set, the MyFatoorah-Signature header must match
//    (see ../_shared/webhook-signature.ts for the signing rules and doc links).
// 2. Even a correctly signed body is only a hint: we take the invoice id from it and ask
//    MyFatoorah ourselves, so a fake webhook can never add credit.
// Deploy with --no-verify-jwt (MyFatoorah does not send a Supabase token).
import { admin, json, type Order, settleOrder } from '../_shared/myfatoorah.ts';
import { signatureString, verifySignature } from '../_shared/webhook-signature.ts';

const MAX_BODY = 64 * 1024;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const text = await req.text().catch(() => '');
  if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  // Only payment-status events are used; everything else is acknowledged and ignored.
  if (signatureString(body) === null) return json({ ok: true });

  const secret = Deno.env.get('MYFATOORAH_WEBHOOK_SECRET') ?? '';
  if (secret) {
    const ok = await verifySignature(body, req.headers.get('MyFatoorah-Signature'), secret);
    if (!ok) {
      console.warn('payment-webhook: bad or missing signature');
      return json({ error: 'invalid_signature' }, 401);
    }
  } else {
    console.warn('payment-webhook: MYFATOORAH_WEBHOOK_SECRET not set, signature not checked');
  }

  // deno-lint-ignore no-explicit-any
  const b = body as any;
  const raw = b?.Data?.InvoiceId ?? b?.Data?.Invoice?.Id ?? null;
  const invoiceId = raw === null ? '' : String(raw);
  if (!/^\d{1,40}$/.test(invoiceId)) return json({ ok: true });

  const db = admin();
  const { data: order } = await db
    .from('orders')
    .select('id, owner_id, amount_fils, status, invoice_id, return_url')
    .eq('invoice_id', invoiceId)
    .maybeSingle<Order>();
  if (!order) return json({ ok: true });

  try {
    await settleOrder(db, order, { type: 'InvoiceId', value: invoiceId });
  } catch (e) {
    console.error('payment-webhook', e instanceof Error ? e.message : e);
    return json({ error: 'retry' }, 500); // MyFatoorah retries failed webhooks
  }
  return json({ ok: true });
});
