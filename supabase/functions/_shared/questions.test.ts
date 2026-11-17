// Tests for the question-refill helpers. No real network: fetch is replaced with fakes.
// Run: deno test --allow-env supabase/functions/_shared/questions.test.ts
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  type Candidate,
  chatJson,
  cleanItems,
  decodeOpenTdb,
  fitsCategory,
  generate,
  opentdbFor,
  opentdbKeep,
  parseJsonObject,
  PER_SLOT,
  pick,
  planSlots,
  type Slot,
  TARGETS,
  verify,
} from './questions.ts';

const cats = [
  { id: 'geo', name: 'جغرافيا' },
  { id: 'food', name: 'أكل' },
];

function fakeFetch(reply: (body: unknown) => unknown, status = 200) {
  const real = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    bodies.push(body);
    return Promise.resolve(new Response(JSON.stringify(reply(body)), { status }));
  }) as typeof fetch;
  return { bodies, restore: () => (globalThis.fetch = real) };
}
const llm = (content: unknown) => () => ({ choices: [{ message: { content: JSON.stringify(content) } }] });

Deno.test('planSlots: biggest gaps first, capped per slot and per run', () => {
  const stock = [
    { category_id: 'geo', points: 2, count: TARGETS[2] }, // full
    { category_id: 'geo', points: 3, count: 55 }, // gap 5
    { category_id: 'food', points: 2, count: 10 }, // gap 50
  ];
  const slots = planSlots(cats, stock, 25);
  assertEquals(slots.reduce((n, s) => n + s.want, 0), 25);
  assert(slots.every((s) => s.want <= PER_SLOT));
  assert(!slots.some((s) => s.category.id === 'geo' && s.points === 2), 'full pair is skipped');
  assertEquals(slots[0].category.id, 'geo'); // geo:4 and geo:5 are empty (biggest relative gap)
});

Deno.test('planSlots: nothing to do when the bank is full', () => {
  const stock = cats.flatMap((c) => ([2, 3, 4, 5] as const).map((p) => ({ category_id: c.id, points: p, count: TARGETS[p] })));
  assertEquals(planSlots(cats, stock, 60), []);
  assertEquals(planSlots(cats, [], 0), []);
});

Deno.test('opentdbFor: only mapped categories and points 2-4', () => {
  const s = (id: string, points: 2 | 3 | 4 | 5): Slot => ({ category: { id, name: id }, points, want: 1 });
  assertEquals(opentdbFor(s('geo', 2)), { category: 22, difficulty: 'easy' });
  assertEquals(opentdbFor(s('tech', 4)), { category: 18, difficulty: 'hard' });
  assertEquals(opentdbFor(s('geo', 5)), null);
  assertEquals(opentdbFor(s('food', 2)), null);
});

Deno.test('decodeOpenTdb: decodes, skips "which of these", stable refs', async () => {
  const enc = encodeURIComponent;
  const data = {
    response_code: 0,
    results: [
      { question: enc('What is the capital of Peru?'), correct_answer: enc('Lima'), incorrect_answers: [enc('Quito')] },
      { question: enc('Which of these is a fish?'), correct_answer: enc('Tuna'), incorrect_answers: [] },
      { question: '%E0%A4%A', correct_answer: 'x', incorrect_answers: [] }, // broken encoding
    ],
  };
  const items = await decodeOpenTdb(data);
  assertEquals(items.length, 1);
  assertEquals(items[0].answer, 'Lima');
  assertEquals(items[0].wrong, ['Quito']);
  assert(items[0].ref.startsWith('opentdb:') && items[0].ref.length === 'opentdb:'.length + 40);
  assertEquals((await decodeOpenTdb(data))[0].ref, items[0].ref);
  assertEquals(await decodeOpenTdb({ response_code: 5 }), []);
});

Deno.test('parseJsonObject / cleanItems: tolerate fences, drop bad items', () => {
  const reply = parseJsonObject('```json\n{"items":[{"question":"ما عاصمة بيرو؟","answer":"ليما"},{"question":"x","answer":"y"},{"keep":false,"question":"سؤال طويل؟","answer":"ج"},{"question":"سؤال بلا جواب؟"}]}\n```');
  assertEquals(cleanItems(reply), [{ i: undefined, question: 'ما عاصمة بيرو؟', answer: 'ليما' }]);
  assertEquals(cleanItems(null), []);
});

Deno.test('pick: Open Trivia DB first, no repeated answer, at most want', () => {
  const c = (answer: string, source: 'opentdb' | 'ai'): Candidate => ({ category_id: 'geo', points: 2, question: `سؤال ${answer}؟`, answer, source });
  const out = pick([c('ليما', 'ai'), c('الأسد', 'ai'), c('ليما', 'opentdb'), c('أسد', 'ai'), c('كندا', 'ai')], 3);
  assertEquals(out.map((x) => `${x.answer}/${x.source}`), ['ليما/opentdb', 'الأسد/ai', 'كندا/ai']);
});

