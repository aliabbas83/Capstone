// Helpers for seed-pictures: draw a country outline as SVG, and check that two
// country names (from two data sources) are about the same country.
// Data: flags from flagcdn.com (public domain), outlines from world-atlas
// (Natural Earth, public domain). Nothing here reads secrets.

type Ring = [number, number][];
type Geometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };

export const MAP_QUESTION = 'ما اسم هذه الدولة من شكلها على الخريطة؟';
export const FLAG_QUESTION = 'لمن هذا العلم؟';

const SIZE = 400; // longest side of the picture, in px
const PAD = 16;
const MIN_DEGREES = 0.8; // smaller countries are too small to recognise by outline

/** Area (signed) and centre of a ring in plain lon/lat units. */
function ringStats(r: Ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f;
    cx += (r[j][0] + r[i][0]) * f;
    cy += (r[j][1] + r[i][1]) * f;
  }
  a /= 2;
  if (a === 0) return { area: 0, x: r[0]?.[0] ?? 0, y: r[0]?.[1] ?? 0 };
  return { area: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) };
}

/**
 * Draw the outline of a country. Returns null when it is too small to recognise.
 * Far-away pieces (e.g. French Guiana for France) and specks of islands are left out.
 */
export function renderMapSvg(geometry: Geometry, fill = '#2EA8FF', stroke = '#0B5C8C'): string | null {
  let polys: Ring[][] = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!polys.length) return null;

  // Countries across the 180° line (Russia, Fiji): use 0..360 longitudes.
  const lons = polys.flat(2).map((p) => p[0]);
  if (Math.min(...lons) < -150 && Math.max(...lons) > 150) {
    polys = polys.map((p) => p.map((r) => r.map(([x, y]) => [x < 0 ? x + 360 : x, y] as [number, number])));
  }

  const stats = polys.map((p) => ringStats(p[0]));
  const main = stats.reduce((best, s, i) => (s.area > stats[best].area ? i : best), 0);
  const m = polys[main][0];
  const mSize = Math.max(
    Math.max(...m.map((p) => p[0])) - Math.min(...m.map((p) => p[0])),
    Math.max(...m.map((p) => p[1])) - Math.min(...m.map((p) => p[1])),
  );
  const reach = Math.max(3 * mSize, 15);
  polys = polys.filter((_, i) => {
    const s = stats[i];
    if (i === main) return true;
    const far = Math.hypot(s.x - stats[main].x, s.y - stats[main].y) > reach;
    return !far && s.area >= stats[main].area * 0.002;
  });

  const pts = polys.flat(2);
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  if (Math.max(maxX - minX, maxY - minY) < MIN_DEGREES) return null;

  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180); // squeeze longitudes away from the equator
  const w = (maxX - minX) * k, h = maxY - minY;
  const scale = (SIZE - 2 * PAD) / Math.max(w, h);
  const vw = Math.round(w * scale + 2 * PAD), vh = Math.round(h * scale + 2 * PAD);
  const px = (x: number) => +(PAD + (x - minX) * k * scale).toFixed(1);
  const py = (y: number) => +(PAD + (maxY - y) * scale).toFixed(1);

  let d = '';
  for (const poly of polys) {
    for (const ring of poly) {
      let last: [number, number] | null = null;
      let part = '';
      for (const [x, y] of ring) {
        const p: [number, number] = [px(x), py(y)];
        if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.6) continue;
        part += `${part ? 'L' : 'M'}${p[0]} ${p[1]}`;
        last = p;
      }
      if (part.split('L').length >= 3) d += part + 'Z';
    }
  }
  if (!d) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">` +
    `<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

const STOP = new Set(['republic', 'rep', 'democratic', 'dem', 'the', 'and', 'of', 'islands', 'is', 'saint', 'st', 'north', 'south', 'n', 's']);
const words = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w));

/** True when two English country names share a meaningful word ("Dem. Rep. Congo" ~ "DR Congo"). */
export function namesMatch(a: string, b: string): boolean {
  const wa = new Set(words(a));
  return words(b).some((w) => wa.has(w) || [...wa].some((x) => x.length >= 5 && (x.startsWith(w) || w.startsWith(x))));
}

/** Random file name for a picture: it must never hint at the answer. */
export function pictureName(ext: 'png' | 'svg'): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('') + '.' + ext;
}
