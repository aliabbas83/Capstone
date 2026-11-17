// Generates every sound in assets/sounds from code, so all audio is original and free to use.
// Run: node scripts/make-sounds.mjs   (re-run after changing anything here)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

// ── helpers ──────────────────────────────────────────────────────────────
let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; // repeatable noise
const buf = (sec) => new Float32Array(Math.ceil(sec * RATE));
const TAU = Math.PI * 2;
const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI number → Hz

/** Add a tone into `out` at time `t0`. wave: sine | tri | saw | square. */
function tone(out, t0, dur, freq, { vol = 0.5, wave = 'sine', attack = 0.005, decay = 6, glide = 0, vibrato = 0, harm = 0 } = {}) {
  const start = Math.floor(t0 * RATE);
  const len = Math.floor(dur * RATE);
  let phase = 0;
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / RATE;
    const f = freq * (1 + glide * (t / dur)) * (1 + vibrato * Math.sin(TAU * 5.5 * t));
    phase += f / RATE;
    const p = phase % 1;
    let s;
    if (wave === 'sine') s = Math.sin(TAU * p) + harm * Math.sin(TAU * p * 2) + harm * 0.4 * Math.sin(TAU * p * 3);
    else if (wave === 'tri') s = 1 - 4 * Math.abs(p - 0.5);
    else if (wave === 'saw') s = 2 * p - 1;
    else s = p < 0.5 ? 0.8 : -0.8;
    const env = Math.min(1, t / attack) * Math.exp(-decay * t) * Math.min(1, (dur - t) / 0.01);
    out[start + i] += s * env * vol;
  }
}

/** Filtered noise burst. cutoff (0..1) can sweep from `from` to `to`. */
function noise(out, t0, dur, { vol = 0.4, from = 0.5, to = 0.1, attack = 0.01, decay = 5, shape } = {}) {
  const start = Math.floor(t0 * RATE);
  const len = Math.floor(dur * RATE);
  let lp = 0;
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / RATE;
    const k = from + (to - from) * (t / dur);
    lp += k * (rand() - lp);
    const env = shape ? shape(t / dur) : Math.min(1, t / attack) * Math.exp(-decay * t);
    out[start + i] += lp * env * vol * 2;
  }
}

/** Soft low-pass over a whole buffer (rounds off harsh saw/square tones). */
function smooth(out, k) {
  let lp = 0;
  for (let i = 0; i < out.length; i++) out[i] = lp += k * (out[i] - lp);
  return out;
}

function save(name, data, peak = 0.85) {
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  const gain = max > 0 ? peak / max : 1;
  const bytes = Buffer.alloc(44 + data.length * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + data.length * 2, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); // PCM
  bytes.writeUInt16LE(1, 22); // mono
  bytes.writeUInt32LE(RATE, 24);
  bytes.writeUInt32LE(RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => bytes.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * gain * 32767))), 44 + i * 2));
  writeFileSync(join(OUT, `${name}.wav`), bytes);
  console.log(`${name}.wav  ${(bytes.length / 1024).toFixed(0)} KB`);
}

mkdirSync(OUT, { recursive: true });

