/// <reference types="node" />
/**
 * Levels are named by their points (2 / 3 / 4), not "easy / medium / hard",
 * and the race is between swimmers, not boats.
 */
import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { LEVELS, levelLabel, timesLabel } from './levels';

describe('level names', () => {
  it('the three levels are 2, 3 and 4 points, in that order', () => {
    expect(LEVELS.map((l) => l.points)).toEqual([2, 3, 4]);
  });

  it('each level is named by its points', () => {
    expect(levelLabel(2)).toBe('نقطتين');
    expect(levelLabel(3)).toBe('3 نقاط');
    expect(levelLabel(4)).toBe('4 نقاط');
    expect(LEVELS.map((l) => l.label)).toEqual(['نقطتين', '3 نقاط', '4 نقاط']);
  });

  it('says how many times are left in words that cannot be mixed up with the points', () => {
    expect(timesLabel(0)).toBe('خلصت');
    expect(timesLabel(1)).toBe('مرة');
    expect(timesLabel(2)).toBe('مرتين');
    expect(timesLabel(3)).toBe('3 مرات');
    expect(timesLabel(4)).toBe('4 مرات');
  });
});

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

/** Lines in the app's source (not tests) that match `pattern`. */
function linesWith(pattern: RegExp): string[] {
  return sourceFiles(ROOT).flatMap((f) =>
    readFileSync(f, 'utf8')
      .split(/\r?\n/)
      .map((line, i) => ({ where: `${f.slice(ROOT.length + 1)}:${i + 1}`, line }))
      .filter(({ line }) => pattern.test(line))
      .map(({ where }) => where),
  );
}

describe('words on screen', () => {
  it('no text talks about boats or rowing any more (the race is between swimmers)', () => {
    expect(linesWith(/قارب|قوارب|جدّف|تجديف/)).toEqual([]);
  });

  it('no level is called easy / medium / hard (levels are shown as points)', () => {
    // Whole words only: "أصعب" (harder) may still explain that more points means a harder question.
    expect(linesWith(/(^|[^؀-ۿ])(سهل|متوسط|صعب)([^؀-ۿ]|$)/)).toEqual([]);
  });
});

describe('swimmers', () => {
  it('do not carry the team picture (plain head with a cap in the team colour)', () => {
    const art = readFileSync(join(ROOT, 'components', 'race-art.tsx'), 'utf8');
    expect(art).not.toMatch(/MascotBadge|mascotId|photoUri/);
  });
});
