// Helpers for refill-questions: decide what the bank needs, fetch from Open Trivia DB,
// and ask OpenRouter to translate, write and check questions.
// Secrets (Supabase secrets only): OPENROUTER_API_KEY (required), OPENROUTER_MODEL (optional).
//
// Everything that comes back from Open Trivia DB or the AI is only data. The database
// (public.add_questions) checks every field again before anything is saved.

export type Points = 2 | 3 | 4 | 5;
export type Category = { id: string; name: string };
export type Stock = { category_id: string; points: number; count: number };
export type Slot = { category: Category; points: Points; want: number };
export type Candidate = {
  category_id: string;
  points: Points;
  question: string;
  answer: string;
  source: 'opentdb' | 'ai';
  source_ref?: string;
};

/** How many active questions we aim for per category and points. */
export const TARGETS: Record<Points, number> = { 2: 60, 3: 60, 4: 60, 5: 20 };
export const PER_SLOT = 10;

/** Jawla category -> Open Trivia DB category id. Others are AI-only. */
export const OPENTDB_CATEGORY: Record<string, number> = {
  geo: 22,
  history: 23,
  science: 17,
  sports: 21,
  animals: 27,
  tech: 18,
};
const OPENTDB_DIFFICULTY: Partial<Record<Points, string>> = { 2: 'easy', 3: 'medium', 4: 'hard' };

/** Extra per-category rules: told to the AI, and enforced in code by fitsCategory. */
const CATEGORY_RULE: Record<string, string> = {
  geo: 'Do not ask for the capital city of any country, state or region (the quiz has a separate capitals category).',
};
const CATEGORY_EXCLUDE: Record<string, RegExp> = {
  geo: /\bcapital\b|عاصم[ةه]/i,
};

/** False when a question (English or Arabic) breaks its category's rule, e.g. a capital-city question in geography. */
export function fitsCategory(categoryId: string, question: string): boolean {
  return !CATEGORY_EXCLUDE[categoryId]?.test(question);
}

const ruleFor = (slot: Slot) => (CATEGORY_RULE[slot.category.id] ? `\nCategory rule: ${CATEGORY_RULE[slot.category.id]}` : '');

const LEVEL: Record<Points, string> = {
  2: 'easy: most family members (including children 10+) would know it',
  3: 'medium: a typical adult would know it',
  4: 'hard: needs good general knowledge',
  5: 'very hard but fair: a "comeback" question worth the most points',
};

/**
 * Pick the category/points pairs that are furthest below target, up to `max` new
 * questions in total and PER_SLOT per pair.
 */
export function planSlots(categories: Category[], stock: Stock[], max: number): Slot[] {
  const have = new Map(stock.map((s) => [`${s.category_id}:${s.points}`, s.count]));
  const gaps: Slot[] = [];
  for (const category of categories) {
    for (const points of [2, 3, 4, 5] as Points[]) {
      const gap = TARGETS[points] - (have.get(`${category.id}:${points}`) ?? 0);
      if (gap > 0) gaps.push({ category, points, want: gap });
    }
  }
  // Biggest gap compared with its target first; ties keep category order.
  gaps.sort((a, b) => b.want / TARGETS[b.points] - a.want / TARGETS[a.points]);

  const slots: Slot[] = [];
  let left = Math.max(0, Math.floor(max));
  for (const g of gaps) {
    if (left <= 0) break;
    const want = Math.min(g.want, PER_SLOT, left);
    slots.push({ ...g, want });
    left -= want;
  }
  return slots;
}

export function opentdbFor(slot: Slot): { category: number; difficulty: string } | null {
  const category = OPENTDB_CATEGORY[slot.category.id];
  const difficulty = OPENTDB_DIFFICULTY[slot.points];
  return category && difficulty ? { category, difficulty } : null;
}

export type TriviaItem = { question: string; answer: string; wrong: string[]; ref: string };

