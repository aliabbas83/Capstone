import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { PauseIcon } from '@/components/icons';
import { MascotBadge } from '@/components/mascot-badge';
import { ChooseOverlay, PauseMenu, PickPanel, QuestionOverlay, WinnerOverlay } from '@/components/race-overlays';
import { RaceTrack } from '@/components/race-track';
import { IconButton, Row, Screen, T } from '@/components/ui';
import type { RaceState, TeamIdx } from '@/game/engine';
import { useGame } from '@/game/game-store';
import { useRaceSounds } from '@/game/use-race-sounds';
import { toArabicDigits } from '@/lib/arabic';
import { useReduceMotion } from '@/lib/motion';
import { colors, radius } from '@/theme';

export default function Race() {
  const game = useGame();
  const { race, question, timerSeconds } = game.state;
  const [paused, setPaused] = useState(false);
  const [ending, setEnding] = useState(false);
  const still = useReduceMotion();
  useRaceSounds(race);

  // Android back button opens / closes the pause menu instead of leaving the race.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPaused((p) => !p);
      return true;
    });
    return () => sub.remove();
  }, []);

  // Let the last boat move and the lane flag rise before the winner card covers the sea.
  const finished = race?.phase === 'finished';
  const [winnerFor, setWinnerFor] = useState<typeof race>(null);
  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(() => setWinnerFor(race), still ? 300 : 1400);
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
    const home = game.state.mode === 'real' ? '/lobby' : '/';
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

      {asking ? (
        <QuestionOverlay
          key={`${question.id}-${race.phase}`}
          race={race}
          question={question}
          category={game.categoryById[question.categoryId]}
          timerSeconds={timerSeconds}
          paused={paused}
          onCorrect={game.correct}
          onWrong={game.wrong}
        />
      ) : null}
      {race.phase === 'choose' ? <ChooseOverlay race={race} onChoose={game.choose} /> : null}
      {finished && winnerFor === race ? (
        <WinnerOverlay race={race} onPlayAgain={playAgain} onChangeTeams={changeTeams} onEnd={end} ending={ending} />
      ) : null}
      {paused && !(finished && winnerFor === race) ? (
        <PauseMenu
          real={game.state.mode === 'real'}
          ending={ending}
          onResume={() => setPaused(false)}
          onPlayAgain={playAgain}
          onChangeTeams={changeTeams}
          onEnd={end}
        />
      ) : null}
    </Screen>
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
                <T weight="black" size={13} color={colors.teamDeep[i]}>
                  {toArabicDigits(t.position)}/{toArabicDigits(race.laneLength)}
                  {t.comeback === 'available' ? '  ⭐٥' : ''}
                </T>
              </View>
            </Row>
            {active ? (
              <View style={[styles.turnTag, { backgroundColor: colors.team[i] }]}>
                <T size={12} weight="black" color={colors.onTeam[i]} center>
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
  top: { gap: 10, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  trackWrap: { flex: 1, paddingHorizontal: 12, paddingBottom: 10 },
  panelSpacer: { height: 24 },
  score: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 2.5,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  turnTag: { position: 'absolute', top: -9, left: 10, borderRadius: radius.pill, paddingHorizontal: 8 },
});
