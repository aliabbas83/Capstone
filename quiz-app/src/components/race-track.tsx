import { useEffect, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { RaceState, TeamIdx } from '@/game/engine';
import { toArabicDigits } from '@/lib/arabic';
import { colors, nativeDriver, radius, ROW } from '@/theme';
import { Boat, FinishLine, Flag } from './race-art';
import { T } from './ui';
import { useReduceMotion } from '@/lib/motion';

const TOP = 54; // finish strip + flag
const BOTTOM = 70; // start area under the boat
const BOAT_W = 50;
const BOAT_H = BOAT_W * 1.55;

export function RaceTrack({ race }: { race: RaceState }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };
  const ready = size.h > 0;
  return (
    <View style={styles.track} onLayout={onLayout}>
      <Waves />
      {ready ? (
        <View style={{ flex: 1, flexDirection: ROW, gap: 10 }}>
          {([0, 1] as TeamIdx[]).map((i) => (
            <Lane key={i} race={race} index={i} height={size.h - 16} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Lane({ race, index, height }: { race: RaceState; index: TeamIdx; height: number }) {
  const team = race.teams[index];
  const L = race.laneLength;
  const travel = Math.max(1, height - TOP - BOTTOM);
  const step = travel / L;
  const y = useState(() => new Animated.Value(team.position))[0];
  const [rowing, setRowing] = useState(false);
  const [shownPos, setShownPos] = useState(team.position);
  const [laneW, setLaneW] = useState(0);
  const isTurn = race.phase !== 'finished' && race.turn === index;
  const isWinner = race.winner === index;
  const still = useReduceMotion();

  // Start rowing as soon as the position changes (state adjusted during render, not in an effect).
  if (shownPos !== team.position) {
    setShownPos(team.position);
    setRowing(true);
  }

  useEffect(() => {
    Animated.timing(y, {
      toValue: team.position,
      duration: still ? 250 : 900,
      easing: still ? Easing.linear : Easing.out(Easing.back(1.2)),
      useNativeDriver: nativeDriver,
    }).start(() => setRowing(false));
  }, [team.position, y, still]);

  const translateY = y.interpolate({ inputRange: [0, L], outputRange: [0, -travel] });

  return (
    <View
      style={[
        styles.lane,
        { borderColor: isTurn ? colors.team[index] : 'rgba(255,255,255,0.55)', borderWidth: isTurn ? 3 : 2 },
      ]}
      onLayout={(e) => setLaneW(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`${team.name}: ${team.position} من ${L} خطوة`}
    >
      {laneW > 0 ? (
        <View style={{ position: 'absolute', top: 30, left: 0, right: 0, alignItems: 'center' }}>
          <FinishLine width={laneW - 4} squares={10} />
        </View>
      ) : null}
      <View style={{ position: 'absolute', top: -6, left: 6 }}>
        <Flag color={colors.team[index]} raised={isWinner} size={34} />
      </View>

      {/* buoys for every step, numbers every 5 */}
      {Array.from({ length: L - 1 }).map((_, k) => {
        const s = k + 1;
        const top = height - BOTTOM - s * step - 4;
        const big = s % 5 === 0;
        return (
          <View key={s} pointerEvents="none" style={[styles.buoyRow, { top }]}>
            <View style={[styles.buoy, big && styles.buoyBig]} />
            {big ? (
              <T size={12} weight="black" color="#FFFFFF" style={styles.stepNum}>
                {toArabicDigits(s)}
              </T>
            ) : null}
            <View style={[styles.buoy, big && styles.buoyBig]} />
          </View>
        );
      })}

      <View style={styles.startTag}>
        <T size={12} weight="bold" color={colors.ink} center>
          البداية
        </T>
      </View>

      <Animated.View
        style={{
          position: 'absolute',
          bottom: BOTTOM - BOAT_H / 2,
          alignSelf: 'center',
          transform: [{ translateY }],
        }}
      >
        <Boat color={colors.team[index]} mascotId={team.mascotId} photoUri={team.photoUri} width={BOAT_W} rowing={rowing} />
      </Animated.View>
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
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateY }] }]}>
      {Array.from({ length: 16 }).map((_, i) => (
        <View key={i} style={{ position: 'absolute', top: i * 60, left: (i * 53) % 280 }}>
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
  buoyRow: {
    position: 'absolute',
    left: 4,
    right: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buoy: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.red,
  },
  buoyBig: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.gold, borderColor: colors.ink },
  stepNum: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 3,
  },
  startTag: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    backgroundColor: colors.sand,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
  },
});
