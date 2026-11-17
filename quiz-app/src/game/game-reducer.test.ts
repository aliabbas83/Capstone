/**
 * Store reducer: play again / change teams / new game reset the right things (PRD rule 11).
 */
import { describe, expect, it } from '@jest/globals';
import {
  askErrorScope,
  canUndo,
  gameReducer,
  initialGameState,
  NO_TIMER,
  parseSavedTimer,
  shouldLoadCatalog,
  StoreState,
  TIMER_CHOICES,
} from './game-reducer';
import { DEMO_LANE_LENGTH, DEMO_QUESTIONS, REAL_LANE_LENGTH } from './demo-questions';

const q = (points: 2 | 3 | 4) => DEMO_QUESTIONS.find((x) => x.points === points)!;

/** A real game in the middle of a race: named teams, a photo, 8 picks, boats moved, a question open. */
function midGame(): StoreState {
  let s = gameReducer(initialGameState, { type: 'begin', mode: 'real' });
  s = gameReducer(s, { type: 'setTeam', index: 0, patch: { name: 'الصقور', mascotId: 'falcon', mascotLocked: true } });
  s = gameReducer(s, { type: 'setTeam', index: 1, patch: { name: 'النمور', photoUri: 'file:///b.jpg' } });
  s = gameReducer(s, { type: 'setTimer', seconds: 90 });
  for (const c of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) s = gameReducer(s, { type: 'pick', categoryId: c });
  s = gameReducer(s, { type: 'startRace', gameId: 'game-1', laneLength: REAL_LANE_LENGTH });
  s = gameReducer(s, { type: 'ask', question: q(4), isComeback: false });
  s = gameReducer(s, { type: 'correct' });
  s = gameReducer(s, { type: 'choose', kind: 'forward' });
  s = gameReducer(s, { type: 'ask', question: q(3), isComeback: false });
  return s;
}

describe('starting a race', () => {
  it('builds the race from the teams and their picked categories', () => {
    const s = midGame();
    expect(s.race?.laneLength).toBe(20);
    expect(s.race?.teams[0].name).toBe('الصقور');
    expect(s.race?.teams[0].categories).toEqual(['a', 'c', 'e', 'g']);
    expect(s.race?.teams[1].categories).toEqual(['b', 'd', 'f', 'h']);
    expect(s.race?.teams[1].photoUri).toBe('file:///b.jpg');
    expect(s.gameId).toBe('game-1');
  });

  it('gives unnamed teams a default Arabic name', () => {
    let s = gameReducer(initialGameState, { type: 'begin', mode: 'demo' });
    s = gameReducer(s, { type: 'setTeam', index: 1, patch: { name: '   ' } });
    s = gameReducer(s, { type: 'startRace', gameId: null, laneLength: DEMO_LANE_LENGTH });
    expect(s.race?.laneLength).toBe(10);
    expect(s.race?.teams[0].name).toBe('الفريق الأول');
    expect(s.race?.teams[1].name).toBe('الفريق الثاني');
  });
});

describe('play again', () => {
  it('keeps the same teams and timer but clears picks, race, question and game id', () => {
    const before = midGame();
    const s = gameReducer(before, { type: 'playAgain' });
    expect(s.teams).toEqual(before.teams);
    expect(s.timerSeconds).toBe(90);
    expect(s.mode).toBe('real');
    expect(s.picks).toEqual([[], []]);
    expect(s.race).toBeNull();
    expect(s.question).toBeNull();
    expect(s.gameId).toBeNull();
  });

  it('the next race starts fresh: boats on the start line, team A first, comebacks locked', () => {
    let s = gameReducer(midGame(), { type: 'playAgain' });
    for (const c of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) s = gameReducer(s, { type: 'pick', categoryId: c });
    s = gameReducer(s, { type: 'startRace', gameId: 'game-2', laneLength: REAL_LANE_LENGTH });
    expect(s.race?.teams.map((t) => t.position)).toEqual([0, 0]);
    expect(s.race?.teams.map((t) => t.comeback)).toEqual(['locked', 'locked']);
    expect(s.race?.turn).toBe(0);
    expect(s.race?.phase).toBe('pick');
    expect(s.race?.winner).toBeNull();
    expect(s.gameId).toBe('game-2');
  });
});

