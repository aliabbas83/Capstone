// Adds picture questions to the bank (M10):
//   kind "flags": "لمن هذا العلم؟" + the flag (flagcdn.com, public domain) -> category flags
//   kind "maps":  "ما اسم هذه الدولة…؟" + the country outline (world-atlas / Natural Earth,
//                 public domain) -> category geo
// Each picture is uploaded to the public bucket question-images under a random name,
// then saved through public.add_questions (which checks everything again).
// Safe to run again: countries already added (source_ref flag:XX / map:XX) are skipped.
//
// Not reachable by app users: the caller must send the Vault token `refill_token`
// in the x-refill-token header (same as refill-questions).
import { createClient } from 'npm:@supabase/supabase-js@2';
import isoCountries from 'npm:i18n-iso-countries@7.14.0';
import { feature } from 'npm:topojson-client@3.1.0';
import { COUNTRIES, type Country } from '../_shared/countries.ts';
import { FLAG_QUESTION, MAP_QUESTION, namesMatch, pictureName, renderMapSvg } from '../_shared/pictures.ts';

const BUCKET = 'question-images';
const FLAGS = 'https://flagcdn.com';
const ATLAS = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type Item = { category_id: string; points: number; question: string; answer: string; source_ref: string; image_path: string };
type Made = { item: Item } | { skip: string };

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const db = admin();
  const token = req.headers.get('x-refill-token') ?? '';
  if (!token || token.length > 200) return json({ error: 'unauthorized' }, 401);
  const { data: allowed } = await db.rpc('check_refill_token', { p_token: token });
  if (allowed !== true) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind === 'maps' ? 'maps' : body?.kind === 'flags' ? 'flags' : null;
  if (!kind) return json({ error: 'kind must be flags or maps' }, 400);
  const limit = Math.min(100, Math.max(1, Number(body?.limit) || 40));

  const refOf = (c: Country) => `${kind === 'flags' ? 'flag' : 'map'}:${c.iso2}`;
  const { data: known, error: knownErr } = await db.rpc('known_refs', { p_refs: COUNTRIES.map(refOf) });
  if (knownErr) return json({ error: 'db_failed' }, 500);
  const done = new Set<string>((known as string[] | null) ?? []);
  const todo = COUNTRIES.filter((c) => !done.has(refOf(c))).slice(0, limit);
  if (!todo.length) return json({ kind, added: 0, note: 'all done' });

  // English names from flagcdn, to check that the map piece really is that country.
  let names: Record<string, string> = {};
  // deno-lint-ignore no-explicit-any
  let topo: any = null;
  // deno-lint-ignore no-explicit-any
  const byId = new Map<number, any[]>();
  try {
    names = await getJson(`${FLAGS}/en/codes.json`);
    if (kind === 'maps') {
      topo = await getJson(ATLAS);
      for (const g of topo.objects.countries.geometries) {
        if (g.id == null) continue;
        const id = Number(g.id);
        byId.set(id, [...(byId.get(id) ?? []), g]);
      }
    }
  } catch (e) {
    console.error('seed-pictures: source', e instanceof Error ? e.message : e);
    return json({ error: 'source_failed' }, 502);
  }

  const make = async (c: Country): Promise<Made> => {
    const en = names[c.iso2.toLowerCase()];
    if (!en) return { skip: `${c.iso2}:no_name` };
    let bytes: Uint8Array, ext: 'png' | 'svg', type: string;
    if (kind === 'flags') {
      const res = await fetch(`${FLAGS}/w320/${c.iso2.toLowerCase()}.png`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/png')) return { skip: `${c.iso2}:flag_fetch` };
      bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > 512 * 1024) return { skip: `${c.iso2}:flag_too_big` };
      ext = 'png';
      type = 'image/png';
    } else {
      const num = Number(isoCountries.alpha2ToNumeric(c.iso2));
      const g = (byId.get(num) ?? []).find((x) => namesMatch(String(x.properties?.name ?? ''), en));
      if (!g) return { skip: `${c.iso2}:no_map` };
      // deno-lint-ignore no-explicit-any
      const svg = renderMapSvg((feature(topo, g) as any).geometry);
      if (!svg) return { skip: `${c.iso2}:too_small` };
      bytes = new TextEncoder().encode(svg);
      ext = 'svg';
      type = 'image/svg+xml';
    }
    const name = pictureName(ext);
    const { error } = await db.storage.from(BUCKET).upload(name, bytes, { contentType: type, upsert: false });
    if (error) {
      console.error('seed-pictures: upload', c.iso2, error.message);
      return { skip: `${c.iso2}:upload` };
    }
    return {
      item: {
        category_id: kind === 'flags' ? 'flags' : 'geo',
        points: c.points,
        question: kind === 'flags' ? FLAG_QUESTION : MAP_QUESTION,
        answer: c.ar,
        source_ref: refOf(c),
        image_path: name,
      },
    };
  };

  // A few at a time, to be gentle with the picture sources.
  const made: Made[] = [];
  for (let i = 0; i < todo.length; i += 6) {
    made.push(...(await Promise.all(todo.slice(i, i + 6).map((c) => make(c).catch(() => ({ skip: `${c.iso2}:error` }))))));
  }
  const items = made.flatMap((m) => ('item' in m ? [m.item] : []));
  const skipped = made.flatMap((m) => ('skip' in m ? [m.skip] : []));

  let saved: unknown = { added: 0 };
  if (items.length) {
    const { data, error } = await db.rpc('add_questions', { p_items: items, p_source: 'picture' });
    if (error) {
      console.error('seed-pictures: save', error.message);
      saved = { error: 'db_failed' };
    } else saved = data;
    // Remove pictures whose question was not saved, so nothing is left lying around.
    const { data: kept } = await db.rpc('known_refs', { p_refs: items.map((x) => x.source_ref) });
    const keptSet = new Set<string>((kept as string[] | null) ?? []);
    const orphans = items.filter((x) => !keptSet.has(x.source_ref)).map((x) => x.image_path);
    if (orphans.length) await db.storage.from(BUCKET).remove(orphans);
  }

  const summary = { kind, tried: todo.length, saved, skipped, left: COUNTRIES.length - done.size - todo.length };
  console.log('seed-pictures', JSON.stringify(summary));
  return json(summary);
});
