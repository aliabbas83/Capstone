/**
 * Game rules from docs/PRD.md ("Game rules"), one describe block per rule.
 */
import { describe, expect, it } from '@jest/globals';
import {
  chooseMove,
  COMEBACK_POINTS,
  COMEBACK_TRIGGER,
  createRace,
  markCorrect,
  markWrong,
  nextPicker,
  pickCategory,
  Points,
  RaceState,
  startQuestion,
  STEAL_SECONDS,
  TeamIdx,
  undoPick,
} from './engine';
import { CATEGORIES_PER_TEAM, DEMO_LANE_LENGTH, REAL_LANE_LENGTH } from './demo-questions';

const team = (name: string) => ({ name, mascotId: 'falcon', photoUri: null, categories: [] });
const race = (len = 20) => createRace([team('A'), team('B')], len);

let qid = 0;
/** The team whose turn it is opens a fresh question. */
const ask = (s: RaceState, points: Points = 3, isComeback = false, id = `q${++qid}`) =>
  startQuestion(s, { categoryId: 'geo', questionId: id, points, isComeback });

/** Put the boats at given steps (and optionally set whose turn it is). */
const at = (s: RaceState, a: number, b: number, turn: TeamIdx = s.turn): RaceState => ({
  ...s,
  turn,
  teams: [
    { ...s.teams[0], position: a },
    { ...s.teams[1], position: b },
  ],
});

/** Full turn: current team answers correctly and makes a move. */
const scores = (s: RaceState, points: Points, kind: 'forward' | 'push' = 'forward') =>
  chooseMove(markCorrect(ask(s, points)), kind);

const positions = (s: RaceState) => [s.teams[0].position, s.teams[1].position];

describe('lane', () => {
  it('real games use a 20-step lane and the demo a 10-step lane', () => {
    expect(REAL_LANE_LENGTH).toBe(20);
    expect(DEMO_LANE_LENGTH).toBe(10);
    expect(race(REAL_LANE_LENGTH).laneLength).toBe(20);
    expect(race(DEMO_LANE_LENGTH).laneLength).toBe(10);
  });

  it('a new race starts with both boats on the start line, team A to play, comebacks locked', () => {
    const s = race();
    expect(positions(s)).toEqual([0, 0]);
    expect(s.turn).toBe(0);
    expect(s.phase).toBe('pick');
    expect(s.winner).toBeNull();
    expect(s.teams.map((t) => t.comeback)).toEqual(['locked', 'locked']);
  });
});

describe('turns', () => {
  it('alternate A, B, A, B whether the answer is right or wrong', () => {
    let s = race();
    const order: TeamIdx[] = [];
    order.push(s.turn);
    s = scores(s, 2); // A right
    order.push(s.turn);
    s = markWrong(markWrong(ask(s))); // B wrong, A misses the steal
    order.push(s.turn);
    s = scores(s, 2); // A right
    order.push(s.turn);
    expect(order).toEqual([0, 1, 0, 1]);
  });

  it('a team cannot answer or move while no question is open', () => {
    const s = race();
    expect(markCorrect(s)).toBe(s);
    expect(markWrong(s)).toBe(s);
    expect(chooseMove(s, 'forward')).toBe(s);
  });

  it('a second question cannot be opened while one is running', () => {
    const s = ask(race());
    expect(ask(s)).toBe(s);
  });

  it('never accepts the same question twice in a game', () => {
    const s = chooseMove(markCorrect(ask(race(), 3, false, 'same')), 'forward');
    expect(ask(s, 3, false, 'same')).toBe(s);
  });
});

