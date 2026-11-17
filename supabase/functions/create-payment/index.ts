// Creates an order (server price) and a MyFatoorah invoice. Returns the payment page link.
// The app sends only where to come back to; the amount is decided here, never by the app.
import { admin, cors, json, mf, userFrom } from '../_shared/myfatoorah.ts';

// The app's own return link: Expo Go (exp://), the built app (jawla://), or local web dev.
const RETURN_RE = /^(?:(?:jawla|exps?):\/\/[^\s]{1,250}|http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}\/[^\s]{0,200})$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const db = admin();
  const user = await userFrom(req, db);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const returnUrl = typeof body?.returnUrl === 'string' ? body.returnUrl : '';
  if (!RETURN_RE.test(returnUrl)) return json({ error: 'bad_return_url' }, 400);

  const { data: rows, error } = await db.rpc('create_order', { p_user: user.id, p_return_url: returnUrl });
  if (error) {
    const limited = /too many/i.test(error.message);
    if (!limited) console.error('create_order', error.message);
    return json({ error: limited ? 'rate_limited' : 'order_failed' }, limited ? 429 : 500);
  }
  const order = rows[0] as { order_id: string; amount_fils: number };
  const kwd = order.amount_fils / 1000;
  const back = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-return?order=${order.order_id}`;

  try {
    const d = await mf('/v2/SendPayment', {
      InvoiceValue: kwd,
      CustomerName: 'Jawla',
      NotificationOption: 'LNK',
      DisplayCurrencyIso: 'KWD',
      Language: 'ar',
      CallBackUrl: back,
      ErrorUrl: back,
      CustomerReference: order.order_id,
      UserDefinedField: user.id,
      InvoiceItems: [{ ItemName: 'لعبة جولة كاملة', Quantity: 1, UnitPrice: kwd }],
    });
    const { error: e2 } = await db.rpc('set_order_invoice', { p_order: order.order_id, p_invoice_id: String(d.InvoiceId) });
    if (e2) throw e2;
    return json({ orderId: order.order_id, url: d.InvoiceURL, amountFils: order.amount_fils });
  } catch (e) {
    await db.rpc('mark_order_failed', { p_order: order.order_id });
    const notConfigured = e instanceof Error && e.message === 'payment_not_configured';
    if (!notConfigured) console.error('create-payment', e instanceof Error ? e.message : e);
    return json({ error: notConfigured ? 'not_configured' : 'gateway_failed' }, 502);
  }
});