describe('change teams', () => {
  it('clears the teams too, but keeps the mode and timer', () => {
    const s = gameReducer(midGame(), { type: 'changeTeams' });
    expect(s.teams.map((t) => t.name)).toEqual(['', '']);
    expect(s.teams.map((t) => t.photoUri)).toEqual([null, null]);
    expect(s.teams.map((t) => t.mascotLocked)).toEqual([false, false]);
    expect(s.picks).toEqual([[], []]);
    expect(s.race).toBeNull();
    expect(s.question).toBeNull();
    expect(s.gameId).toBeNull();
    expect(s.mode).toBe('real');
    expect(s.timerSeconds).toBe(90);
  });
});

describe('new game (begin)', () => {
  it('resets the game and sets the mode, but keeps the host’s timer choice', () => {
    const s = gameReducer(midGame(), { type: 'begin', mode: 'demo' });
    expect(s).toEqual({ ...initialGameState, mode: 'demo', timerSeconds: 90 });
  });
});

describe('server catalog loading', () => {
  it('loads the catalog for a real game that has not started loading yet', () => {
    expect(shouldLoadCatalog('real', 'idle')).toBe(true);
  });

  it.each(['loading', 'ready', 'error'] as const)('does not reload automatically when %s', (status) => {
    expect(shouldLoadCatalog('real', status)).toBe(false);
  });

  it('never loads it for the demo', () => {
    expect(shouldLoadCatalog('demo', 'idle')).toBe(false);
  });
});

describe('ask error', () => {
  it('is cleared when the turn passes or a question opens/closes', () => {
    let s = gameReducer(initialGameState, { type: 'begin', mode: 'demo' });
    s = gameReducer(s, { type: 'startRace', gameId: null, laneLength: DEMO_LANE_LENGTH });
    const k0 = askErrorScope(s);
    const asked = gameReducer(s, { type: 'ask', question: q(2), isComeback: false });
    expect(askErrorScope(asked)).not.toBe(k0);
    const passed = gameReducer(gameReducer(asked, { type: 'wrong' }), { type: 'wrong' });
    expect(askErrorScope(passed)).not.toBe(k0); // B's turn now
    expect(askErrorScope(gameReducer(s, { type: 'playAgain' }))).not.toBe(k0);
  });

  it('stays while nothing changed (same team still picking)', () => {
    let s = gameReducer(initialGameState, { type: 'begin', mode: 'demo' });
    s = gameReducer(s, { type: 'startRace', gameId: null, laneLength: DEMO_LANE_LENGTH });
    expect(askErrorScope(gameReducer(s, { type: 'setTimer', seconds: 30 }))).toBe(askErrorScope(s));
  });
});

describe('timer setting', () => {
  it('offers 30 / 60 / 90 seconds or no timer, 60 by default', () => {
    expect(TIMER_CHOICES).toEqual([30, 60, 90, NO_TIMER]);
    expect(NO_TIMER).toBe(0);
    expect(initialGameState.timerSeconds).toBe(60);
  });

  it.each([
    ['30', 30],
    ['90', 90],
    ['60', 60],
    ['0', 0],
  ])('reads a saved %s back as %i', (raw, value) => {
    expect(parseSavedTimer(raw)).toBe(value);
  });

  it.each([null, '', '45', '00', 'abc', '-30', '30.5'])('ignores a bad saved value %p', (raw) => {
    expect(parseSavedTimer(raw)).toBeNull();
  });

  it('can be set to no timer', () => {
    expect(gameReducer(initialGameState, { type: 'setTimer', seconds: NO_TIMER }).timerSeconds).toBe(0);
  });

  it('ignores a timer that is not one of the choices', () => {
    const s = gameReducer(initialGameState, { type: 'setTimer', seconds: 5 });
    expect(s.timerSeconds).toBe(60);
  });
});

describe('question in the store', () => {
  it('stays open during a steal and closes when the turn ends', () => {
    let s = midGame();
    expect(s.question).not.toBeNull();
    s = gameReducer(s, { type: 'wrong' });
    expect(s.race?.phase).toBe('steal');
    expect(s.question).not.toBeNull();
    s = gameReducer(s, { type: 'wrong' });
    expect(s.race?.phase).toBe('pick');
    expect(s.question).toBeNull();
  });

  it('a rejected question (already used) is not shown', () => {
    let s = gameReducer(initialGameState, { type: 'begin', mode: 'demo' });
    s = gameReducer(s, { type: 'startRace', gameId: null, laneLength: DEMO_LANE_LENGTH });
    s = gameReducer(s, { type: 'ask', question: q(2), isComeback: false });
    s = gameReducer(s, { type: 'wrong' });
    s = gameReducer(s, { type: 'wrong' });
    const again = gameReducer(s, { type: 'ask', question: q(2), isComeback: false });
    expect(again).toBe(s);
    expect(again.question).toBeNull();
  });
});