Deno.test('fitsCategory / pick: no capital-city questions in geography (capitals has its own category)', () => {
  assertEquals(fitsCategory('geo', 'What is the capital of Laos?'), false);
  assertEquals(fitsCategory('geo', 'ما عاصمة قبرص؟'), false);
  assertEquals(fitsCategory('geo', 'ما عاصمه قبرص؟'), false);
  assertEquals(fitsCategory('geo', 'ما أكبر جزيرة في كندا؟'), true);
  assertEquals(fitsCategory('capitals', 'ما عاصمة قبرص؟'), true);
  const c = (category_id: string, question: string, answer: string): Candidate => ({ category_id, points: 3, question, answer, source: 'ai' });
  const out = pick([c('geo', 'ما عاصمة لاوس؟', 'فينتيان'), c('geo', 'ما أكبر جزيرة في كندا؟', 'بافن'), c('capitals', 'ما عاصمة قبرص؟', 'نيقوسيا')], 5);
  assertEquals(out.map((x) => x.answer), ['بافن', 'نيقوسيا']);
});

Deno.test('planSlots skips picture-only categories (flags come from seed-pictures)', () => {
  const slots = planSlots([{ id: 'flags', name: 'أعلام' }, ...cats], [], 100);
  assert(slots.length > 0);
  assert(!slots.some((s) => s.category.id === 'flags'));
});

Deno.test('opentdbFor / opentdbKeep: new categories and football-only filter', () => {
  const s = (id: string, points: 2 | 3 | 4 | 5): Slot => ({ category: { id, name: id }, points, want: 1 });
  assertEquals(opentdbFor(s('general', 2)), { category: 9, difficulty: 'easy' });
  assertEquals(opentdbFor(s('cars', 3)), { category: 28, difficulty: 'medium' });
  assertEquals(opentdbFor(s('football', 4)), { category: 21, difficulty: 'hard' });
  assertEquals(opentdbFor(s('kuwait', 2)), null);
  assertEquals(opentdbKeep('football', 'Which country won the 2014 FIFA World Cup?'), true);
  assertEquals(opentdbKeep('football', 'Who has won the most Grand Slam titles in tennis?'), false);
  assertEquals(opentdbKeep('football', 'Which team won Super Bowl LI in the NFL?'), false);
  assertEquals(opentdbKeep('geo', 'What is the capital of Peru?'), false);
  assertEquals(opentdbKeep('history', 'Who was the first Caliph?'), true);
});

Deno.test('generate tells the AI the category rule', async () => {
  Deno.env.set('OPENROUTER_API_KEY', 'test-key-not-real');
  const f = fakeFetch(llm({ items: [] }));
  try {
    await generate({ category: cats[0], points: 5, want: 1 }, 2, []);
    // deno-lint-ignore no-explicit-any
    assert((f.bodies[0] as any).messages[0].content.includes('capital'));
  } finally {
    f.restore();
  }
});

Deno.test('chatJson: needs the key; errors are generic', async () => {
  Deno.env.delete('OPENROUTER_API_KEY');
  await assertRejects(() => chatJson('s', 'u', 0), Error, 'openrouter_not_configured');
  Deno.env.set('OPENROUTER_API_KEY', 'test-key-not-real');
  const f = fakeFetch(() => ({ error: { message: 'nope' } }), 401);
  try {
    await assertRejects(() => chatJson('s', 'u', 0), Error, 'openrouter_failed');
  } finally {
    f.restore();
  }
});

Deno.test('chatJson: waits and tries once more when OpenRouter says "too many requests"', async () => {
  Deno.env.set('OPENROUTER_API_KEY', 'test-key-not-real');
  const real = globalThis.fetch;
  const replies = [
    new Response('{"error":{"message":"rate"}}', { status: 429, headers: { 'Retry-After': '0' } }),
    new Response(JSON.stringify({ choices: [{ message: { content: '{"items":[]}' } }] })),
  ];
  let calls = 0;
  globalThis.fetch = (() => Promise.resolve(replies[calls++])) as typeof fetch;
  try {
    assertEquals(await chatJson('s', 'u', 0), { items: [] });
    assertEquals(calls, 2);
  } finally {
    globalThis.fetch = real;
  }

  calls = 0;
  globalThis.fetch = (() => {
    calls++;
    return Promise.resolve(new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }));
  }) as typeof fetch;
  try {
    await assertRejects(() => chatJson('s', 'u', 0), Error, 'openrouter_failed');
    assertEquals(calls, 2, 'only one retry');
  } finally {
    globalThis.fetch = real;
  }
});

Deno.test('generate sends avoid list and model; verify keeps only ok items', async () => {
  Deno.env.set('OPENROUTER_API_KEY', 'test-key-not-real');
  Deno.env.set('OPENROUTER_MODEL', 'test/model');
  const slot: Slot = { category: cats[1], points: 3, want: 2 };
  let f = fakeFetch(llm({ items: [{ question: 'ما أصل الكبسة؟', answer: 'الخليج' }] }));
  try {
    const out = await generate(slot, 3, ['التمر']);
    assertEquals(out, [{ category_id: 'food', points: 3, question: 'ما أصل الكبسة؟', answer: 'الخليج', source: 'ai' }]);
    // deno-lint-ignore no-explicit-any
    const body = f.bodies[0] as any;
    assertEquals(body.model, 'test/model');
    assert(body.messages[1].content.includes('التمر'));
  } finally {
    f.restore();
  }

  const cands: Candidate[] = [
    { category_id: 'food', points: 3, question: 'سؤال أول؟', answer: 'أ', source: 'ai' },
    { category_id: 'food', points: 3, question: 'سؤال ثان؟', answer: 'ب', source: 'ai' },
  ];
  f = fakeFetch(llm({ items: [{ i: 0, ok: false }, { i: 1, ok: true }, { i: 7, ok: true }] }));
  try {
    assertEquals(await verify(slot, cands), [cands[1]]);
  } finally {
    f.restore();
  }
});
