/**
 * Jawla race rules — pure functions, no UI. See docs/PRD.md "Game rules".
 */

export type TeamIdx = 0 | 1;
export type Points = 2 | 3 | 4 | 5;
export type Comeback = 'locked' | 'available' | 'used';
export type Phase = 'pick' | 'question' | 'steal' | 'choose' | 'finished';
export type MoveKind = 'forward' | 'push';

export const COMEBACK_POINTS: Points = 5;
/** A team unlocks its comeback question when the rival is this close (or closer) to the finish. */
export const COMEBACK_TRIGGER = 4;
export const STEAL_SECONDS = 15;

export interface RaceTeam {
  name: string;
  mascotId: string;
  photoUri: string | null;
  categories: string[];
  position: number;
  comeback: Comeback;
}

export interface Pending {
  categoryId: string;
  questionId: string;
  points: Points;
  /** The team whose turn it is. */
  owner: TeamIdx;
  /** The team answering right now (owner, or the other team when stealing). */
  answering: TeamIdx;
  isComeback: boolean;
}

export interface LastMove {
  team: TeamIdx;
  kind: MoveKind;
  steps: number;
  target: TeamIdx;
}

export interface RaceState {
  laneLength: number;
  teams: [RaceTeam, RaceTeam];
  turn: TeamIdx;
  phase: Phase;
  pending: Pending | null;
  usedQuestionIds: string[];
  winner: TeamIdx | null;
  lastMove: LastMove | null;
}

export const other = (t: TeamIdx): TeamIdx => (t === 0 ? 1 : 0);

export function createRace(
  teams: [Omit<RaceTeam, 'position' | 'comeback'>, Omit<RaceTeam, 'position' | 'comeback'>],
  laneLength: number,
): RaceState {
  return {
    laneLength,
    teams: [
      { ...teams[0], position: 0, comeback: 'locked' },
      { ...teams[1], position: 0, comeback: 'locked' },
    ],
    turn: 0,
    phase: 'pick',
    pending: null,
    usedQuestionIds: [],
    winner: null,
    lastMove: null,
  };
}

/** The team whose turn it is picks a question. */
export function startQuestion(
  s: RaceState,
  q: { categoryId: string; questionId: string; points: Points; isComeback?: boolean },
): RaceState {
  if (s.phase !== 'pick') return s;
  const isComeback = !!q.isComeback;
  if (isComeback && s.teams[s.turn].comeback !== 'available') return s;
  if (isComeback !== (q.points === COMEBACK_POINTS)) return s;
  if (s.usedQuestionIds.includes(q.questionId)) return s;

  const teams = [...s.teams] as [RaceTeam, RaceTeam];
  if (isComeback) teams[s.turn] = { ...teams[s.turn], comeback: 'used' };

  return {
    ...s,
    teams,
    phase: 'question',
    usedQuestionIds: [...s.usedQuestionIds, q.questionId],
    pending: { ...q, isComeback, owner: s.turn, answering: s.turn },
    lastMove: null,
  };
}

/** The host marks the current answer as correct → the answering team chooses a move. */
export function markCorrect(s: RaceState): RaceState {
  if (s.phase !== 'question' && s.phase !== 'steal') return s;
  return { ...s, phase: 'choose' };
}

/** Wrong answer or time out. First miss → the other team may steal. Second miss → turn ends. */
export function markWrong(s: RaceState): RaceState {
  if (!s.pending) return s;
  if (s.phase === 'question') {
    return { ...s, phase: 'steal', pending: { ...s.pending, answering: other(s.pending.owner) } };
  }
  if (s.phase === 'steal') return endTurn(s);
  return s;
}

/** The scoring team moves its own boat forward or pushes the rival back. */
export function chooseMove(s: RaceState, kind: MoveKind): RaceState {
  if (s.phase !== 'choose' || !s.pending) return s;
  const scorer = s.pending.answering;
  const target = kind === 'forward' ? scorer : other(scorer);
  const steps = s.pending.points;
  const teams = [...s.teams] as [RaceTeam, RaceTeam];
  const t = teams[target];
  const position =
    kind === 'forward' ? Math.min(s.laneLength, t.position + steps) : Math.max(0, t.position - steps);
  teams[target] = { ...t, position };

  const lastMove: LastMove = { team: scorer, kind, steps, target };

  if (kind === 'forward' && position >= s.laneLength) {
    return { ...s, teams, phase: 'finished', winner: scorer, pending: null, lastMove };
  }
  return endTurn({ ...s, teams: unlockComebacks(teams, s.laneLength), lastMove });
}

function endTurn(s: RaceState): RaceState {
  const owner = s.pending ? s.pending.owner : s.turn;
  return { ...s, phase: 'pick', pending: null, turn: other(owner) };
}

/** Once the rival is within COMEBACK_TRIGGER steps of the finish, the team's comeback unlocks for good. */
export function unlockComebacks(teams: [RaceTeam, RaceTeam], laneLength: number): [RaceTeam, RaceTeam] {
  return teams.map((t, i) => {
    const rival = teams[other(i as TeamIdx)];
    if (t.comeback === 'locked' && laneLength - rival.position <= COMEBACK_TRIGGER) {
      return { ...t, comeback: 'available' as Comeback };
    }
    return t;
  }) as [RaceTeam, RaceTeam];
}

/** Category picking: teams alternate (A, B, A, B…) until each has `perTeam` distinct categories. */
export function nextPicker(picks: [string[], string[]], perTeam: number): TeamIdx | null {
  const [a, b] = picks;
  if (a.length >= perTeam && b.length >= perTeam) return null;
  if (a.length <= b.length && a.length < perTeam) return 0;
  return 1;
}

export function pickCategory(
  picks: [string[], string[]],
  categoryId: string,
  perTeam: number,
): [string[], string[]] {
  const who = nextPicker(picks, perTeam);
  if (who === null) return picks;
  if (picks[0].includes(categoryId) || picks[1].includes(categoryId)) return picks;
  const next = [[...picks[0]], [...picks[1]]] as [string[], string[]];
  next[who].push(categoryId);
  return next;
}

export function undoPick(picks: [string[], string[]]): [string[], string[]] {
  const [a, b] = picks;
  if (a.length === 0 && b.length === 0) return picks;
  // The last pick was made by B when both have the same count, otherwise by A.
  if (b.length === a.length) return [a, b.slice(0, -1)];
  return [a.slice(0, -1), b];
}