describe('points and correct answers', () => {
  it.each([
    [2, 'easy'],
    [3, 'medium'],
    [4, 'hard'],
  ] as const)('%i points (%s) move the own boat forward that many steps', (points, _level) => {
    const s = scores(race(), points, 'forward');
    expect(positions(s)).toEqual([points, 0]);
  });

  it.each([2, 3, 4] as const)('%i points push the rival boat back %i steps', (points) => {
    const s = scores(at(race(), 0, 10), points, 'push');
    expect(positions(s)).toEqual([0, 10 - points]);
  });

  it('after a correct answer the turn passes to the other team', () => {
    const s = markCorrect(ask(race()));
    expect(s.phase).toBe('choose');
    const after = chooseMove(s, 'forward');
    expect(after.phase).toBe('pick');
    expect(after.turn).toBe(1);
  });

  it('boats never go behind the start line', () => {
    const s = scores(at(race(), 0, 2), 4, 'push');
    expect(positions(s)).toEqual([0, 0]);
  });

  it('pushing a boat already on the start line leaves it there', () => {
    const s = scores(race(), 4, 'push');
    expect(positions(s)).toEqual([0, 0]);
  });
});

describe('wrong answer / time out and stealing', () => {
  it('gives the other team one 15 s chance to steal', () => {
    const s = markWrong(ask(race()));
    expect(STEAL_SECONDS).toBe(15);
    expect(s.phase).toBe('steal');
    expect(s.pending?.owner).toBe(0);
    expect(s.pending?.answering).toBe(1);
  });

  it('a correct steal earns the same points with a forward move', () => {
    const s = chooseMove(markCorrect(markWrong(ask(race(), 4))), 'forward');
    expect(positions(s)).toEqual([0, 4]);
  });

  it('a correct steal can push the asking team back instead', () => {
    const s = chooseMove(markCorrect(markWrong(ask(at(race(), 8, 0), 3))), 'push');
    expect(positions(s)).toEqual([5, 0]);
  });

  it('after a steal the turn passes as normal (to the team after the asking team)', () => {
    const fromA = chooseMove(markCorrect(markWrong(ask(race()))), 'forward');
    expect(fromA.turn).toBe(1);

    const fromB = chooseMove(markCorrect(markWrong(ask({ ...race(), turn: 1 }))), 'forward');
    expect(fromB.turn).toBe(0);
  });

  it('a missed steal ends the turn with no points', () => {
    const s = markWrong(markWrong(ask(race())));
    expect(s.phase).toBe('pick');
    expect(s.pending).toBeNull();
    expect(s.turn).toBe(1);
    expect(positions(s)).toEqual([0, 0]);
  });

  it('there is only one steal: the asking team never gets the question back', () => {
    const s = markWrong(markWrong(ask(race())));
    // The question is closed; another "wrong" or "correct" changes nothing.
    expect(markWrong(s)).toBe(s);
    expect(markCorrect(s)).toBe(s);
  });
});

