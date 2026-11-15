import { describe, expect, it } from '@jest/globals';
import {
  chooseMove,
  createRace,
  markCorrect,
  markWrong,
  nextPicker,
  pickCategory,
  RaceState,
  startQuestion,
  undoPick,
} from './engine';

const team = (name: string) => ({ name, mascotId: 'falcon', photoUri: null, categories: [] });
const race = (len = 20) => createRace([team('A'), team('B')], len);
const ask = (s: RaceState, id: string, points: 2 | 3 | 4 | 5 = 3, isComeback = false) =>
  startQuestion(s, { categoryId: 'geo', questionId: id, points, isComeback });

describe('turns and moves', () => {
  it('a correct answer lets the team move forward, then the turn passes', () => {
    let s = ask(race(), 'q1', 4);
    s = markCorrect(s);
    expect(s.phase).toBe('choose');
    s = chooseMove(s, 'forward');
    expect(s.teams[0].position).toBe(4);
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('pick');
  });

  it('pushing back moves the rival boat back but never behind the start', () => {
    let s = race();
    s = { ...s, teams: [s.teams[0], { ...s.teams[1], position: 2 }] };
    s = chooseMove(markCorrect(ask(s, 'q1', 4)), 'push');
    expect(s.teams[1].position).toBe(0);
    expect(s.teams[0].position).toBe(0);
  });

  it('a wrong answer gives the other team one chance to steal', () => {
    let s = markWrong(ask(race(), 'q1', 3));
    expect(s.phase).toBe('steal');
    expect(s.pending?.answering).toBe(1);
    s = chooseMove(markCorrect(s), 'forward');
    expect(s.teams[1].position).toBe(3);
    // Turn still passes from the owner (team 0) to team 1.
    expect(s.turn).toBe(1);
  });

  it('a missed steal ends the turn with no points', () => {
    let s = markWrong(markWrong(ask(race(), 'q1')));
    expect(s.phase).toBe('pick');
    expect(s.turn).toBe(1);
    expect(s.teams[0].position + s.teams[1].position).toBe(0);
  });

  it('reaching the finish wins without needing an exact landing', () => {
    let s = race(20);
    s = { ...s, teams: [{ ...s.teams[0], position: 19 }, s.teams[1]] };
    s = chooseMove(markCorrect(ask(s, 'q1', 4)), 'forward');
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe(0);
    expect(s.teams[0].position).toBe(20);
  });

  it('never accepts the same question twice in a game', () => {
    let s = chooseMove(markCorrect(ask(race(), 'q1')), 'forward');
    const again = ask(s, 'q1');
    expect(again).toBe(s);
  });
});

describe('5-point comeback question', () => {
  it('unlocks for the other team when a rival gets within 4 steps', () => {
    let s = race(20);
    s = { ...s, teams: [{ ...s.teams[0], position: 14 }, s.teams[1]] };
    s = chooseMove(markCorrect(ask(s, 'q1', 2)), 'forward'); // team 0 now at 16 → 4 left
    expect(s.teams[1].comeback).toBe('available');
    expect(s.teams[0].comeback).toBe('locked');
  });

  it('can be used once, and is used up even if answered wrong', () => {
    let s = race(20);
    s = { ...s, turn: 1, teams: [{ ...s.teams[0], position: 17 }, { ...s.teams[1], comeback: 'available' }] };
    s = startQuestion(s, { categoryId: 'geo', questionId: 'c1', points: 5, isComeback: true });
    expect(s.teams[1].comeback).toBe('used');
    s = markWrong(markWrong(s));
    expect(s.teams[1].comeback).toBe('used');
  });

  it('cannot be started while locked', () => {
    const s = race();
    expect(ask(s, 'c1', 5, true)).toBe(s);
  });
});

describe('category picking', () => {
  it('alternates A, B, A, B and blocks duplicates', () => {
    let p: [string[], string[]] = [[], []];
    expect(nextPicker(p, 4)).toBe(0);
    p = pickCategory(p, 'geo', 4);
    expect(nextPicker(p, 4)).toBe(1);
    expect(pickCategory(p, 'geo', 4)).toBe(p);
    p = pickCategory(p, 'tech', 4);
    expect(p).toEqual([['geo'], ['tech']]);
    p = undoPick(p);
    expect(p).toEqual([['geo'], []]);
  });

  it('stops after each team has 4', () => {
    let p: [string[], string[]] = [[], []];
    for (const c of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) p = pickCategory(p, c, 4);
    expect(p[0]).toHaveLength(4);
    expect(p[1]).toHaveLength(4);
    expect(nextPicker(p, 4)).toBeNull();
  });
});
