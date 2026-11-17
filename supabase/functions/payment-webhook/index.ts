// MyFatoorah webhook (backup for when the player closes the browser before returning).
// The body is only a hint: we take the invoice id from it and ask MyFatoorah ourselves,
// so a fake webhook can never add credit.
import { admin, json, type Order, settleOrder } from '../_shared/myfatoorah.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await req.json().catch(() => null);
  const raw = body?.Data?.InvoiceId ?? body?.Data?.Invoice?.Id ?? null;
  const invoiceId = raw === null ? '' : String(raw);
  if (!/^\d{1,40}$/.test(invoiceId)) return json({ ok: true }); // ignore events we don't use

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
