/**
 * Lifelines (docs/PRD.md "Game rules"): each team has three, and can use each one once per game.
 *   two  – pick from two answers (the right one and a wrong one)
 *   time – 30 more seconds
 *   swap – change the question for another one with the same category and points
 */
import { describe, expect, it } from '@jest/globals';
import {
  chooseMove,
  createRace,
  EXTRA_SECONDS,
  hasLifeline,
  levelsLeft,
  LIFELINES,
  markCorrect,
  markWrong,
  playLifeline,
  Points,
  RaceState,
  startQuestion,
  swapQuestion,
  TeamIdx,
} from './engine';
import { DEMO_LANE_LENGTH, DEMO_QUESTIONS } from './demo-questions';
import { canUndo, gameReducer, initialGameState, StoreState } from './game-reducer';
import { LIFELINE_LABELS, twoChoices } from './lifelines';

const team = (name: string) => ({ name, mascotId: 'falcon', photoUri: null, categories: [] });
const race = () => createRace([team('A'), team('B')], 20);
let qid = 0;
const ask = (s: RaceState, points: Points = 3) => startQuestion(s, { categoryId: 'geo', questionId: `L${++qid}`, points });
const left = (s: RaceState, t: TeamIdx) => LIFELINES.filter((k) => hasLifeline(s.teams[t], k));

describe('lifelines: who has what', () => {
  it('there are three lifelines and each team starts with all of them', () => {
    expect([...LIFELINES]).toEqual(['two', 'time', 'swap']);
    expect(EXTRA_SECONDS).toBe(30);
    expect(left(race(), 0)).toEqual(['two', 'time', 'swap']);
    expect(left(race(), 1)).toEqual(['two', 'time', 'swap']);
  });

  it('using one takes it from the answering team only, for the rest of the game', () => {
    let s = playLifeline(ask(race()), 'two');
    expect(left(s, 0)).toEqual(['time', 'swap']);
    expect(left(s, 1)).toEqual(['two', 'time', 'swap']);
    // Two turns later team A cannot use it again.
    s = chooseMove(markCorrect(s), 'forward');
    s = markWrong(markWrong(ask(s)));
    const again = ask(s);
    expect(again.turn).toBe(0);
    expect(playLifeline(again, 'two')).toBe(again);
  });

  it('when stealing, it is the stealing team that uses its own lifeline', () => {
    const steal = markWrong(ask(race()));
    expect(steal.phase).toBe('steal');
    const s = playLifeline(steal, 'time');
    expect(left(s, 0)).toEqual(['two', 'time', 'swap']);
    expect(left(s, 1)).toEqual(['two', 'swap']);
  });

  it('a lifeline can only be used while a question is open', () => {
    const picking = race();
    expect(playLifeline(picking, 'time')).toBe(picking);
    const choosing = markCorrect(ask(race()));
    expect(playLifeline(choosing, 'two')).toBe(choosing);
    expect(swapQuestion(choosing, 'other')).toBe(choosing);
  });
});

describe('pick from two answers', () => {
  it('marks the question as a two-answer question', () => {
    const s = playLifeline(ask(race()), 'two');
    expect(s.pending?.twoAnswers).toBe(true);
    expect(s.phase).toBe('question');
  });

  it('a wrong pick ends the turn with no steal (the other answer would give it away)', () => {
    const s = markWrong(playLifeline(ask(race()), 'two'));
    expect(s.phase).toBe('pick');
    expect(s.turn).toBe(1);
    expect(s.pending).toBeNull();
    // The other team did not get a steal, so none of its picks were used.
    expect(levelsLeft(s.teams[1], 3)).toBe(4);
  });

  it('a right pick scores as usual', () => {
    const s = chooseMove(markCorrect(playLifeline(ask(race(), 4), 'two')), 'forward');
    expect(s.teams[0].position).toBe(4);
  });
});

describe('extra time', () => {
  it('adds 30 seconds to this question only', () => {
    const s = playLifeline(ask(race()), 'time');
    expect(s.pending?.extraSeconds).toBe(30);
    const next = ask(chooseMove(markCorrect(s), 'forward'));
    expect(next.pending?.extraSeconds).toBe(0);
  });
});

