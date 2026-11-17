// Daily job (pg_cron → pg_net): top up the question bank.
// 1. Find the category/points pairs furthest below target (at most ~60 new questions per run).
// 2. Fetch English questions from Open Trivia DB (6 categories) and translate them with OpenRouter.
// 3. Ask OpenRouter to write new Arabic questions for every category.
// 4. A second, strict AI pass checks every question; doubtful ones are dropped.
// 5. public.add_questions saves them, rejecting duplicates and answers already in the bank.
//
// Not reachable by app users: the caller must send the Vault token `refill_token`
// in the x-refill-token header (only the cron job can read it).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  type Candidate,
  type Category,
  fetchOpenTdb,
  generate,
  openTdbToken,
  opentdbFor,
  OTDB_GAP_MS,
  pick,
  planSlots,
  sleep,
  type Stock,
  translate,
  type TriviaItem,
  verify,
} from '../_shared/questions.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Service-role client (server only). */
const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const db = admin();
  const token = req.headers.get('x-refill-token') ?? '';
  if (!token || token.length > 200) return json({ error: 'unauthorized' }, 401);
  const { data: allowed } = await db.rpc('check_refill_token', { p_token: token });
  if (allowed !== true) return json({ error: 'unauthorized' }, 401);

  if (!Deno.env.get('OPENROUTER_API_KEY')) {
    console.warn('refill-questions: OPENROUTER_API_KEY not set');
    return json({ error: 'not_configured' }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const max = Math.min(100, Math.max(1, Number(body?.max) || Number(Deno.env.get('REFILL_MAX_PER_RUN')) || 60));

  const { data: ctx, error: ctxErr } = await db.rpc('refill_context');
  if (ctxErr || !ctx) {
    console.error('refill-questions: context', ctxErr?.message);
    return json({ error: 'db_failed' }, 500);
  }
  const categories = ctx.categories as Category[];
  const answers = ctx.answers as Record<string, string[]>;
  const slots = planSlots(categories, ctx.stock as Stock[], max);
  if (!slots.length) return json({ added: 0, note: 'bank is full' });

  // Open Trivia DB, one request at a time (its rate limit), skipping questions we already have.
  const trivia = new Map<number, TriviaItem[]>();
  const otdbToken = slots.some(opentdbFor) ? await openTdbToken() : null;
  let first = true;
  for (const [i, slot] of slots.entries()) {
    const src = opentdbFor(slot);
    if (!src) continue;
    if (!first) await sleep(OTDB_GAP_MS);
    first = false;
    const items = await fetchOpenTdb(src.category, src.difficulty, slot.want * 2, otdbToken);
    const { data: known } = items.length
      ? await db.rpc('known_refs', { p_refs: items.map((t) => t.ref) })
      : { data: [] };
    const skip = new Set<string>((known as string[] | null) ?? []);
    trivia.set(i, items.filter((t) => !skip.has(t.ref)));
  }

  // Translate + write in parallel per slot, then check, then pick.
  const results = await Promise.allSettled(
    slots.map(async (slot, i) => {
      const avoid = answers[slot.category.id] ?? [];
      const [translated, written] = await Promise.all([
        translate(slot, trivia.get(i) ?? []),
        generate(slot, Math.ceil(slot.want * 1.5), avoid),
      ]);
      const checked = await verify(slot, [...translated, ...written]);
      return pick(checked, slot.want);
    }),
  );

  const chosen: Candidate[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') chosen.push(...r.value);
    else {
      failed.push(`${slots[i].category.id}:${slots[i].points}`);
      console.error('refill-questions: slot', failed.at(-1), r.reason instanceof Error ? r.reason.message : r.reason);
    }
  });

  const saved: Record<string, unknown> = {};
  for (const source of ['opentdb', 'ai'] as const) {
    const items = chosen
      .filter((c) => c.source === source)
      .map(({ category_id, points, question, answer, source_ref }) => ({ category_id, points, question, answer, source_ref }));
    if (!items.length) continue;
    const { data, error } = await db.rpc('add_questions', { p_items: items, p_source: source });
    if (error) console.error('refill-questions: save', source, error.message);
    saved[source] = error ? { error: 'db_failed' } : data;
  }

  const summary = {
    slots: slots.map((s) => `${s.category.id}:${s.points}x${s.want}`),
    candidates: chosen.length,
    saved,
    failed,
  };
  console.log('refill-questions', JSON.stringify(summary));
  return json(summary);
});