/** Turn an Open Trivia DB response (encode=url3986) into plain items. Skips "which of these" questions. */
// deno-lint-ignore no-explicit-any
export async function decodeOpenTdb(data: any): Promise<TriviaItem[]> {
  if (!data || data.response_code !== 0 || !Array.isArray(data.results)) return [];
  const out: TriviaItem[] = [];
  for (const r of data.results) {
    const dec = (s: unknown) => {
      try {
        return decodeURIComponent(String(s ?? '')).trim();
      } catch {
        return '';
      }
    };
    const question = dec(r.question);
    const answer = dec(r.correct_answer);
    if (!question || !answer) continue;
    if (/\b(of the following|of these|which one of|not one of)\b/i.test(question)) continue;
    const wrong = Array.isArray(r.incorrect_answers) ? r.incorrect_answers.map(dec) : [];
    out.push({ question, answer, wrong, ref: `opentdb:${await sha1(question.toLowerCase())}` });
  }
  return out;
}

async function sha1(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Read the first JSON object in a model reply (models sometimes wrap it in ``` fences). */
// deno-lint-ignore no-explicit-any
export function parseJsonObject(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('llm_bad_json');
  return JSON.parse(text.slice(start, end + 1));
}

/** Keep only well-formed {question, answer} pairs from a model reply. */
// deno-lint-ignore no-explicit-any
export function cleanItems(reply: any): { i?: number; question: string; answer: string }[] {
  const items = Array.isArray(reply?.items) ? reply.items : [];
  // deno-lint-ignore no-explicit-any
  return items.flatMap((x: any) => {
    const question = typeof x?.question === 'string' ? x.question.trim() : '';
    const answer = typeof x?.answer === 'string' ? x.answer.trim() : '';
    if (x?.keep === false || question.length < 5 || question.length > 300 || !answer || answer.length > 120) return [];
    return [{ i: Number.isInteger(x?.i) ? x.i : undefined, question, answer }];
  });
}

// ───────── OpenRouter ─────────

const STYLE = `Audience: Arabic-speaking families in Kuwait and the Gulf, playing a team quiz where a host reads the question aloud and the teams answer out loud (no multiple choice).
Language: clear Modern Standard Arabic, short, ending with "؟". Answers are short (a name, number or few words) in Arabic; keep well-known Latin names/acronyms in Latin letters if that is how people say them (e.g. HTML).
Never include: alcohol, pork, gambling, romance, sexual content, violence, horror, religious or sectarian disputes, politics, people's private lives, brand advertising.
Facts must be true, stable over time (no "current"/"latest" or records likely to change soon), and have exactly one clear answer.`;

// deno-lint-ignore no-explicit-any
export async function chatJson(system: string, user: string, temperature: number): Promise<any> {
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('openrouter_not_configured');
  const model = Deno.env.get('OPENROUTER_MODEL') || 'anthropic/claude-sonnet-5.5';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Jawla' },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(100_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error('openrouter', res.status, data?.error?.message ?? '');
    throw new Error('openrouter_failed');
  }
  return parseJsonObject(String(data?.choices?.[0]?.message?.content ?? ''));
}

/** Translate Open Trivia DB items to Arabic, dropping any that don't fit. */
export async function translate(slot: Slot, items: TriviaItem[]): Promise<Candidate[]> {
  if (!items.length) return [];
  const system = `You adapt English trivia questions into Arabic for a family quiz.
${STYLE}${ruleFor(slot)}
Drop (keep:false) any question that only works with the answer options shown, is about Western pop culture few Gulf families would know, breaks the rules above, or whose answer you are not sure is correct.
Reply with JSON only: {"items":[{"i":<index>,"keep":true|false,"question":"<Arabic>","answer":"<Arabic>"}]}`;
  const user = `Category: ${slot.category.name} (${slot.category.id}). Difficulty: ${LEVEL[slot.points]}.
${JSON.stringify(items.map((t, i) => ({ i, question: t.question, answer: t.answer, wrong_options: t.wrong })))}`;
  const reply = await chatJson(system, user, 0);
  return cleanItems(reply).flatMap((x) => {
    const src = x.i !== undefined ? items[x.i] : undefined;
    if (!src) return [];
    return [{ category_id: slot.category.id, points: slot.points, question: x.question, answer: x.answer, source: 'opentdb' as const, source_ref: src.ref }];
  });
}

/** Ask the AI to write new Arabic questions that avoid answers already in the bank. */
export async function generate(slot: Slot, count: number, avoid: string[]): Promise<Candidate[]> {
  if (count <= 0) return [];
  const system = `You write original quiz questions in Arabic for a family team quiz.
${STYLE}${ruleFor(slot)}
Each question must have a different answer, and none of the answers may be in the "avoid" list (not even spelled differently). Mix topics inside the category.
Reply with JSON only: {"items":[{"question":"<Arabic>","answer":"<Arabic>"}]}`;
  const user = `Category: ${slot.category.name} (${slot.category.id}). Difficulty: ${LEVEL[slot.points]}.
Write ${count} questions.
Avoid these answers: ${JSON.stringify(avoid.slice(0, 400))}`;
  const reply = await chatJson(system, user, 0.8);
  return cleanItems(reply).map((x) => ({ category_id: slot.category.id, points: slot.points, question: x.question, answer: x.answer, source: 'ai' as const }));
}

/** Second, stricter pass: keep only questions the checker is sure about. */
export async function verify(slot: Slot, cands: Candidate[]): Promise<Candidate[]> {
  if (!cands.length) return [];
  const system = `You are a strict fact-checker for an Arabic family quiz.
${STYLE}${ruleFor(slot)}
For each item decide ok:true only if ALL hold: the answer is correct and the only reasonable answer; the question is clear without options; the Arabic is correct; it fits the category and the difficulty; it follows every rule above. If in any doubt, ok:false.
Reply with JSON only: {"items":[{"i":<index>,"ok":true|false}]}`;
  const user = `Category: ${slot.category.name} (${slot.category.id}). Difficulty: ${LEVEL[slot.points]}.
${JSON.stringify(cands.map((c, i) => ({ i, question: c.question, answer: c.answer })))}`;
  const reply = await chatJson(system, user, 0);
  const ok = new Set<number>(
    // deno-lint-ignore no-explicit-any
    (Array.isArray(reply?.items) ? reply.items : []).filter((x: any) => x?.ok === true && Number.isInteger(x?.i)).map((x: any) => x.i),
  );
  return cands.filter((_, i) => ok.has(i));
}

/** Up to `want` checked questions for the slot, Open Trivia DB ones first, no repeated answer inside the batch, category rules applied. */
export function pick(cands: Candidate[], want: number): Candidate[] {
  const seen = new Set<string>();
  const sorted = cands.filter((c) => fitsCategory(c.category_id, c.question)).sort((a, b) => (a.source === b.source ? 0 : a.source === 'opentdb' ? -1 : 1));
  const out: Candidate[] = [];
  for (const c of sorted) {
    const k = c.answer.replace(/[ً-ْـ«»"'.,،؛:!?؟()\s]/g, '').replace(/^ال/, '').toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= want) break;
  }
  return out;
}

// ───────── Open Trivia DB (1 request per 5 seconds per IP) ─────────

const OTDB = 'https://opentdb.com';
export const OTDB_GAP_MS = 5200;

export async function openTdbToken(): Promise<string | null> {
  try {
    const res = await fetch(`${OTDB}/api_token.php?command=request`, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();
    return data?.response_code === 0 && typeof data.token === 'string' ? data.token : null;
  } catch {
    return null;
  }
}

export async function fetchOpenTdb(category: number, difficulty: string, amount: number, token: string | null): Promise<TriviaItem[]> {
  const q = new URLSearchParams({
    amount: String(Math.min(50, Math.max(1, amount))),
    category: String(category),
    difficulty,
    type: 'multiple',
    encode: 'url3986',
  });
  if (token) q.set('token', token);
  try {
    const res = await fetch(`${OTDB}/api.php?${q}`, { signal: AbortSignal.timeout(10_000) });
    return await decodeOpenTdb(await res.json());
  } catch (e) {
    console.error('opentdb', e instanceof Error ? e.message : e);
    return [];
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
