import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PauseIcon, UndoIcon } from '@/components/icons';
import { MascotBadge } from '@/components/mascot-badge';
import { ChooseOverlay, PauseMenu, PickPanel, QuestionOverlay, WinnerOverlay } from '@/components/race-overlays';
import { RaceTrack } from '@/components/race-track';
import { FadeIn, haptic, IconButton, PopIn, Row, Screen, T } from '@/components/ui';
import type { RaceState, TeamIdx } from '@/game/engine';
import { useGame } from '@/game/game-store';
import { useRaceSounds } from '@/game/use-race-sounds';
import { useReduceMotion } from '@/lib/motion';
import { playLater } from '@/lib/sound';
import { colors, radius, ROW, shadow } from '@/theme';

/** The host's last call, so the undo button can say exactly what it takes back. */
type Call = 'correct' | 'wrong' | 'toSteal' | 'forward' | 'push';
const CALL_LABELS: Record<Call, string> = {
  correct: '«صح»',
  wrong: '«خطأ»',
  toSteal: 'نقل السؤال للسرقة',
  forward: 'التقدّم',
  push: 'إرجاع السبّاح',
};
const UNDO_SECONDS = 6;
const BANNER_MS = 1600;

/** Shown for a moment when the turn passes, so everyone knows whose turn it is before they pick. */
type Banner = { turn: TeamIdx; kind: 'start' | 'turn' | 'nobody'; id: number };

export default function Race() {
  const game = useGame();
  const { race, question, timerSeconds, reopened } = game.state;
  const [paused, setPaused] = useState(false);
  const [ending, setEnding] = useState(false);
  const [lastCall, setLastCall] = useState<Call | null>(null);
  const still = useReduceMotion();
  useRaceSounds(race);

  // Android back button opens / closes the pause menu instead of leaving the race,
  // but only while this screen is in front (not under "how to play").
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setPaused((p) => !p);
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  // Turn banner: worked out while rendering from the previous race (React's "previous value" pattern).
  const [prevRace, setPrevRace] = useState<RaceState | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  if (race !== prevRace) {
    setPrevRace(race);
    if (race && race.phase === 'pick' && prevRace?.phase !== 'pick') {
      const kind = !prevRace ? 'start' : prevRace.phase === 'steal' ? 'nobody' : 'turn';
      setBanner({ turn: race.turn, kind, id: (banner?.id ?? 0) + 1 });
    }
  }
  const bannerId = banner?.id;
  useEffect(() => {
    if (bannerId === undefined) return;
    if (!still) playLater('chime', 500);
    const t = setTimeout(() => setBanner(null), still ? BANNER_MS + 600 : BANNER_MS);
    return () => clearTimeout(t);
  }, [bannerId, still]);

  // Let the last swimmer arrive, raise the flag and wave before the winner card covers the pool.
  const finished = race?.phase === 'finished';
  const [winnerFor, setWinnerFor] = useState<typeof race>(null);
  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(() => setWinnerFor(race), still ? 600 : 2400);
    return () => clearTimeout(id);
  }, [finished, race, still]);

  if (!race) return <Redirect href="/" />;

  const playAgain = () => {
    setPaused(false);
    game.playAgain();
    router.replace('/setup/categories');
  };
  const changeTeams = () => {
    setPaused(false);
    game.changeTeams();
    router.replace('/setup/teams');
  };
  const end = async () => {
    if (ending) return;
    // A finished free demo goes home with a short note on what the full game adds.
    const demoDone = game.state.mode === 'demo' && finished;
    const home = game.state.mode === 'real' ? '/lobby' : demoDone ? '/?after=demo' : '/';
    setEnding(true);
    try {
      await game.endGame(); // saves an unfinished real game first, so the lobby shows it right
    } finally {
      setEnding(false);
      setPaused(false);
      router.replace(home);
    }
  };

  const asking = (race.phase === 'question' || race.phase === 'steal') && question;
  // Undo of "صح" or of a "خطأ" after the reveal brings the card back with the answer showing.
  const startRevealed = reopened && lastCall !== 'toSteal';
  const undoStamp = `${race.phase}:${race.turn}:${race.usedQuestionIds.length}:${race.teams[0].position}:${race.teams[1].position}`;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Row style={styles.top}>
        <IconButton label="إيقاف مؤقت" onPress={() => setPaused(true)}>
          <PauseIcon />
        </IconButton>
        <Scoreboard race={race} />
      </Row>

      <View style={styles.trackWrap}>
        <RaceTrack race={race} />
      </View>

      {race.phase === 'pick' ? (
        <PickPanel
          key={`${race.turn}-${race.usedQuestionIds.length}`}
          race={race}
          categories={game.categories}
          remaining={game.remaining}
          busy={game.asking}
          error={game.askError}
          onAsk={(c, p, comeback) => {
            game.ask(c, p, comeback);
          }}
          onMenu={() => setPaused(true)}
          onCategoryChange={game.clearAskError}
        />
      ) : (
        <View style={styles.panelSpacer} />
      )}

      {race.phase === 'pick' && banner ? <TurnBanner key={banner.id} race={race} banner={banner} /> : null}

      {asking ? (
        <QuestionOverlay
          key={`${question.id}-${race.phase}-${reopened}`}
          race={race}
          question={question}
          category={game.categoryById[question.categoryId]}
          timerSeconds={timerSeconds}
          paused={paused}
          startRevealed={startRevealed}
          canSwap={game.remaining(question.categoryId, question.points) > 0}
          onLifeline={game.lifeline}
          onCorrect={() => {
            setLastCall('correct');
            game.correct();
          }}
          onWrong={(revealed) => {
            setLastCall(revealed ? 'wrong' : 'toSteal');
            game.wrong();
          }}
        />
      ) : null}
      {race.phase === 'choose' ? (
        <ChooseOverlay
          race={race}
          onChoose={(kind) => {
            setLastCall(kind);
            game.choose(kind);
          }}
        />
      ) : null}
      {finished && winnerFor === race ? (
        <WinnerOverlay race={race} onPlayAgain={playAgain} onChangeTeams={changeTeams} onEnd={end} ending={ending} />
      ) : null}
      {game.canUndo && lastCall && !paused ? (
        <UndoBar key={undoStamp} label={`تراجع عن ${CALL_LABELS[lastCall]}`} onUndo={game.undo} />
      ) : null}
      {paused && !(finished && winnerFor === race) ? (
        <PauseMenu
          real={game.state.mode === 'real'}
          ending={ending}
          onResume={() => setPaused(false)}
          onPlayAgain={playAgain}
          onChangeTeams={changeTeams}
          onEnd={end}
          onHowTo={() => router.push('/how-to-play')}
        />
      ) : null}
    </Screen>
  );
}

