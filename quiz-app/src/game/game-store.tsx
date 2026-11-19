import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { levelsLeft, Lifeline, MoveKind, Points, TeamIdx } from './engine';
import { Category, DEMO_CATEGORIES, DEMO_LANE_LENGTH, DEMO_QUESTIONS, Question, REAL_LANE_LENGTH } from './demo-questions';
import {
  askErrorScope,
  canUndo,
  CatalogStatus,
  gameReducer as reducer,
  GameMode,
  initialGameState as initial,
  parseSavedTimer,
  shouldLoadCatalog,
  StoreState,
  TeamDraft,
  TIMER_KEY,
} from './game-reducer';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/monitoring';
import { preloadPicture } from '@/lib/preload-picture';
import {
  drawQuestion,
  fetchCategories,
  finishGame,
  gameErrorMessage,
  questionImageUrl,
  remainingQuestions,
  startGame,
  uploadTeamPhoto,
} from '@/lib/supabase';

export type { GameMode, TeamDraft } from './game-reducer';

export type AskResult = 'ok' | 'empty' | 'error';

/** Server catalog for real games: categories + how many unseen questions are left. */
interface Catalog {
  status: CatalogStatus;
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
  /** Hide the last "ask" error, e.g. when the team picks another category or difficulty. */
  clearAskError: () => void;
  /**
   * The answering team uses a lifeline on the open question (once per team per game).
   * "swap" fetches another question: 'empty' when there is none left with that category and points.
   */
  lifeline: (kind: Lifeline) => Promise<AskResult>;
  correct: () => void;
  wrong: () => void;
  choose: (kind: MoveKind) => void;
  /** Take back the last صح / خطأ / move (one step). */
  undo: () => void;
  /** True while the last call can still be taken back. */
  canUndo: boolean;
  playAgain: () => void;
  changeTeams: () => void;
  /** Leave the race. A real game that is not finished is recorded as abandoned. */
  endGame: () => Promise<void>;
}

const Ctx = createContext<GameApi | null>(null);

