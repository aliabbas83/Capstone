// Tests for the shared payment helpers. No real network: fetch is replaced with a fake
// MyFatoorah, and the database with a fake client that records RPC calls.
// Run: deno test --allow-env supabase/functions/_shared/myfatoorah.test.ts
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

Deno.env.set('MYFATOORAH_BASE_URL', 'https://mf.test/');
Deno.env.set('MYFATOORAH_API_KEY', 'test-key-not-real');
const { json, cors, mf, settleOrder, userFrom, UUID_RE } = await import('./myfatoorah.ts');
type Order = import('./myfatoorah.ts').Order;

const ORDER_ID = '3f0b6a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b';
const order = (over: Partial<Order> = {}): Order => ({
  id: ORDER_ID,
  owner_id: 'owner-1',
  amount_fils: 1500,
  status: 'pending',
  invoice_id: '777',
  return_url: 'jawla://payment',
  ...over,
});

type Call = { url: string; init: RequestInit };

/** Replace fetch with a fake MyFatoorah that answers every call with `reply`. */
function fakeMyFatoorah(reply: unknown, status = 200): { calls: Call[]; restore: () => void } {
  const real = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(new Response(JSON.stringify(reply), { status }));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

/** A paid-invoice reply from getPaymentStatus. */
const paidReply = (over: Record<string, unknown> = {}) => ({
  IsSuccess: true,
  Data: {
    InvoiceId: 777,
    CustomerReference: ORDER_ID,
    InvoiceStatus: 'Paid',
    InvoiceValue: 1.5,
    InvoiceTransactions: [{ TransactionStatus: 'Succss', PaymentId: 'PAY-1' }],
    ...over,
  },
});

/** Fake service-role client: records RPCs, and returns `freshStatus` when the order is re-read. */
function fakeDb(freshStatus = 'paid', rpcError: unknown = null) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return Promise.resolve({ error: rpcError });
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { status: freshStatus } }) }) }),
    }),
  };
  // deno-lint-ignore no-explicit-any
  return { db: db as any, rpcs };
}

const byPayment = { type: 'PaymentId' as const, value: 'PAY-1' };

// ── settleOrder ──

