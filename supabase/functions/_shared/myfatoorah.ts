// Shared helpers for the payment edge functions.
// Secrets come from Supabase secrets only: MYFATOORAH_API_KEY (required), MYFATOORAH_BASE_URL (optional).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const MF_BASE = (Deno.env.get('MYFATOORAH_BASE_URL') ?? 'https://apitest.myfatoorah.com').replace(/\/$/, '');

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Server-side Supabase client (service role). Never sent to the app. */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in user from the request's bearer token, or null. */
export async function userFrom(req: Request, db: SupabaseClient) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}

/** Call the MyFatoorah API. Throws on any failure (details go to the function logs, not the app). */
// deno-lint-ignore no-explicit-any
export async function mf(path: string, body: unknown): Promise<any> {
  const key = Deno.env.get('MYFATOORAH_API_KEY');
  if (!key) throw new Error('payment_not_configured');
  const res = await fetch(`${MF_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.IsSuccess) {
    console.error('myfatoorah', path, res.status, data?.Message, JSON.stringify(data?.ValidationErrors ?? null));
    throw new Error('myfatoorah_failed');
  }
  return data.Data;
}

export type Order = {
  id: string;
  owner_id: string;
  amount_fils: number;
  status: 'pending' | 'paid' | 'failed';
  invoice_id: string | null;
  return_url: string;
};

export type Settled = 'paid' | 'pending' | 'failed';

/**
 * Ask MyFatoorah directly about this order's invoice. Credit the account only if the invoice
 * belongs to this order, is paid, and the paid amount matches the server price. Never trusts
 * anything sent by the device or the browser.
 */
export async function settleOrder(
  db: SupabaseClient,
  order: Order,
  key: { type: 'PaymentId' | 'InvoiceId'; value: string },
): Promise<Settled> {
  if (order.status !== 'pending') return order.status;
  if (!order.invoice_id) return 'pending';

  const d = await mf('/v2/getPaymentStatus', { Key: key.value, KeyType: key.type });
  if (String(d.InvoiceId) !== order.invoice_id || String(d.CustomerReference ?? '') !== order.id) {
    console.warn('settleOrder: invoice does not belong to order', order.id);
    return 'pending';
  }

  // deno-lint-ignore no-explicit-any
  const txs: any[] = d.InvoiceTransactions ?? [];
  const ok = txs.find((t) => t.TransactionStatus === 'Succss' || t.TransactionStatus === 'Success');
  if (d.InvoiceStatus === 'Paid' && ok) {
    const paidFils = Math.round(Number(d.InvoiceValue) * 1000);
    const { error } = await db.rpc('mark_order_paid', {
      p_order: order.id,
      p_invoice_id: order.invoice_id,
      p_payment_id: String(ok.PaymentId ?? key.value),
      p_paid_fils: paidFils,
    });
    if (error) throw error;
    const { data: fresh } = await db.from('orders').select('status').eq('id', order.id).single();
    return (fresh?.status as Settled) ?? 'pending';
  }

  if (d.InvoiceStatus === 'Canceled' || d.InvoiceStatus === 'Expired') {
    await db.rpc('mark_order_failed', { p_order: order.id });
    return 'failed';
  }
  // This attempt failed, but the invoice link can still be paid, so the order stays open.
  if (key.type === 'PaymentId' && txs.some((t) => String(t.PaymentId) === key.value && t.TransactionStatus === 'Failed')) {
    return 'failed';
  }
  return 'pending';
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