describe('change the question', () => {
  it('swaps in a new question with the same category, points and answering team', () => {
    const open = ask(race(), 4);
    const s = swapQuestion(open, 'fresh');
    expect(s.pending?.questionId).toBe('fresh');
    expect(s.pending?.points).toBe(4);
    expect(s.pending?.categoryId).toBe('geo');
    expect(s.pending?.answering).toBe(0);
    expect(s.phase).toBe('question');
    expect(s.usedQuestionIds).toContain('fresh');
    expect(left(s, 0)).toEqual(['two', 'time']);
  });

  it('does not use another pick of that level', () => {
    const open = ask(race(), 4);
    expect(levelsLeft(open.teams[0], 4)).toBe(3);
    expect(levelsLeft(swapQuestion(open, 'fresh').teams[0], 4)).toBe(3);
  });

  it('refuses a question that was already asked, and a second swap by the same team', () => {
    const open = ask(race());
    expect(swapQuestion(open, open.pending!.questionId)).toBe(open);
    const once = swapQuestion(open, 'fresh');
    expect(swapQuestion(once, 'fresh-2')).toBe(once);
  });

  it('the new question starts clean: no two answers and no extra time carried over', () => {
    const s = swapQuestion(playLifeline(playLifeline(ask(race()), 'two'), 'time'), 'fresh');
    expect(s.pending?.twoAnswers).toBe(false);
    expect(s.pending?.extraSeconds).toBe(0);
  });
});

describe('lifelines in the store', () => {
  const q = (points: 2 | 3 | 4, n = 0) => DEMO_QUESTIONS.filter((x) => x.points === points)[n];
  const open = (): StoreState => {
    let s = gameReducer(initialGameState, { type: 'begin', mode: 'demo' });
    for (const c of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) s = gameReducer(s, { type: 'pick', categoryId: c });
    s = gameReducer(s, { type: 'startRace', gameId: null, laneLength: DEMO_LANE_LENGTH });
    return gameReducer(s, { type: 'ask', question: q(3), isComeback: false });
  };

  it('using a lifeline is not something "undo" takes back', () => {
    const wrongThenUndo = gameReducer(gameReducer(open(), { type: 'wrong' }), { type: 'undo' });
    expect(wrongThenUndo.reopened).toBe(true);
    const s = gameReducer(wrongThenUndo, { type: 'lifeline', kind: 'time' });
    expect(s.race?.pending?.extraSeconds).toBe(30);
    expect(canUndo(s)).toBe(false);
  });

  it('changing the question puts the new question on the card', () => {
    const s = gameReducer(open(), { type: 'swap', question: q(3, 1) });
    expect(s.question?.id).toBe(q(3, 1).id);
    expect(s.race?.pending?.questionId).toBe(q(3, 1).id);
    expect(canUndo(s)).toBe(false);
  });

  it('a lifeline the team has used changes nothing', () => {
    const once = gameReducer(open(), { type: 'lifeline', kind: 'two' });
    expect(gameReducer(once, { type: 'lifeline', kind: 'two' })).toBe(once);
  });
});

describe('lifeline words and the two answers', () => {
  it('every lifeline has a short name', () => {
    expect(LIFELINE_LABELS).toEqual({ two: 'جوابين', time: '+30 ثانية', swap: 'غيّر السؤال' });
  });

  it('shows the right answer and the wrong one, in an order that does not change between looks', () => {
    const question = { id: 'q1', a: 'الكويت', w: 'قطر' };
    const first = twoChoices(question);
    expect(first).not.toBeNull();
    expect([...first!].sort()).toEqual(['الكويت', 'قطر'].sort());
    expect(twoChoices(question)).toEqual(first);
  });

  it('the right answer is not always in the same place', () => {
    const places = new Set(
      Array.from({ length: 40 }, (_, i) => twoChoices({ id: `question-${i}`, a: 'صح', w: 'غلط' })!.indexOf('صح')),
    );
    expect(places).toEqual(new Set([0, 1]));
  });

  it('there is nothing to show when the question has no wrong answer (or it equals the right one)', () => {
    expect(twoChoices({ id: 'q', a: 'الكويت' })).toBeNull();
    expect(twoChoices({ id: 'q', a: 'الكويت', w: ' الكويت ' })).toBeNull();
    expect(twoChoices({ id: 'q', a: 'الكويت', w: '' })).toBeNull();
  });

  it('every demo question has a wrong answer that differs from the right one', () => {
    const missing = DEMO_QUESTIONS.filter((x) => twoChoices(x) === null).map((x) => x.id);
    expect(missing).toEqual([]);
  });
});