const key = (categoryId: string, points: Points) => `${categoryId}:${points}`;

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  // Restore the host's saved timer choice (30 / 60 / 90 / no timer) once at start.
  useEffect(() => {
    AsyncStorage.getItem(TIMER_KEY)
      .then((raw) => {
        const seconds = parseSavedTimer(raw);
        if (seconds !== null) dispatch({ type: 'setTimer', seconds });
      })
      .catch(() => {});
  }, []);
  const { session, refreshProfile } = useAuth();
  const userId = session?.user.id ?? null;

  const [catalog, setCatalog] = useState<Catalog>({ status: 'idle', categories: [], left: {} });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askErrorState, setAskErrorState] = useState<{ scope: string; message: string } | null>(null);
  // Local photo → uploaded storage path, so "play again" does not upload the same photo twice.
  const uploaded = useRef(new Map<string, string>());
  const finished = useRef(new Set<string>());

  /** Fetches categories + unseen counts. Only sets state after awaiting, so it is safe inside an effect. */
  const fetchCatalog = useCallback(async () => {
    try {
      const categories = (await fetchCategories()).filter((c) => c.active);
      const left = await remainingQuestions(categories.map((c) => c.id));
      setCatalog({ status: 'ready', categories, left });
    } catch {
      setCatalog((c) => ({ ...c, status: 'error' }));
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalog((c) => ({ ...c, status: 'loading' }));
    await fetchCatalog();
  }, [fetchCatalog]);

  // A real game reached without begin() (e.g. a deep link) would wait forever on 'idle': load now.
  // 'idle' already shows as loading on screen, and fetchCatalog moves it to 'ready' or 'error'.
  const autoLoading = useRef(false);
  useEffect(() => {
    if (!shouldLoadCatalog(state.mode, catalog.status) || autoLoading.current) return;
    autoLoading.current = true;
    fetchCatalog().finally(() => {
      autoLoading.current = false;
    });
  }, [state.mode, catalog.status, fetchCatalog]);

  // An "ask" error belongs to one moment of play; once the turn passes or a question
  // opens/closes, it is stale and hidden.
  const errorScope = askErrorScope(state);
  const askError = askErrorState && askErrorState.scope === errorScope ? askErrorState.message : null;
  const setAskError = useCallback(
    (message: string | null) => setAskErrorState(message === null ? null : { scope: errorScope, message }),
    [errorScope],
  );

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

    /** Real games: one unseen question from the server (null when none are left), with its picture on the way. */
    const drawOne = async (gameId: string, categoryId: string, points: Points): Promise<Question | null> => {
      const q = await drawQuestion(gameId, categoryId, points);
      const k = key(categoryId, points);
      if (!q) {
        setCatalog((c) => ({ ...c, left: { ...c.left, [k]: 0 } }));
        return null;
      }
      setCatalog((c) => ({ ...c, left: { ...c.left, [k]: Math.max(0, (c.left[k] ?? 1) - 1) } }));
      const imageUri = questionImageUrl(q.image_path);
      const question: Question = {
        id: String(q.question_id),
        categoryId,
        points,
        q: q.question,
        a: q.answer,
        ...(q.wrong_answer ? { w: q.wrong_answer } : {}),
        ...(imageUri ? { image: { kind: q.image_path!.endsWith('.svg') ? 'svg' : 'png', uri: imageUri } } : {}),
      };
      // Give the picture a short head start, so it is usually there when the card opens.
      await preloadPicture(question.image);
      return question;
    };

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
      setTimer: (seconds) => {
        dispatch({ type: 'setTimer', seconds });
        AsyncStorage.setItem(TIMER_KEY, String(seconds)).catch(() => {});
      },
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
        // This team has used this level up (see LEVEL_LIMITS): don't use up a question for nothing.
        const race = state.race;
        if (race && !isComeback && levelsLeft(race.teams[race.turn], points) === 0) {
          setAskError('استخدمتوا كل مرّاتكم في هذه النقاط. اختاروا غيرها.');
          return 'error';
        }
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
          const question = await drawOne(state.gameId, categoryId, points);
          if (!question) {
            setAskError('خلصت أسئلة هذه النقاط. اختاروا غيرها.');
            return 'empty';
          }
          dispatch({ type: 'ask', question, isComeback });
          return 'ok';
        } catch (e) {
          reportError(e, 'draw_question');
          setAskError(gameErrorMessage(e));
          return 'error';
        } finally {
          setAsking(false);
        }
      },
      clearAskError: () => setAskError(null),
      lifeline: async (kind) => {
        const pending = state.race?.pending;
        const open = state.question;
        if (!pending || !open) return 'error';
        if (kind !== 'swap') {
          dispatch({ type: 'lifeline', kind });
          return 'ok';
        }
        // Change the question: another one with the same category and points.
        if (!real) {
          const options = pool(pending.categoryId, pending.points).filter((q) => q.id !== open.id);
          if (options.length === 0) return 'empty';
          dispatch({ type: 'swap', question: options[Math.floor(Math.random() * options.length)] });
          return 'ok';
        }
        if (!state.gameId || asking) return 'error';
        setAsking(true);
        try {
          const question = await drawOne(state.gameId, pending.categoryId, pending.points);
          if (!question) return 'empty';
          dispatch({ type: 'swap', question });
          return 'ok';
        } catch (e) {
          reportError(e, 'draw_question');
          return 'error';
        } finally {
          setAsking(false);
        }
      },
      correct: () => dispatch({ type: 'correct' }),
      wrong: () => dispatch({ type: 'wrong' }),
      choose: (kind) => dispatch({ type: 'choose', kind }),
      undo: () => dispatch({ type: 'undo' }),
      canUndo: canUndo(state),
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
  }, [state, catalog, starting, startError, asking, askError, setAskError, userId, loadCatalog, abandon, refreshProfile]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useGame(): GameApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame must be used inside GameProvider');
  return v;
}
