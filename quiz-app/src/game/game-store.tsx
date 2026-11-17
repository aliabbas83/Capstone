import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
  REAL_LANE_LENGTH,
} from './demo-questions';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/monitoring';
import {
  drawQuestion,
  fetchCategories,
  finishGame,
  gameErrorMessage,
  remainingQuestions,
  startGame,
  uploadTeamPhoto,
} from '@/lib/supabase';

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
  /** Server game id (real mode only). */
  gameId: string | null;
}

type Action =
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
  gameId: null,
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
      return { ...s, race: createRace([toRace(a0, 0), toRace(a1, 1)], a.laneLength), question: null, gameId: a.gameId };
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
      return { ...s, picks: [[], []], race: null, question: null, gameId: null };
    case 'changeTeams':
      return { ...s, teams: blankTeams(), picks: [[], []], race: null, question: null, gameId: null };
  }
}


export type AskResult = 'ok' | 'empty' | 'error';

/** Server catalog for real games: categories + how many unseen questions are left. */
interface Catalog {
  status: 'idle' | 'loading' | 'error' | 'ready';
  categories: Category[];
  left: Record<string, number>; // "categoryId:points" → unseen questions left
}

interface GameApi {
  state: StoreState;
  categories: Category[];
  categoryById: Record<string, Category>;
  /** Real mode: loading/error state of the server categories. Demo mode is always ready. */
  catalogStatus: Catalog['status'];
  reloadCatalog: () => void;
  /** Questions still available in a category at a given value. */
  remaining: (categoryId: string, points: Points) => number;
  /** Unseen questions left in a whole category (difficulties 2–4). */
  categoryLeft: (categoryId: string) => number;
  begin: (mode: GameMode) => void;
  setTeam: (index: TeamIdx, patch: Partial<TeamDraft>) => void;
  setTimer: (seconds: number) => void;
  pick: (categoryId: string) => void;
  undoPick: () => void;
  /** Demo: starts at once. Real: uploads photos, then the server creates the game and takes a credit. */
  startRace: () => Promise<boolean>;
  starting: boolean;
  startError: string | null;
  /** Draws an unseen question and opens it. */
  ask: (categoryId: string, points: Points, isComeback?: boolean) => Promise<AskResult>;
  asking: boolean;
  askError: string | null;
  correct: () => void;
  wrong: () => void;
  choose: (kind: MoveKind) => void;
  playAgain: () => void;
  changeTeams: () => void;
  /** Leave the race. A real game that is not finished is recorded as abandoned. */
  endGame: () => Promise<void>;
}

const Ctx = createContext<GameApi | null>(null);

