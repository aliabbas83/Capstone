import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import type { RaceState, TeamIdx } from '@/game/engine';
import { colors, nativeDriver, radius } from '@/theme';
import { cheerSize, FinishLine, Flag, Swimmer, SwimmerCheer, swimmerSize } from './race-art';
import { T } from './ui';
import { useReduceMotion } from '@/lib/motion';

/** Pool water seen from above (generated artwork, 1280 × 720). */
const POOL = require('../../assets/pool/water.jpg');

const SQUARE = 11;
/** The finish strip on the left wall of each lane. */
const FINISH = SQUARE * 2;
/** Space between the swimmer's feet and the right wall at the start. */
const WALL = 6;
/** The pool is a wide rectangle: this tall for its width (when the screen has the room). */
const POOL_SHAPE = 0.74;
/** Deck around the water: thin on the finish side, wider where the names and starting blocks are. */
const DECK = { top: 28, bottom: 28, left: 8, right: 30 };
const ROPE = 8;

/**
 * The pool: a rectangle with a stone deck, two lanes one above the other, a rope of floats
 * between them and starting blocks on the right. Swimmers start on the right and swim left
 * to the finish strip (right to left, like the rest of the app).
 */
export function RaceTrack({ race }: { race: RaceState }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const poolH = Math.min(box.h, Math.round(box.w * POOL_SHAPE));
  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== box.w || height !== box.h) setBox({ w: width, h: height });
      }}
    >
      {box.w > 0 ? (
        <View style={[styles.deck, { height: poolH }]}>
          {/* team names on the deck, each beside its own lane */}
          {([0, 1] as TeamIdx[]).map((i) => (
            <View key={i} style={[styles.nameTag, i === 0 ? { top: 3 } : { bottom: 3 }, { borderColor: colors.team[i] }]}>
              <T size={12} weight="black" color={colors.ink} numberOfLines={1}>
                {race.teams[i].name}
              </T>
            </View>
          ))}

          <View style={styles.water}>
            {/* The flat pool colour shows until the picture loads (or if it can't). */}
            <Image source={POOL} style={styles.waterArt} resizeMode="cover" accessibilityElementsHidden aria-hidden />
            <Lane race={race} index={0} />
            <LaneRope />
            <Lane race={race} index={1} />
          </View>

          {/* starting blocks on the right wall, one per lane */}
          <View style={styles.blocks} pointerEvents="none" aria-hidden>
            {([0, 1] as TeamIdx[]).map((i) => (
              <View key={i} style={styles.blockCell}>
                <View style={styles.block}>
                  <View style={[styles.blockTop, { backgroundColor: colors.team[i] }]} />
                  <T size={12} weight="black" color={colors.ink} center>
                    {i + 1}
                  </T>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Lane({ race, index }: { race: RaceState; index: TeamIdx }) {
  const team = race.teams[index];
  const L = race.laneLength;
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The swimmer shrinks a little on short lanes so the arms stay inside the lane.
  const head = Math.max(30, Math.min(46, Math.floor(size.h * 0.4)));
  const swimmer = swimmerSize(head);
  const cheer = cheerSize(head);
  // The swimmer's head is at `startX` on the start line and touches the finish strip at the end.
  const startX = size.w - WALL - swimmer.width;
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
  const midY = size.h / 2 - 4;
  // The winner stops swimming at the wall, stands up in the water and waves.
  const cheering = isWinner && !swimming;

  return (
    <View
      style={styles.lane}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
      }}
      accessible
      accessibilityLabel={`${team.name}: ${team.position} من ${L} خطوة`}
    >
      {ready ? (
        <>
          {/* the dark line on the pool floor, with a T at each end, like a real lane */}
          <View pointerEvents="none" style={[styles.floorLine, { left: FINISH + 18, right: 18, top: midY - 3 }]} />
          <View pointerEvents="none" style={[styles.floorT, { left: FINISH + 18, top: midY - 14 }]} />
          <View pointerEvents="none" style={[styles.floorT, { right: 18, top: midY - 14 }]} />

          <View style={{ position: 'absolute', left: 0, top: 0 }}>
            <FinishLine height={size.h} square={SQUARE} />
          </View>
          <View style={{ position: 'absolute', top: 2, left: FINISH + 6 }}>
            <Flag color={colors.team[index]} raised={isWinner} size={26} />
          </View>

          {/* a float for every step along the bottom, numbers every 5 */}
          {Array.from({ length: L - 1 }).map((_, k) => {
            const s = k + 1;
            const big = s % 5 === 0;
            return (
              <View key={s} pointerEvents="none" style={[styles.mark, { left: startX - s * step - 12 }]}>
                {big ? (
                  <View style={styles.stepNum}>
                    <T size={11} weight="black" color={colors.ink} center>
                      {s}
                    </T>
                  </View>
                ) : null}
                <View style={[styles.buoy, big && styles.buoyBig]} />
              </View>
            );
          })}

          <Animated.View
            style={{
              position: 'absolute',
              left: startX,
              top: midY - swimmer.height / 2,
              width: swimmer.width,
              height: swimmer.height,
              transform: [{ translateX }],
            }}
          >
            {cheering ? (
              // The head stays where it touched the wall; the body stands up under it.
              <View style={{ position: 'absolute', left: head / 2 - cheer.width / 2, top: (swimmer.height - cheer.height) / 2 - 4 }}>
                <SwimmerCheer color={colors.team[index]} size={head} />
              </View>
            ) : (
              <Swimmer color={colors.team[index]} size={head} swimming={swimming} />
            )}
          </Animated.View>

          {/* whose turn: a frame in the team colour around the lane */}
          {isTurn ? <View pointerEvents="none" style={[styles.turnFrame, { borderColor: colors.team[index] }]} /> : null}
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

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center' },
  // The stone deck around the water.
  deck: {
    backgroundColor: colors.deck,
    borderRadius: radius.sm / 2,
    borderWidth: 2,
    borderColor: colors.deckDeep,
    paddingTop: DECK.top,
    paddingBottom: DECK.bottom,
    paddingLeft: DECK.left,
    paddingRight: DECK.right,
  },
  water: {
    flex: 1,
    backgroundColor: colors.sea,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: 3,
  },
  waterArt: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  lane: { flex: 1, overflow: 'hidden' },
  turnFrame: { ...StyleSheet.absoluteFill, borderWidth: 3 },
  floorLine: { position: 'absolute', height: 6, backgroundColor: colors.floorLine },
  floorT: { position: 'absolute', width: 6, height: 28, backgroundColor: colors.floorLine },
  rope: { flexDirection: 'row', height: ROPE, gap: 2, overflow: 'hidden', backgroundColor: 'rgba(11,37,69,0.25)' },
  float: { width: 14, height: ROPE, borderRadius: 4 },
  nameTag: {
    position: 'absolute',
    right: DECK.right + 4,
    maxWidth: '60%',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
  },
  blocks: { position: 'absolute', right: 3, top: DECK.top, bottom: DECK.bottom, width: DECK.right - 6, gap: ROPE },
  blockCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  block: {
    width: DECK.right - 8,
    height: 38,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.deckDeep,
    overflow: 'hidden',
  },
  blockTop: { height: 10 },
  mark: { position: 'absolute', bottom: 4, width: 24, alignItems: 'center' },
  buoy: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.red,
  },
  buoyBig: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.gold, borderColor: colors.ink },
  stepNum: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radius.pill, minWidth: 20, paddingHorizontal: 4, marginBottom: 1 },
});