// ── sound effects ────────────────────────────────────────────────────────
{ // tap: tiny wooden blip for buttons
  const o = buf(0.06);
  tone(o, 0, 0.06, 880, { vol: 0.6, decay: 70, harm: 0.3 });
  save('tap', o, 0.5);
}
{ // tick: timer tick (last seconds)
  const o = buf(0.05);
  tone(o, 0, 0.05, 1600, { vol: 0.6, decay: 90 });
  save('tick', o, 0.55);
}
{ // whoosh: question card flips in
  const o = buf(0.4);
  noise(o, 0, 0.4, { vol: 0.6, from: 0.05, to: 0.45, shape: (x) => Math.sin(Math.PI * x) ** 2 });
  save('whoosh', o, 0.6);
}
{ // correct: bright two-note bell
  const o = buf(0.7);
  tone(o, 0, 0.35, note(84), { vol: 0.5, decay: 9, harm: 0.25 });
  tone(o, 0.12, 0.55, note(91), { vol: 0.55, decay: 6, harm: 0.25 });
  save('correct', o);
}
{ // wrong: soft falling "bwomp"
  const o = buf(0.6);
  tone(o, 0, 0.25, 311, { vol: 0.5, wave: 'square', decay: 7, glide: -0.1 });
  tone(o, 0.2, 0.4, 233, { vol: 0.5, wave: 'square', decay: 5, glide: -0.15, vibrato: 0.02 });
  save('wrong', smooth(o, 0.12), 0.7);
}
{ // chime: steal chance / comeback unlocked
  const o = buf(0.8);
  [88, 92, 95, 100].forEach((n, i) => tone(o, i * 0.07, 0.6, note(n), { vol: 0.35, decay: 6, harm: 0.2 }));
  save('chime', o, 0.75);
}
{ // splash: boat moves forward
  const o = buf(0.8);
  noise(o, 0, 0.7, { vol: 0.7, from: 0.6, to: 0.05, attack: 0.008, decay: 6 });
  for (let i = 0; i < 6; i++) {
    const t = 0.08 + Math.abs(rand()) * 0.35;
    tone(o, t, 0.08, 900 + Math.abs(rand()) * 700, { vol: 0.25, decay: 30, glide: -0.45 });
  }
  save('splash', o);
}
{ // push: heavy thud + splash when pushing the other boat back
  const o = buf(0.8);
  tone(o, 0, 0.45, 130, { vol: 0.9, decay: 8, glide: -0.55 });
  noise(o, 0.03, 0.6, { vol: 0.5, from: 0.35, to: 0.03, attack: 0.01, decay: 6 });
  save('push', o);
}
{ // horn: ship horn at the finish line
  const o = buf(1.8);
  tone(o, 0, 1.7, 110, { vol: 0.5, wave: 'saw', attack: 0.12, decay: 0.3, vibrato: 0.004 });
  tone(o, 0, 1.7, 165, { vol: 0.35, wave: 'saw', attack: 0.12, decay: 0.3, vibrato: 0.004 });
  save('horn', smooth(o, 0.08));
}
{ // win: fanfare with clapping crowd
  const o = buf(2.6);
  const brass = buf(2.6);
  [[0, 72], [0.15, 76], [0.3, 79]].forEach(([t, n]) => tone(brass, t, 0.18, note(n), { vol: 0.5, wave: 'saw', decay: 3 }));
  [72, 76, 79, 84].forEach((n) => tone(brass, 0.48, 1.4, note(n), { vol: 0.3, wave: 'saw', attack: 0.03, decay: 1.4, vibrato: 0.003 }));
  smooth(brass, 0.15);
  for (let i = 0; i < 160; i++) {
    const t = 0.4 + Math.abs(rand()) * 2.0;
    noise(o, t, 0.03, { vol: 0.12 * (1 - (t - 0.4) / 2.4), from: 0.7, to: 0.4, attack: 0.001, decay: 120 });
  }
  for (let i = 0; i < o.length; i++) o[i] += brass[i];
  save('win', o);
}

// ── music: calm, cheerful sea loop (pentatonic marimba + bass + shaker) ───
{
  const bpm = 100;
  const beat = 60 / bpm;
  const bars = 8;
  const o = buf(bars * 4 * beat);
  const chords = [60, 67, 69, 65, 60, 67, 65, 67]; // C G Am F C G F G (roots)
  const scale = [0, 2, 4, 7, 9, 12, 14, 16];
  const melody = [
    [0, 2, 4, 2], [4, 5, 4, 2], [5, 4, 2, 0], [2, 4, 2, 1],
    [0, 2, 4, 5], [7, 5, 4, 2], [4, 2, 1, 2], [3, 2, 1, -1],
  ];
  seed = 777;
  for (let b = 0; b < bars; b++) {
    const t0 = b * 4 * beat;
    const root = chords[b];
    // bass: root on beats 1 and 3, fifth on beat 4-and
    tone(o, t0, beat * 1.8, note(root - 24), { vol: 0.5, wave: 'tri', decay: 1.5, attack: 0.01 });
    tone(o, t0 + 2 * beat, beat * 1.4, note(root - 24), { vol: 0.45, wave: 'tri', decay: 1.8, attack: 0.01 });
    tone(o, t0 + 3.5 * beat, beat * 0.45, note(root - 17), { vol: 0.35, wave: 'tri', decay: 3, attack: 0.01 });
    // marimba melody (quarter notes, a few eighth-note pickups)
    melody[b].forEach((deg, i) => {
      if (deg < 0) return;
      tone(o, t0 + i * beat, beat * 0.9, note(72 + scale[deg]), { vol: 0.32, decay: 7, harm: 0.15 });
      if (i === 3 && b % 2 === 1) tone(o, t0 + 3.5 * beat, beat * 0.45, note(72 + scale[Math.max(0, deg - 1)]), { vol: 0.22, decay: 9, harm: 0.15 });
    });
    // soft chord pad (sine, low volume)
    [0, 4, 7].forEach((iv) => tone(o, t0, 4 * beat, note(root + iv - 12), { vol: 0.06, attack: 0.3, decay: 0.4 }));
    // shaker on eighths
    for (let e = 0; e < 8; e++) noise(o, t0 + e * beat * 0.5, 0.06, { vol: e % 2 ? 0.05 : 0.08, from: 0.9, to: 0.8, attack: 0.002, decay: 60 });
  }
  save('music', o, 0.7);
}
