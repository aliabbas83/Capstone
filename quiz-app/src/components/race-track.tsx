import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { RaceState, TeamIdx } from '@/game/engine';
import { colors, nativeDriver, radius } from '@/theme';
import { cheerSize, FinishLine, Flag, Swimmer, SwimmerCheer, swimmerSize } from './race-art';
import { T } from './ui';
import { useReduceMotion } from '@/lib/motion';

/** Head size of the swimmer in a lane. */
const HEAD = 46;
const SWIMMER = swimmerSize(HEAD);
const CHEER = cheerSize(HEAD);
const SQUARE = 11;
/** The finish strip on the left edge of each lane. */
const FINISH = SQUARE * 2;
/** Space between the swimmer's feet and the right wall at the start. */
const WALL = 6;

/**
 * The pool: two lanes, one above the other. Swimmers start on the right and swim left
 * to the finish strip (right to left, like the rest of the app).
 */
export function RaceTrack({ race }: { race: RaceState }) {
  return (
    <View style={styles.track}>
      <Waves />
      <Lane race={race} index={0} />
      <LaneRope />
      <Lane race={race} index={1} />
    </View>
  );
}

function Lane({ race, index }: { race: RaceState; index: TeamIdx }) {
  const team = race.teams[index];
  const L = race.laneLength;
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The swimmer's head is at `startX` on the start line and touches the finish strip at the end.
  const startX = size.w - WALL - SWIMMER.width;
  const travel = Math.max(1, startX - FINISH);
  const step = travel / L;
  const x = useState(() => new Animated.Value(team.position))[0];
  const [swimming, setSwimming] = useState(false);
  const [shownPos, setShownPos] = useState(team.position);
  const isTurn = race.phase !== 'finished' && race.turn === index;
  const isWinner = race.winner === index;
  const still = useReduceMotion();

  // Start swimming as soon as the position changes (state adjusted during render, not in an effect).
  if (shownPos !== team.position) {
    setShownPos(team.position);
    setSwimming(true);
  }

  useEffect(() => {
    Animated.timing(x, {
      toValue: team.position,
      duration: still ? 250 : 900,
      easing: still ? Easing.linear : Easing.out(Easing.cubic),
      useNativeDriver: nativeDriver,
    }).start(() => setSwimming(false));
  }, [team.position, x, still]);

  const translateX = x.interpolate({ inputRange: [0, L], outputRange: [0, -travel] });
  const ready = size.w > 0;
  const midY = size.h / 2 + 6;
  // The winner stops swimming at the wall, stands up in the water and waves.
  const cheering = isWinner && !swimming;

  return (
    <View
      style={[
        styles.lane,
        { borderColor: isTurn ? colors.team[index] : 'rgba(255,255,255,0.55)', borderWidth: isTurn ? 3 : 2 },
      ]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
      }}
      accessible
      accessibilityLabel={`${team.name}: ${team.position} من ${L} خطوة`}
    >
      {ready ? (
        <>
          <View style={{ position: 'absolute', left: 0, top: 0 }}>
            <FinishLine height={size.h} square={SQUARE} />
          </View>
          <View style={{ position: 'absolute', top: 2, left: FINISH + 6 }}>
            <Flag color={colors.team[index]} raised={isWinner} size={30} />
          </View>

          <View style={[styles.nameTag, { borderColor: colors.team[index] }]}>
            <T size={12} weight="black" color={colors.ink} numberOfLines={1}>
              {team.name}
            </T>
          </View>

          {/* a float for every step along the bottom, numbers every 5 */}
          {Array.from({ length: L - 1 }).map((_, k) => {
            const s = k + 1;
            const big = s % 5 === 0;
            return (
              <View key={s} pointerEvents="none" style={[styles.mark, { left: startX - s * step - 12 }]}>
                {big ? (
                  <T size={12} weight="black" color="#FFFFFF" center style={styles.stepNum}>
                    {s}
                  </T>
                ) : null}
                <View style={[styles.buoy, big && styles.buoyBig]} />
              </View>
            );
          })}

          {/* start line */}
          <View pointerEvents="none" style={[styles.startLine, { left: startX }]} />
          <View style={styles.startTag}>
            <T size={12} weight="bold" color={colors.ink} center>
              البداية
            </T>
          </View>

          <Animated.View
            style={{
              position: 'absolute',
              left: startX,
              top: midY - SWIMMER.height / 2,
              width: SWIMMER.width,
              height: SWIMMER.height,
              transform: [{ translateX }],
            }}
          >
            {cheering ? (
              // The head stays where it touched the wall; the body stands up under it.
              <View style={{ position: 'absolute', left: HEAD / 2 - CHEER.width / 2, top: (SWIMMER.height - CHEER.height) / 2 - 4 }}>
                <SwimmerCheer color={colors.team[index]} mascotId={team.mascotId} photoUri={team.photoUri} size={HEAD} />
              </View>
            ) : (
              <Swimmer
                color={colors.team[index]}
                mascotId={team.mascotId}
                photoUri={team.photoUri}
                size={HEAD}
                swimming={swimming}
              />
            )}
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

/** The rope of red and white floats between the two lanes. */
function LaneRope() {
  return (
    <View style={styles.rope} aria-hidden>
      {Array.from({ length: 40 }).map((_, i) => (
        <View key={i} style={[styles.float, { backgroundColor: i % 2 === 0 ? colors.red : '#FFFFFF' }]} />
      ))}
    </View>
  );
}

/** Slow drifting wave marks behind the lanes. */
function Waves() {
  const t = useState(() => new Animated.Value(0))[0];
  const still = useReduceMotion();
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: nativeDriver }),
    );
    loop.start();
    return () => loop.stop();
  }, [t, still]);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
      {Array.from({ length: 18 }).map((_, i) => (
        <View key={i} style={{ position: 'absolute', left: (i % 9) * 60 - 60, top: `${(i * 37 + 9) % 100}%` }}>
          <Svg width={34} height={10}>
            <Path d="M2 8 Q9 1 17 8 T32 8" stroke="rgba(255,255,255,0.45)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          </Svg>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    backgroundColor: colors.sea,
    borderRadius: radius.xl,
    padding: 8,
    gap: 4,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  lane: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  rope: { flexDirection: 'row', height: 8, gap: 3, overflow: 'hidden', paddingHorizontal: 6 },
  float: { width: 14, height: 8, borderRadius: 4 },
  nameTag: {
    position: 'absolute',
    top: 6,
    right: 8,
    maxWidth: '55%',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
  },
  mark: { position: 'absolute', bottom: 5, width: 24, alignItems: 'center' },
  buoy: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.red,
  },
  buoyBig: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.gold, borderColor: colors.ink },
  stepNum: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3 },
  startLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  startTag: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    backgroundColor: colors.sand,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
  },
});
