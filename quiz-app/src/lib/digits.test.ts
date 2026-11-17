/// <reference types="node" />
/**
 * The app shows Western digits (0123) everywhere, matching the keyboard and the payment page.
 * Arabic-Indic digits (٠١٢٣) may still be typed by players; validate.ts turns them into 0-9.
 */
import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const ALLOWED = new Set([join(ROOT, 'lib', 'validate.ts')]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('Western digits on screen', () => {
  it('no screen or message text uses Arabic-Indic or Persian digits', () => {
    const offenders = sourceFiles(ROOT)
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split(/\r?\n/)
          .map((line, i) => ({ where: `${f.slice(ROOT.length + 1)}:${i + 1}`, line }))
          .filter(({ line }) => /[٠-٩۰-۹]/.test(line))
          .map(({ where }) => where),
      );
    expect(offenders).toEqual([]);
  });
});
