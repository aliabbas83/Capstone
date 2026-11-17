// MyFatoorah sends the browser here after paying (or failing). We check the payment with
// MyFatoorah ourselves, then send the browser back to the app link saved with the order.
// The destination comes from the database, never from the query string (no open redirect).
import { admin, type Order, settleOrder, type Settled, UUID_RE } from '../_shared/myfatoorah.ts';

function text(msg: string, status = 200) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return text('Method not allowed', 405);
  const url = new URL(req.url);
  const orderId = url.searchParams.get('order') ?? '';
  const paymentId = url.searchParams.get('paymentId') ?? url.searchParams.get('PaymentId') ?? '';
  if (!UUID_RE.test(orderId)) return text('طلب غير صحيح.', 400);

  const db = admin();
  const { data: order } = await db
    .from('orders')
    .select('id, owner_id, amount_fils, status, invoice_id, return_url')
    .eq('id', orderId)
    .maybeSingle<Order>();
  if (!order) return text('الطلب غير موجود.', 404);

  let status: Settled = order.status;
  if (status === 'pending' && /^\d{1,40}$/.test(paymentId)) {
    status = await settleOrder(db, order, { type: 'PaymentId', value: paymentId }).catch((e) => {
      console.error('payment-return', e instanceof Error ? e.message : e);
      return 'pending' as Settled;
    });
  }

  const dest = new URL(order.return_url);
  dest.searchParams.set('order', order.id);
  dest.searchParams.set('status', status);
  return new Response(`ارجع للتطبيق: ${dest.toString()}`, {
    status: 302,
    headers: { Location: dest.toString(), 'Content-Type': 'text/plain; charset=utf-8' },
  });
});
