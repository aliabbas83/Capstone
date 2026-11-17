// The app asks "did my order go through?". We ask MyFatoorah directly and credit once if paid.
import { admin, cors, json, type Order, settleOrder, userFrom, UUID_RE } from '../_shared/myfatoorah.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const db = admin();
  const user = await userFrom(req, db);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
  if (!UUID_RE.test(orderId)) return json({ error: 'bad_order' }, 400);

  const { data: order } = await db
    .from('orders')
    .select('id, owner_id, amount_fils, status, invoice_id, return_url')
    .eq('id', orderId)
    .eq('owner_id', user.id)
    .maybeSingle<Order>();
  if (!order) return json({ error: 'not_found' }, 404);

  try {
    const status =
      order.status === 'pending' && order.invoice_id
        ? await settleOrder(db, order, { type: 'InvoiceId', value: order.invoice_id })
        : order.status;
    return json({ status });
  } catch (e) {
    console.error('verify-payment', e instanceof Error ? e.message : e);
    return json({ error: 'gateway_failed' }, 502);
  }
});