describe('undo the last call (host tapped the wrong button)', () => {
  it('undoes "correct": the question is open again, answer already shown', () => {
    const open = midGame();
    const s = gameReducer(open, { type: 'correct' });
    expect(s.race?.phase).toBe('choose');
    expect(canUndo(s)).toBe(true);
    const back = gameReducer(s, { type: 'undo' });
    expect(back.race).toEqual(open.race);
    expect(back.question).toEqual(open.question);
    expect(back.reopened).toBe(true);
    expect(canUndo(back)).toBe(false);
  });

  it('undoes "wrong" in the first round: back from the steal to the same team', () => {
    const open = midGame();
    const s = gameReducer(open, { type: 'wrong' });
    expect(s.race?.phase).toBe('steal');
    const back = gameReducer(s, { type: 'undo' });
    expect(back.race).toEqual(open.race);
  });

  it('undoes a wrong steal: the question comes back and the turn does not pass', () => {
    const steal = gameReducer(midGame(), { type: 'wrong' });
    const s = gameReducer(steal, { type: 'wrong' });
    expect(s.race?.phase).toBe('pick');
    expect(s.question).toBeNull();
    const back = gameReducer(s, { type: 'undo' });
    expect(back.race).toEqual(steal.race);
    expect(back.question).toEqual(steal.question);
  });

  it('undoes a move or push: boats go back and the team chooses again', () => {
    const choosing = gameReducer(midGame(), { type: 'correct' });
    const s = gameReducer(choosing, { type: 'choose', kind: 'push' });
    expect(s.race?.phase).toBe('pick');
    const back = gameReducer(s, { type: 'undo' });
    expect(back.race).toEqual(choosing.race);
    expect(back.question).toEqual(choosing.question);
  });

  it('only one step back', () => {
    let s = gameReducer(midGame(), { type: 'correct' });
    s = gameReducer(s, { type: 'choose', kind: 'forward' });
    s = gameReducer(s, { type: 'undo' });
    expect(s.race?.phase).toBe('choose');
    expect(gameReducer(s, { type: 'undo' })).toBe(s);
  });

  it('nothing to undo before any call, or after a new question opens', () => {
    const open = midGame();
    expect(gameReducer(open, { type: 'undo' })).toBe(open);
    let s = gameReducer(open, { type: 'wrong' });
    s = gameReducer(s, { type: 'wrong' });
    s = gameReducer(s, { type: 'ask', question: q(2), isComeback: false });
    expect(canUndo(s)).toBe(false);
    expect(s.reopened).toBe(false);
  });

  it('the winning move cannot be undone (the result is saved straight away)', () => {
    let s = gameReducer(initialGameState, { type: 'begin', mode: 'demo' });
    s = gameReducer(s, { type: 'startRace', gameId: null, laneLength: DEMO_LANE_LENGTH });
    for (const p of [4, 4, 4] as const) {
      const pts = DEMO_QUESTIONS.filter((x) => x.points === p && !s.race!.usedQuestionIds.includes(x.id))[0];
      s = gameReducer(s, { type: 'ask', question: pts, isComeback: false });
      s = gameReducer(s, { type: 'correct' });
      s = gameReducer(s, { type: 'choose', kind: 'forward' });
      if (s.race?.phase === 'finished') break;
      // the other team answers wrong twice so the turn comes back
      const other = DEMO_QUESTIONS.filter((x) => x.points === 2 && !s.race!.usedQuestionIds.includes(x.id))[0];
      s = gameReducer(s, { type: 'ask', question: other, isComeback: false });
      s = gameReducer(s, { type: 'wrong' });
      s = gameReducer(s, { type: 'wrong' });
    }
    expect(s.race?.phase).toBe('finished');
    expect(canUndo(s)).toBe(false);
    expect(gameReducer(s, { type: 'undo' })).toBe(s);
  });

  it('a new race or play again clears the undo', () => {
    const s = gameReducer(gameReducer(midGame(), { type: 'correct' }), { type: 'playAgain' });
    expect(canUndo(s)).toBe(false);
  });
});