describe('5-point comeback question', () => {
  it('is worth 5 points and unlocks at 4 steps or fewer from the finish', () => {
    expect(COMEBACK_POINTS).toBe(5);
    expect(COMEBACK_TRIGGER).toBe(4);
  });

  it('unlocks for the other team when a rival lands exactly 4 steps from the finish', () => {
    const s = scores(at(race(20), 14, 0), 2); // A: 14 → 16, 4 left
    expect(s.teams[1].comeback).toBe('available');
    expect(s.teams[0].comeback).toBe('locked');
  });

  it('stays locked while the rival is still 5 steps away', () => {
    const s = scores(at(race(20), 13, 0), 2); // A: 13 → 15, 5 left
    expect(s.teams[1].comeback).toBe('locked');
  });

  it('uses the same 4-step rule on the 10-step demo lane', () => {
    expect(scores(at(race(10), 3, 0), 2).teams[1].comeback).toBe('locked'); // 5 left
    expect(scores(at(race(10), 4, 0), 2).teams[1].comeback).toBe('available'); // 4 left
  });

  it('also unlocks when the rival gets close through a steal', () => {
    // A asks, misses; B steals and moves 14 → 17. Now A unlocks its comeback.
    const s = chooseMove(markCorrect(markWrong(ask(at(race(20), 0, 14), 3))), 'forward');
    expect(s.teams[0].comeback).toBe('available');
    expect(s.teams[1].comeback).toBe('locked');
  });

  it('stays available after the rival is pushed back out of the zone', () => {
    let s = scores(at(race(20), 16, 0, 1), 2); // B moves; A already at 16 → B unlocks
    s = { ...s, turn: 1 };
    expect(s.teams[1].comeback).toBe('available');
    s = scores(s, 4, 'push'); // B pushes A back to 12
    expect(s.teams[0].position).toBe(12);
    expect(s.teams[1].comeback).toBe('available');
  });

  it('can only be opened by its own team on its own turn', () => {
    const base = race(20);
    // B's comeback is available, but it is A's turn and A's comeback is still locked.
    const s: RaceState = { ...base, turn: 0, teams: [{ ...base.teams[0], position: 17 }, { ...base.teams[1], comeback: 'available' }] };
    expect(ask(s, 5, true)).toBe(s);
  });

  it('cannot be opened while locked', () => {
    const s = race();
    expect(ask(s, 5, true)).toBe(s);
  });

  it('must be worth exactly 5, and normal questions can never be worth 5', () => {
    const s: RaceState = { ...race(), turn: 1, teams: [race().teams[0], { ...race().teams[1], comeback: 'available' }] };
    expect(ask(s, 4, true)).toBe(s);
    expect(ask(s, 5, false)).toBe(s);
  });

  const comebackReady = (): RaceState => {
    const base = race(20);
    return { ...base, turn: 1, teams: [{ ...base.teams[0], position: 17 }, { ...base.teams[1], position: 3, comeback: 'available' }] };
  };

  it('moves the own boat forward 5 steps', () => {
    const s = chooseMove(markCorrect(ask(comebackReady(), 5, true)), 'forward');
    expect(positions(s)).toEqual([17, 8]);
  });

  it('can push the leader back 5 steps instead', () => {
    const s = chooseMove(markCorrect(ask(comebackReady(), 5, true)), 'push');
    expect(positions(s)).toEqual([12, 3]);
  });

  it('is used up even when answered wrong', () => {
    let s = ask(comebackReady(), 5, true);
    expect(s.teams[1].comeback).toBe('used');
    s = markWrong(markWrong(s));
    expect(s.teams[1].comeback).toBe('used');
  });

  it('if missed, the other team can steal it for 5 points', () => {
    const s = chooseMove(markCorrect(markWrong(ask(comebackReady(), 5, true))), 'forward');
    expect(s.phase).toBe('finished'); // A: 17 + 5 ≥ 20
    expect(s.winner).toBe(0);
  });

  it('can be used only once per game', () => {
    let s = chooseMove(markCorrect(ask(comebackReady(), 5, true)), 'forward'); // B uses it, turn → A
    s = markWrong(markWrong(ask(s, 2))); // A misses, turn → B
    expect(s.turn).toBe(1);
    expect(ask(s, 5, true)).toBe(s);
  });

  it('each team has its own comeback', () => {
    // Both boats are close, so both comebacks unlock.
    let s = scores(at(race(20), 15, 16), 2); // A: 15 → 17
    expect(s.teams.map((t) => t.comeback)).toEqual(['available', 'available']);
    s = chooseMove(markCorrect(ask(s, 5, true)), 'push'); // B uses its comeback on A
    expect(s.teams[1].comeback).toBe('used');
    expect(s.teams[0].comeback).toBe('available');
    s = chooseMove(markCorrect(ask(s, 5, true)), 'push'); // A uses its own
    expect(s.teams.map((t) => t.comeback)).toEqual(['used', 'used']);
  });
});

