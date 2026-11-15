import { createContext, ReactNode, useContext, useMemo, useReducer } from 'react';
import {
  chooseMove,
  createRace,
  markCorrect,
  markWrong,
  MoveKind,
  pickCategory,
  Points,
  RaceState,
  startQuestion,
  TeamIdx,
  undoPick,
} from './engine';
import {
  CATEGORIES_PER_TEAM,
  Category,
  DEMO_CATEGORIES,
  DEMO_LANE_LENGTH,
  DEMO_QUESTIONS,
  Question,
} from './demo-questions';

export interface TeamDraft {
  name: string;
  mascotId: string;
  /** True once the host picked a mascot by hand, so typing the name no longer replaces it. */
  mascotLocked: boolean;
  photoUri: string | null;
}

export type GameMode = 'demo' | 'real';

interface StoreState {
  mode: GameMode;
  teams: [TeamDraft, TeamDraft];
  timerSeconds: number;
  picks: [string[], string[]];
  race: RaceState | null;
  question: Question | null;
}

type Action =
  | { type: 'begin'; mode: GameMode }
  | { type: 'setTeam'; index: TeamIdx; patch: Partial<TeamDraft> }
  | { type: 'setTimer'; seconds: number }
  | { type: 'pick'; categoryId: string }
  | { type: 'undoPick' }
  | { type: 'startRace' }
  | { type: 'ask'; question: Question; isComeback: boolean }
  | { type: 'correct' }
  | { type: 'wrong' }
  | { type: 'choose'; kind: MoveKind }
  | { type: 'playAgain' }
  | { type: 'changeTeams' };

const blankTeams = (): [TeamDraft, TeamDraft] => [
  { name: '', mascotId: 'falcon', mascotLocked: false, photoUri: null },
  { name: '', mascotId: 'tiger', mascotLocked: false, photoUri: null },
];

const initial: StoreState = {
  mode: 'demo',
  teams: blankTeams(),
  timerSeconds: 60,
  picks: [[], []],
  race: null,
  question: null,
};

function reducer(s: StoreState, a: Action): StoreState {
  switch (a.type) {
    case 'begin':
      return { ...initial, mode: a.mode, teams: blankTeams() };
    case 'setTeam': {
      const teams = [...s.teams] as [TeamDraft, TeamDraft];
      teams[a.index] = { ...teams[a.index], ...a.patch };
      return { ...s, teams };
    }
    case 'setTimer':
      return { ...s, timerSeconds: a.seconds };
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
      return { ...s, race: createRace([toRace(a0, 0), toRace(a1, 1)], DEMO_LANE_LENGTH), question: null };
    }
    case 'ask': {
      if (!s.race) return s;
      const race = startQuestion(s.race, {
        categoryId: a.question.categoryId,
        questionId: a.question.id,
        points: a.question.points,
        isComeback: a.isComeback,
      });
      return race === s.race ? s : { ...s, race, question: a.question };
    }
    case 'correct':
      return s.race ? { ...s, race: markCorrect(s.race) } : s;
    case 'wrong': {
      if (!s.race) return s;
      const race = markWrong(s.race);
      return { ...s, race, question: race.phase === 'pick' ? null : s.question };
    }
    case 'choose': {
      if (!s.race) return s;
      const race = chooseMove(s.race, a.kind);
      return { ...s, race, question: race.phase === 'choose' ? s.question : null };
    }
    case 'playAgain':
      return { ...s, picks: [[], []], race: null, question: null };
    case 'changeTeams':
      return { ...s, teams: blankTeams(), picks: [[], []], race: null, question: null };
  }
}

interface GameApi {
  state: StoreState;
  categories: Category[];
  categoryById: Record<string, Category>;
  /** Questions still available in a category at a given value (not used in this game). */
  remaining: (categoryId: string, points: Points) => number;
  begin: (mode: GameMode) => void;
  setTeam: (index: TeamIdx, patch: Partial<TeamDraft>) => void;
  setTimer: (seconds: number) => void;
  pick: (categoryId: string) => void;
  undoPick: () => void;
  startRace: () => void;
  /** Draws an unused question and opens it. Returns false if none is left. */
  ask: (categoryId: string, points: Points, isComeback?: boolean) => boolean;
  correct: () => void;
  wrong: () => void;
  choose: (kind: MoveKind) => void;
  playAgain: () => void;
  changeTeams: () => void;
}

const Ctx = createContext<GameApi | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const api = useMemo<GameApi>(() => {
    const categories = DEMO_CATEGORIES;
    const used = new Set(state.race?.usedQuestionIds ?? []);
    const pool = (categoryId: string, points: Points) =>
      DEMO_QUESTIONS.filter((q) => q.categoryId === categoryId && q.points === points && !used.has(q.id));

    return {
      state,
      categories,
      categoryById: Object.fromEntries(categories.map((c) => [c.id, c])),
      remaining: (categoryId, points) => pool(categoryId, points).length,
      begin: (mode) => dispatch({ type: 'begin', mode }),
      setTeam: (index, patch) => dispatch({ type: 'setTeam', index, patch }),
      setTimer: (seconds) => dispatch({ type: 'setTimer', seconds }),
      pick: (categoryId) => dispatch({ type: 'pick', categoryId }),
      undoPick: () => dispatch({ type: 'undoPick' }),
      startRace: () => dispatch({ type: 'startRace' }),
      ask: (categoryId, points, isComeback = false) => {
        const options = pool(categoryId, points);
        if (options.length === 0) return false;
        const question = options[Math.floor(Math.random() * options.length)];
        dispatch({ type: 'ask', question, isComeback });
        return true;
      },
      correct: () => dispatch({ type: 'correct' }),
      wrong: () => dispatch({ type: 'wrong' }),
      choose: (kind) => dispatch({ type: 'choose', kind }),
      playAgain: () => dispatch({ type: 'playAgain' }),
      changeTeams: () => dispatch({ type: 'changeTeams' }),
    };
  }, [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useGame(): GameApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame must be used inside GameProvider');
  return v;
}
