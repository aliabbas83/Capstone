/**
 * Game store state and reducer — pure, no React or Supabase, so it can be unit tested.
 * The provider in game-store.tsx wires it to the server.
 */
import {
  chooseMove,
  createRace,
  markCorrect,
  markWrong,
  MoveKind,
  pickCategory,
  playLifeline,
  RaceState,
  startQuestion,
  swapQuestion,
  TeamIdx,
  undoPick,
} from './engine';
import { CATEGORIES_PER_TEAM, Question } from './demo-questions';

export interface TeamDraft {
  name: string;
  mascotId: string;
  /** True once the host picked a mascot by hand, so typing the name no longer replaces it. */
  mascotLocked: boolean;
  photoUri: string | null;
}

export type GameMode = 'demo' | 'real';

export interface StoreState {
  mode: GameMode;
  teams: [TeamDraft, TeamDraft];
  timerSeconds: number;
  picks: [string[], string[]];
  race: RaceState | null;
  question: Question | null;
  /** Server game id (real mode only). */
  gameId: string | null;
  /** The race and question just before the host's last call (correct / wrong / move), for one-step undo. */
  undo: { race: RaceState; question: Question | null } | null;
  /** True when a question was reopened by undo: the answer is shown again straight away. */
  reopened: boolean;
}

export type Action =
  | { type: 'begin'; mode: GameMode }
  | { type: 'setTeam'; index: TeamIdx; patch: Partial<TeamDraft> }
  | { type: 'setTimer'; seconds: number }
  | { type: 'pick'; categoryId: string }
  | { type: 'undoPick' }
  | { type: 'startRace'; gameId: string | null; laneLength: number }
  | { type: 'ask'; question: Question; isComeback: boolean }
  | { type: 'correct' }
  | { type: 'wrong' }
  | { type: 'choose'; kind: MoveKind }
  | { type: 'lifeline'; kind: 'two' | 'time' }
  | { type: 'swap'; question: Question }
  | { type: 'undo' }
  | { type: 'playAgain' }
  | { type: 'changeTeams' };

const blankTeams = (): [TeamDraft, TeamDraft] => [
  { name: '', mascotId: 'falcon', mascotLocked: false, photoUri: null },
  { name: '', mascotId: 'tiger', mascotLocked: false, photoUri: null },
];

/** "No timer": the host reveals the answer whenever the team is ready (the 15 s steal timer stays). */
export const NO_TIMER = 0;
/** Question timer choices in setup (seconds, or NO_TIMER). */
export const TIMER_CHOICES = [30, 60, 90, NO_TIMER] as const;
/** AsyncStorage key for the host's timer choice. */
export const TIMER_KEY = 'jawla.timer.v1';

const isTimerChoice = (n: number) => (TIMER_CHOICES as readonly number[]).includes(n);

/** A saved timer value, or null when nothing (valid) was saved. */
export function parseSavedTimer(raw: string | null): number | null {
  if (!raw || !/^(0|[1-9]\d*)$/.test(raw)) return null;
  const n = Number(raw);
  return isTimerChoice(n) ? n : null;
}

export const initialGameState: StoreState = {
  mode: 'demo',
  teams: blankTeams(),
  timerSeconds: 60,
  picks: [[], []],
  race: null,
  question: null,
  gameId: null,
  undo: null,
  reopened: false,
};

/** True when the host can take back their last call. The winning move is final (its result is saved at once). */
export function canUndo(s: StoreState): boolean {
  return !!s.undo && !!s.race && s.race.phase !== 'finished';
}

/** Remember the moment before a host call so it can be undone. */
const remember = (s: StoreState) => ({ undo: s.race ? { race: s.race, question: s.question } : null, reopened: false });

export type CatalogStatus = 'idle' | 'loading' | 'error' | 'ready';

/** A real game needs the server catalog; start loading it if nobody has yet (e.g. after a deep link). */
export function shouldLoadCatalog(mode: GameMode, status: CatalogStatus): boolean {
  return mode === 'real' && status === 'idle';
}

/**
 * The "ask" error belongs to one moment of play: whose turn it is and what phase the race is in.
 * When this value changes (turn passes, a question opens or closes, a new game), the old error is cleared.
 */
export function askErrorScope(s: StoreState): string {
  return s.race ? `${s.race.turn}:${s.race.phase}:${s.race.usedQuestionIds.length}` : 'none';
}

export function gameReducer(s: StoreState, a: Action): StoreState {
  switch (a.type) {
    case 'begin':
      // A new game keeps the host's timer choice (30 / 60 / 90).
      return { ...initialGameState, mode: a.mode, teams: blankTeams(), timerSeconds: s.timerSeconds };
    case 'setTeam': {
      const teams = [...s.teams] as [TeamDraft, TeamDraft];
      teams[a.index] = { ...teams[a.index], ...a.patch };
      return { ...s, teams };
    }
    case 'setTimer':
      return isTimerChoice(a.seconds) ? { ...s, timerSeconds: a.seconds } : s;
    case 'pick':
      return { ...s, picks: pickCategory(s.picks, a.categoryId, CATEGORIES_PER_TEAM) };
    case 'undoPick':
      return { ...s, picks: undoPick(s.picks) };
    case 'startRace': {
      const [a0, a1] = s.teams;
      const toRace = (t: TeamDraft, i: TeamIdx) => ({
        name: t.name.trim() || (i === 0 ? 'الفريق الأول' : 'الفريق الثاني'),
        mascotId: t.mascotId,
        photoUri: t.photoUri,
        categories: s.picks[i],
      });
      return {
        ...s,
        race: createRace([toRace(a0, 0), toRace(a1, 1)], a.laneLength),
        question: null,
        gameId: a.gameId,
        undo: null,
        reopened: false,
      };
    }
    case 'ask': {
      if (!s.race) return s;
      const race = startQuestion(s.race, {
        categoryId: a.question.categoryId,
        questionId: a.question.id,
        points: a.question.points,
        isComeback: a.isComeback,
      });
      return race === s.race ? s : { ...s, race, question: a.question, undo: null, reopened: false };
    }
    case 'correct': {
      if (!s.race) return s;
      const race = markCorrect(s.race);
      return race === s.race ? s : { ...s, ...remember(s), race };
    }
    case 'wrong': {
      if (!s.race) return s;
      const race = markWrong(s.race);
      return race === s.race ? s : { ...s, ...remember(s), race, question: race.phase === 'pick' ? null : s.question };
    }
    case 'choose': {
      if (!s.race) return s;
      const race = chooseMove(s.race, a.kind);
      return race === s.race
        ? s
        : { ...s, ...remember(s), race, question: race.phase === 'choose' ? s.question : null };
    }
    // A lifeline is not a host call: it cannot be undone, and it closes the undo of the call before it.
    case 'lifeline': {
      if (!s.race) return s;
      const race = playLifeline(s.race, a.kind);
      return race === s.race ? s : { ...s, race, undo: null };
    }
    case 'swap': {
      if (!s.race) return s;
      const race = swapQuestion(s.race, a.question.id);
      return race === s.race ? s : { ...s, race, question: a.question, undo: null, reopened: false };
    }
    case 'undo':
      if (!canUndo(s) || !s.undo) return s;
      return { ...s, race: s.undo.race, question: s.undo.question, undo: null, reopened: true };
    case 'playAgain':
      return { ...s, picks: [[], []], race: null, question: null, gameId: null, undo: null, reopened: false };
    case 'changeTeams':
      return {
        ...s,
        teams: blankTeams(),
        picks: [[], []],
        race: null,
        question: null,
        gameId: null,
        undo: null,
        reopened: false,
      };
  }
}