describe('winning', () => {
  it('reaching the finish wins without needing an exact landing', () => {
    const s = scores(at(race(20), 19, 0), 4);
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe(0);
    expect(s.teams[0].position).toBe(20); // capped at the finish line
  });

  it('landing exactly on the finish also wins', () => {
    const s = scores(at(race(20), 17, 0), 3);
    expect(s.winner).toBe(0);
  });

  it('one step short does not win', () => {
    const s = scores(at(race(20), 15, 0), 4);
    expect(s.phase).toBe('pick');
    expect(s.winner).toBeNull();
  });

  it('a stealing team can win', () => {
    const s = chooseMove(markCorrect(markWrong(ask(at(race(10), 0, 8), 2))), 'forward');
    expect(s.winner).toBe(1);
  });

  it('a push never wins the race', () => {
    const s = scores(at(race(20), 19, 19), 4, 'push');
    expect(s.phase).toBe('pick');
    expect(s.winner).toBeNull();
  });

  it('nothing can be played after the race is finished', () => {
    const s = scores(at(race(10), 9, 0), 2);
    expect(s.phase).toBe('finished');
    expect(ask(s)).toBe(s);
    expect(markWrong(s)).toBe(s);
    expect(markCorrect(s)).toBe(s);
    expect(chooseMove(s, 'forward')).toBe(s);
  });

  it('a whole demo game: A and B race until A crosses the 10-step finish', () => {
    let s = race(DEMO_LANE_LENGTH);
    s = scores(s, 4); // A 4
    s = scores(s, 3); // B 3
    s = scores(s, 4); // A 8 → B unlocks comeback (2 left)
    expect(s.teams[1].comeback).toBe('available');
    s = chooseMove(markCorrect(ask(s, 5, true)), 'push'); // B pushes A to 3
    s = markWrong(markWrong(ask(s, 2))); // A misses, B misses steal
    s = scores(s, 4); // B 7 → A unlocks comeback (3 left)
    expect(positions(s)).toEqual([3, 7]);
    s = chooseMove(markCorrect(ask(s, 5, true)), 'forward'); // A 8
    s = scores(s, 2); // B 9
    s = scores(s, 2); // A 10 → wins
    expect(s.winner).toBe(0);
    expect(positions(s)).toEqual([10, 9]);
  });
});

describe('category picking', () => {
  type Picks = [string[], string[]];
  const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  it('each team picks 4', () => {
    expect(CATEGORIES_PER_TEAM).toBe(4);
  });

  it('teams take turns A, B, A, B … until each has 4', () => {
    let p: Picks = [[], []];
    const order: (TeamIdx | null)[] = [];
    for (const c of all) {
      order.push(nextPicker(p, 4));
      p = pickCategory(p, c, 4);
    }
    order.push(nextPicker(p, 4));
    expect(order).toEqual([0, 1, 0, 1, 0, 1, 0, 1, null]);
    expect(p).toEqual([
      ['a', 'c', 'e', 'g'],
      ['b', 'd', 'f', 'h'],
    ]);
  });

  it('a category taken by the rival cannot be picked', () => {
    const p: Picks = [['geo'], []];
    expect(pickCategory(p, 'geo', 4)).toBe(p);
    expect(nextPicker(p, 4)).toBe(1); // still B's pick
  });

  it('a team cannot pick the same category twice', () => {
    const p: Picks = [['geo'], ['tech']];
    expect(pickCategory(p, 'geo', 4)).toBe(p);
  });

  it('ends with 8 different categories and ignores extra picks', () => {
    let p: Picks = [[], []];
    for (const c of all) p = pickCategory(p, c, 4);
    expect(new Set([...p[0], ...p[1]]).size).toBe(8);
    expect(pickCategory(p, 'z', 4)).toBe(p);
  });

  it('does not change the old picks (returns a new value)', () => {
    const p: Picks = [[], []];
    pickCategory(p, 'geo', 4);
    expect(p).toEqual([[], []]);
  });

  it('undo removes the most recent pick and gives that team its turn back', () => {
    let p: Picks = [['a', 'c'], ['b']];
    p = undoPick(p); // A picked last
    expect(p).toEqual([['a'], ['b']]);
    expect(nextPicker(p, 4)).toBe(0);
    p = undoPick(p); // B picked last
    expect(p).toEqual([['a'], []]);
    expect(nextPicker(p, 4)).toBe(1);
    p = undoPick(undoPick(p));
    expect(p).toEqual([[], []]);
  });
});