/** "Undo" for a few seconds after each call (صح / خطأ / move), above everything else. */
function UndoBar({ label, onUndo }: { label: string; onUndo: () => void }) {
  const [visible, setVisible] = useState(true);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), UNDO_SECONDS * 1000);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <View pointerEvents="box-none" style={[styles.undoWrap, { top: insets.top + 74 }]}>
      <FadeIn from={-12}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="يرجّع اللعبة خطوة وحدة لورا"
          onPress={() => {
            haptic();
            onUndo();
          }}
          style={({ pressed }) => [styles.undo, pressed && { transform: [{ scale: 0.96 }] }]}
        >
          <UndoIcon size={20} color="#FFFFFF" />
          <T weight="black" size={15} color="#FFFFFF">
            {label}
          </T>
        </Pressable>
      </FadeIn>
    </View>
  );
}

function TurnBanner({ race, banner }: { race: RaceState; banner: Banner }) {
  const t = race.teams[banner.turn];
  const line = banner.kind === 'start' ? `يبدأ ${t.name}` : `دور ${t.name}`;
  return (
    <View pointerEvents="none" style={styles.bannerWrap}>
      <PopIn>
        <View
          style={[styles.banner, { borderColor: colors.team[banner.turn] }]}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={banner.kind === 'nobody' ? `ولا أحد عرفها. ${line}` : line}
        >
          {banner.kind === 'nobody' ? (
            <T weight="bold" size={16} center color={colors.inkSoft}>
              ولا أحد عرفها
            </T>
          ) : null}
          <MascotBadge mascotId={t.mascotId} photoUri={t.photoUri} size={64} ring={colors.team[banner.turn]} />
          <T weight="black" size={26} center>
            {line}
          </T>
        </View>
      </PopIn>
    </View>
  );
}

function Scoreboard({ race }: { race: RaceState }) {
  return (
    <Row style={{ flex: 1, gap: 8 }}>
      {([0, 1] as TeamIdx[]).map((i) => {
        const t = race.teams[i];
        const active = race.phase !== 'finished' && race.turn === i;
        return (
          <View
            key={i}
            style={[
              styles.score,
              { borderColor: active ? colors.team[i] : 'transparent', backgroundColor: active ? colors.teamSoft[i] : colors.card },
            ]}
            accessible
            accessibilityLabel={`${t.name}، ${t.position} من ${race.laneLength}${active ? '، دورهم' : ''}${
              t.comeback === 'available' ? '، عندهم سؤال الإنقاذ' : ''
            }`}
          >
            <Row style={{ gap: 6 }}>
              <MascotBadge mascotId={t.mascotId} photoUri={t.photoUri} size={30} ring={colors.team[i]} />
              <View style={{ flex: 1 }}>
                <T weight="black" size={13} numberOfLines={1}>
                  {t.name}
                </T>
                <Row style={{ gap: 6 }}>
                  <T weight="black" size={13} color={colors.teamDeep[i]}>
                    {t.position}/{race.laneLength}
                  </T>
                  {t.comeback === 'available' ? (
                    <View style={styles.comebackPill}>
                      <T weight="black" size={11} color={colors.gold}>
                        إنقاذ +5
                      </T>
                    </View>
                  ) : null}
                </Row>
              </View>
            </Row>
            {active ? (
              <View style={[styles.turnTag, { backgroundColor: colors.team[i] }]}>
                <T size={14} weight="black" color={colors.onTeam[i]} center>
                  دورهم
                </T>
              </View>
            ) : null}
          </View>
        );
      })}
    </Row>
  );
}

const styles = StyleSheet.create({
  top: { gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
  trackWrap: { flex: 1, paddingHorizontal: 12, paddingBottom: 10 },
  panelSpacer: { height: 24 },
  score: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 2.5,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  turnTag: { position: 'absolute', top: -12, left: 8, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 1 },
  comebackPill: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 6 },
  undoWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  undo: {
    flexDirection: ROW,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    minHeight: 48,
    ...shadow,
  },
  bannerWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  banner: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 4,
    borderRadius: radius.xl,
    paddingHorizontal: 28,
    paddingVertical: 18,
    minWidth: 220,
    ...shadow,
  },
});
