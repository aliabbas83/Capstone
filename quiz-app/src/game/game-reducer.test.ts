/**
 * Store reducer: play again / change teams / new game reset the right things (PRD rule 11).
 */
import { describe, expect, it } from '@jest/globals';
import {
  askErrorScope,
  gameReducer,
  initialGameState,
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
  it('offers 30 / 60 / 90 seconds, 60 by default', () => {
    expect(TIMER_CHOICES).toEqual([30, 60, 90]);
    expect(initialGameState.timerSeconds).toBe(60);
  });

  it.each([
    ['30', 30],
    ['90', 90],
    ['60', 60],
  ])('reads a saved %s back as %i', (raw, value) => {
    expect(parseSavedTimer(raw)).toBe(value);
  });

  it.each([null, '', '45', '0', 'abc', '-30', '30.5'])('ignores a bad saved value %p', (raw) => {
    expect(parseSavedTimer(raw)).toBeNull();
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
