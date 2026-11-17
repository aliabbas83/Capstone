// Tests for the picture helpers. Run: deno test supabase/functions/_shared/pictures.test.ts
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { COUNTRIES } from './countries.ts';
import { namesMatch, pictureName, renderMapSvg } from './pictures.ts';

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

Deno.test('renderMapSvg: draws a country, no text inside', () => {
  const svg = renderMapSvg({ type: 'Polygon', coordinates: [square(10, 20, 5)] });
  assert(svg);
  assertMatch(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
  assert(!/<text/i.test(svg));
});

Deno.test('renderMapSvg: too small to recognise -> null', () => {
  assertEquals(renderMapSvg({ type: 'Polygon', coordinates: [square(50, 26, 0.3)] }), null);
});

Deno.test('renderMapSvg: far-away territory is left out, near island kept', () => {
  const main = square(0, 45, 8);
  const near = square(9, 41, 1); // like Corsica
  const far = square(-53, 3, 3); // like French Guiana
  const both = renderMapSvg({ type: 'MultiPolygon', coordinates: [[main], [near]] })!;
  const withFar = renderMapSvg({ type: 'MultiPolygon', coordinates: [[main], [near], [far]] })!;
  assertEquals(withFar, both);
  assert((both.match(/M/g) ?? []).length === 2);
});

Deno.test('renderMapSvg: country across the 180° line stays in one piece', () => {
  const svg = renderMapSvg({ type: 'MultiPolygon', coordinates: [[square(170, 60, 9)], [square(-180, 60, 10)]] })!;
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
  assert(Number(vb[1]) <= 400 && Number(vb[2]) <= 400);
  // 20° of longitude at 64°N is about as wide as 10° of latitude is tall; split across the world it would be ~15x wider.
  assert(Number(vb[1]) < 2 * Number(vb[2]), 'not stretched across the world');
});

Deno.test('namesMatch: same country in two spellings, different countries do not', () => {
  assert(namesMatch('Dem. Rep. Congo', 'DR Congo'));
  assert(namesMatch('United States of America', 'United States'));
  assert(namesMatch('Bosnia and Herz.', 'Bosnia and Herzegovina'));
  assert(namesMatch("Côte d'Ivoire", "Cote d'Ivoire (Ivory Coast)"));
  assert(namesMatch('eSwatini', 'Eswatini'));
  assert(!namesMatch('Kuwait', 'Qatar'));
  assert(!namesMatch('Austria', 'Australia'));
});

Deno.test('pictureName: random, never the country', () => {
  const a = pictureName('png'), b = pictureName('svg');
  assertMatch(a, /^[0-9a-f]{32}\.png$/);
  assertMatch(b, /^[0-9a-f]{32}\.svg$/);
  assert(a.slice(0, 32) !== b.slice(0, 32));
});

Deno.test('COUNTRIES: unique codes and answers, valid points', () => {
  assertEquals(new Set(COUNTRIES.map((c) => c.iso2)).size, COUNTRIES.length);
  assertEquals(new Set(COUNTRIES.map((c) => c.ar)).size, COUNTRIES.length);
  assert(COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c.iso2) && [2, 3, 4, 5].includes(c.points) && c.ar.length >= 2));
  assert(COUNTRIES.length >= 190);
});