Deno.test('settleOrder: paid invoice for this order credits it with the paid amount in fils', async () => {
  const mfFake = fakeMyFatoorah(paidReply());
  const { db, rpcs } = fakeDb('paid');
  try {
    assertEquals(await settleOrder(db, order(), byPayment), 'paid');
    assertEquals(rpcs, [
      { fn: 'mark_order_paid', args: { p_order: ORDER_ID, p_invoice_id: '777', p_payment_id: 'PAY-1', p_paid_fils: 1500 } },
    ]);
    assertEquals(mfFake.calls[0].url, 'https://mf.test/v2/getPaymentStatus');
    assertEquals(JSON.parse(String(mfFake.calls[0].init.body)), { Key: 'PAY-1', KeyType: 'PaymentId' });
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: converts KWD to fils without float errors (0.1 + 0.2 style values)', async () => {
  const mfFake = fakeMyFatoorah(paidReply({ InvoiceValue: 0.3 + 0.6 })); // 0.8999999999999999
  const { db, rpcs } = fakeDb('paid');
  try {
    await settleOrder(db, order({ amount_fils: 900 }), byPayment);
    assertEquals(rpcs[0].args.p_paid_fils, 900);
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: accepts the "Success" spelling as well as MyFatoorah\'s "Succss"', async () => {
  const mfFake = fakeMyFatoorah(paidReply({ InvoiceTransactions: [{ TransactionStatus: 'Success', PaymentId: 'PAY-9' }] }));
  const { db, rpcs } = fakeDb('paid');
  try {
    assertEquals(await settleOrder(db, order(), byPayment), 'paid');
    assertEquals(rpcs[0].args.p_payment_id, 'PAY-9');
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: a wrong amount is passed through so the database refuses it (stays pending)', async () => {
  // The SQL mark_order_paid only credits when amount_fils = p_paid_fils.
  const mfFake = fakeMyFatoorah(paidReply({ InvoiceValue: 0.1 }));
  const { db, rpcs } = fakeDb('pending');
  try {
    assertEquals(await settleOrder(db, order(), byPayment), 'pending');
    assertEquals(rpcs[0].args.p_paid_fils, 100);
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: an invoice from another order is never credited', async () => {
  const mfFake = fakeMyFatoorah(paidReply({ InvoiceId: 999 }));
  const { db, rpcs } = fakeDb('paid');
  try {
    assertEquals(await settleOrder(db, order(), byPayment), 'pending');
    assertEquals(rpcs.length, 0);
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: the same invoice id but another order reference is never credited', async () => {
  const mfFake = fakeMyFatoorah(paidReply({ CustomerReference: 'someone-else' }));
  const { db, rpcs } = fakeDb('paid');
  try {
    assertEquals(await settleOrder(db, order(), byPayment), 'pending');
    assertEquals(rpcs.length, 0);
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: a missing customer reference is never credited', async () => {
  const mfFake = fakeMyFatoorah(paidReply({ CustomerReference: null }));
  const { db, rpcs } = fakeDb('paid');
  try {
    assertEquals(await settleOrder(db, order(), byPayment), 'pending');
    assertEquals(rpcs.length, 0);
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: "Paid" with no successful transaction is not credited', async () => {
  const mfFake = fakeMyFatoorah(paidReply({ InvoiceTransactions: [{ TransactionStatus: 'Failed', PaymentId: 'X' }] }));
  const { db, rpcs } = fakeDb('paid');
  try {
    assertEquals(await settleOrder(db, order(), { type: 'InvoiceId', value: '777' }), 'pending');
    assertEquals(rpcs.length, 0);
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: already settled orders are returned without asking MyFatoorah', async () => {
  const mfFake = fakeMyFatoorah(paidReply());
  const { db, rpcs } = fakeDb();
  try {
    assertEquals(await settleOrder(db, order({ status: 'paid' }), byPayment), 'paid');
    assertEquals(await settleOrder(db, order({ status: 'failed' }), byPayment), 'failed');
    assertEquals(await settleOrder(db, order({ invoice_id: null }), byPayment), 'pending');
    assertEquals(mfFake.calls.length, 0);
    assertEquals(rpcs.length, 0);
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: cancelled or expired invoices mark the order failed', async () => {
  for (const InvoiceStatus of ['Canceled', 'Expired']) {
    const mfFake = fakeMyFatoorah(paidReply({ InvoiceStatus, InvoiceTransactions: [] }));
    const { db, rpcs } = fakeDb();
    try {
      assertEquals(await settleOrder(db, order(), { type: 'InvoiceId', value: '777' }), 'failed');
      assertEquals(rpcs, [{ fn: 'mark_order_failed', args: { p_order: ORDER_ID } }]);
    } finally {
      mfFake.restore();
    }
  }
});

Deno.test('settleOrder: a failed attempt says failed but leaves the order open for another try', async () => {
  const mfFake = fakeMyFatoorah(
    paidReply({ InvoiceStatus: 'Pending', InvoiceTransactions: [{ TransactionStatus: 'Failed', PaymentId: 'PAY-1' }] }),
  );
  const { db, rpcs } = fakeDb();
  try {
    assertEquals(await settleOrder(db, order(), byPayment), 'failed');
    assertEquals(rpcs.length, 0); // no mark_order_failed
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: a failed transaction with a different PaymentId keeps it pending', async () => {
  const mfFake = fakeMyFatoorah(
    paidReply({ InvoiceStatus: 'Pending', InvoiceTransactions: [{ TransactionStatus: 'Failed', PaymentId: 'OTHER' }] }),
  );
  const { db } = fakeDb();
  try {
    assertEquals(await settleOrder(db, order(), byPayment), 'pending');
  } finally {
    mfFake.restore();
  }
});

Deno.test('settleOrder: database errors are thrown, not swallowed', async () => {
  const mfFake = fakeMyFatoorah(paidReply());
  const { db } = fakeDb('paid', new Error('db down'));
  try {
    await assertRejects(() => settleOrder(db, order(), byPayment), Error, 'db down');
  } finally {
    mfFake.restore();
  }
});

// ── mf ──

Deno.test('mf: sends the secret key only in the Authorization header and returns Data', async () => {
  const mfFake = fakeMyFatoorah({ IsSuccess: true, Data: { ok: 1 } });
  try {
    assertEquals(await mf('/v2/x', { a: 1 }), { ok: 1 });
    const headers = mfFake.calls[0].init.headers as Record<string, string>;
    assertEquals(headers.Authorization, 'Bearer test-key-not-real');
    assert(!String(mfFake.calls[0].init.body).includes('test-key-not-real'));
  } finally {
    mfFake.restore();
  }
});

Deno.test('mf: IsSuccess=false or an HTTP error throws a generic error (no gateway details)', async () => {
  const origError = console.error;
  console.error = () => {};
  try {
    for (const [reply, status] of [[{ IsSuccess: false, Message: 'secret detail' }, 200], [{ IsSuccess: true }, 500]] as const) {
      const mfFake = fakeMyFatoorah(reply, status);
      try {
        await assertRejects(() => mf('/v2/x', {}), Error, 'myfatoorah_failed');
      } finally {
        mfFake.restore();
      }
    }
  } finally {
    console.error = origError;
  }
});

Deno.test('mf: throws payment_not_configured when the key is missing', async () => {
  Deno.env.delete('MYFATOORAH_API_KEY');
  const mfFake = fakeMyFatoorah({ IsSuccess: true, Data: {} });
  try {
    await assertRejects(() => mf('/v2/x', {}), Error, 'payment_not_configured');
    assertEquals(mfFake.calls.length, 0);
  } finally {
    mfFake.restore();
    Deno.env.set('MYFATOORAH_API_KEY', 'test-key-not-real');
  }
});

// ── small helpers ──

Deno.test('json: JSON body, status and CORS headers', async () => {
  const res = json({ error: 'x' }, 418);
  assertEquals(res.status, 418);
  assertEquals(res.headers.get('Content-Type'), 'application/json');
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), cors['Access-Control-Allow-Origin']);
  assertEquals(await res.json(), { error: 'x' });
});

Deno.test('UUID_RE: accepts UUIDs only', () => {
  assert(UUID_RE.test(ORDER_ID));
  assert(UUID_RE.test(ORDER_ID.toUpperCase()));
  for (const bad of ['', 'abc', `${ORDER_ID}x`, ` ${ORDER_ID}`, "1' or '1'='1", ORDER_ID.replaceAll('-', '')]) {
    assert(!UUID_RE.test(bad), bad);
  }
});

Deno.test('userFrom: no token = null, bad token = null, good token = user', async () => {
  const user = { id: 'u1' };
  const db = {
    auth: {
      getUser: (t: string) =>
        Promise.resolve(t === 'good' ? { data: { user }, error: null } : { data: { user: null }, error: new Error('bad jwt') }),
    },
  };
  const req = (auth?: string) => new Request('https://x.test', { headers: auth ? { Authorization: auth } : {} });
  // deno-lint-ignore no-explicit-any
  const d = db as any;
  assertEquals(await userFrom(req(), d), null);
  assertEquals(await userFrom(req('Bearer bad'), d), null);
  assertEquals(await userFrom(req('Bearer good'), d), user);
  assertEquals(await userFrom(req('bearer good'), d), user);
});
