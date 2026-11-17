import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

/** What the server says about an order. "cancelled" = the player closed the page without paying. */
export type PayStatus = 'paid' | 'pending' | 'failed' | 'cancelled';

export class PaymentError extends Error {
  /** `fn` is the edge function that failed, so messages can fit the action. */
  constructor(
    public code: string,
    public fn?: string,
  ) {
    super(code);
  }
}

async function call<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = /fetch|network/i.test(error.message) ? 'network' : 'unknown';
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      // A 401 without our own error code (e.g. "Invalid JWT" from the gateway) = expired session.
      if (ctx.status === 401) code = 'unauthorized';
      try {
        code = ((await ctx.json()) as { error?: string }).error ?? code;
      } catch {
        // keep the code we have
      }
    }
    throw new PaymentError(code, name);
  }
  return data as T;
}

/** Where MyFatoorah sends the player back to (handled by app/payment.tsx). */
export const paymentReturnUrl = () => Linking.createURL('payment');

/**
 * Buy one game. The server sets the price and creates the MyFatoorah invoice; we only open
 * the payment page. Afterwards we ask the server, which checks with MyFatoorah itself.
 */
export async function buyGame(): Promise<{ orderId: string; status: PayStatus }> {
  const returnUrl = paymentReturnUrl();
  const { orderId, url } = await call<{ orderId: string; url: string }>('create-payment', { returnUrl });
  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  const { status } = await verifyOrder(orderId);
  return { orderId, status: status === 'pending' && result.type !== 'success' ? 'cancelled' : status };
}

export function verifyOrder(orderId: string) {
  return call<{ status: 'paid' | 'pending' | 'failed' }>('verify-payment', { orderId });
}

export function paymentErrorMessage(e: unknown): string {
  const code = e instanceof PaymentError ? e.code : '';
  if (code === 'not_configured') return 'الدفع غير مفعّل في الخادم بعد. جرّب لاحقاً.';
  if (code === 'rate_limited' && e instanceof PaymentError && e.fn === 'verify-payment')
    return 'تحققت مرات كثيرة. انتظر دقيقة ثم حاول مرة ثانية.';
  if (code === 'rate_limited') return 'فتحت صفحات دفع كثيرة. انتظر ١٠ دقائق ثم حاول.';
  if (code === 'gateway_failed') return 'بوابة الدفع ما ردّت. حاول مرة ثانية بعد شوي.';
  if (code === 'unauthorized') return 'انتهت جلستك. سجّل دخول مرة ثانية.';
  if (code === 'not_found' || code === 'bad_order') return 'ما لقينا هذا الطلب في حسابك.';
  if (code === 'network') return 'لا يوجد اتصال بالإنترنت. تأكد من الشبكة وحاول مرة ثانية.';
  return 'صار خطأ في الدفع. ما انخصم شي إلا إذا وصلتك رسالة نجاح.';
}

export const PAY_MESSAGES: Record<PayStatus, string> = {
  paid: 'تم الدفع! أضفنا لعبة لرصيدك 🎉',
  pending: 'لسه ما وصلنا تأكيد الدفع. اضغط "تحقق" بعد لحظات.',
  failed: 'ما تم الدفع. ما انخصم منك شي، تقدر تحاول مرة ثانية.',
  cancelled: 'سكّرت صفحة الدفع قبل ما تكمل. ما انخصم منك شي.',
};