const key = (categoryId: string, points: Points) => `${categoryId}:${points}`;

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const { session, refreshProfile } = useAuth();
  const userId = session?.user.id ?? null;

  const [catalog, setCatalog] = useState<Catalog>({ status: 'idle', categories: [], left: {} });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  // Local photo → uploaded storage path, so "play again" does not upload the same photo twice.
  const uploaded = useRef(new Map<string, string>());
  const finished = useRef(new Set<string>());

  const loadCatalog = useCallback(async () => {
    setCatalog((c) => ({ ...c, status: 'loading' }));
    try {
      const categories = (await fetchCategories()).filter((c) => c.active);
      const left = await remainingQuestions(categories.map((c) => c.id));
      setCatalog({ status: 'ready', categories, left });
    } catch {
      setCatalog((c) => ({ ...c, status: 'error' }));
    }
  }, []);

  /** Record an unfinished real game as abandoned (fire and forget). */
  const abandon = useCallback(async (s: StoreState) => {
    if (s.mode !== 'real' || !s.gameId || finished.current.has(s.gameId)) return;
    if (s.race?.phase === 'finished') return;
    finished.current.add(s.gameId);
    await finishGame(s.gameId, null).catch(() => {});
  }, []);

  // When a real race ends, save the winner on the server once.
  const { mode, gameId } = state;
  const winner = state.race?.phase === 'finished' ? state.race.winner : null;
  useEffect(() => {
    if (mode !== 'real' || !gameId || winner === null || finished.current.has(gameId)) return;
    finished.current.add(gameId);
    finishGame(gameId, winner).catch(() => finished.current.delete(gameId));
  }, [mode, gameId, winner]);

  const api = useMemo<GameApi>(() => {
    const real = state.mode === 'real';
    const categories: Category[] = real ? catalog.categories : DEMO_CATEGORIES;
    const used = new Set(state.race?.usedQuestionIds ?? []);
    const pool = (categoryId: string, points: Points) =>
      DEMO_QUESTIONS.filter((q) => q.categoryId === categoryId && q.points === points && !used.has(q.id));
    const remaining = (categoryId: string, points: Points) =>
      real ? (catalog.left[key(categoryId, points)] ?? 0) : pool(categoryId, points).length;

    return {
      state,
      categories,
      categoryById: Object.fromEntries(categories.map((c) => [c.id, c])),
      catalogStatus: real ? catalog.status : 'ready',
      reloadCatalog: () => {
        loadCatalog();
      },
      remaining,
      categoryLeft: (categoryId) => ([2, 3, 4] as Points[]).reduce((n, p) => n + remaining(categoryId, p), 0),
      begin: (m) => {
        abandon(state);
        setStartError(null);
        setAskError(null);
        dispatch({ type: 'begin', mode: m });
        if (m === 'real') loadCatalog();
      },
      setTeam: (index, patch) => dispatch({ type: 'setTeam', index, patch }),
      setTimer: (seconds) => dispatch({ type: 'setTimer', seconds }),
      pick: (categoryId) => dispatch({ type: 'pick', categoryId }),
      undoPick: () => dispatch({ type: 'undoPick' }),
      starting,
      startError,
      startRace: async () => {
        setStartError(null);
        if (!real) {
          dispatch({ type: 'startRace', gameId: null, laneLength: DEMO_LANE_LENGTH });
          return true;
        }
        if (!userId) {
          setStartError('انتهت جلستك. سجّل دخول مرة ثانية.');
          return false;
        }
        setStarting(true);
        try {
          const photos = await Promise.all(
            state.teams.map(async (t) => {
              if (!t.photoUri) return null;
              const known = uploaded.current.get(t.photoUri);
              if (known) return known;
              const path = await uploadTeamPhoto(userId, t.photoUri);
              uploaded.current.set(t.photoUri, path);
              return path;
            }),
          );
          const id = await startGame({
            teamNames: [state.teams[0].name.trim(), state.teams[1].name.trim()],
            mascots: [state.teams[0].mascotId, state.teams[1].mascotId],
            categories: [...state.picks[0], ...state.picks[1]],
            photos: [photos[0], photos[1]],
          });
          dispatch({ type: 'startRace', gameId: id, laneLength: REAL_LANE_LENGTH });
          refreshProfile();
          return true;
        } catch (e) {
          reportError(e, 'start_game');
          setStartError(gameErrorMessage(e));
          return false;
        } finally {
          setStarting(false);
        }
      },
      asking,
      askError,
      ask: async (categoryId, points, isComeback = false) => {
        setAskError(null);
        if (!real) {
          const options = pool(categoryId, points);
          if (options.length === 0) return 'empty';
          const question = options[Math.floor(Math.random() * options.length)];
          dispatch({ type: 'ask', question, isComeback });
          return 'ok';
        }
        if (!state.gameId || asking) return 'error';
        setAsking(true);
        try {
          const q = await drawQuestion(state.gameId, categoryId, points);
          const k = key(categoryId, points);
          if (!q) {
            setCatalog((c) => ({ ...c, left: { ...c.left, [k]: 0 } }));
            setAskError('خلصت أسئلة هذه الصعوبة. اختاروا غيرها.');
            return 'empty';
          }
          setCatalog((c) => ({ ...c, left: { ...c.left, [k]: Math.max(0, (c.left[k] ?? 1) - 1) } }));
          dispatch({
            type: 'ask',
            question: { id: String(q.question_id), categoryId, points, q: q.question, a: q.answer },
            isComeback,
          });
          return 'ok';
        } catch (e) {
          reportError(e, 'draw_question');
          setAskError(gameErrorMessage(e));
          return 'error';
        } finally {
          setAsking(false);
        }
      },
      correct: () => dispatch({ type: 'correct' }),
      wrong: () => dispatch({ type: 'wrong' }),
      choose: (kind) => dispatch({ type: 'choose', kind }),
      playAgain: () => {
        abandon(state);
        setStartError(null);
        dispatch({ type: 'playAgain' });
      },
      changeTeams: () => {
        abandon(state);
        setStartError(null);
        dispatch({ type: 'changeTeams' });
      },
      endGame: async () => {
        // Only saves the result; the next begin() clears the board. Clearing it here would
        // make the race screen redirect before we navigate away.
        await abandon(state);
      },
    };
  }, [state, catalog, starting, startError, asking, askError, userId, loadCatalog, abandon, refreshProfile]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useGame(): GameApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame must be used inside GameProvider');
  return v;
}
