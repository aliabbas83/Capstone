import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Polygon, Rect } from 'react-native-svg';
import { colors, nativeDriver } from '@/theme';
import { useReduceMotion } from '@/lib/motion';

/** A value that goes 0 → 1 → 0 for ever while `on` is true (and rests at 0 otherwise). */
function useSwing(on: boolean, halfMs: number) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!on) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: halfMs, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
        Animated.timing(v, { toValue: 0, duration: halfMs, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      v.setValue(0);
    };
  }, [on, v, halfMs]);
  return v;
}

/** How much room a swimmer takes for a given head size (the swimmer faces left, towards the finish). */
export const swimmerSize = (size: number) => ({ width: size * 2.6, height: size * 1.3 });

/**
 * Hand-drawn look: every shape has a dark ink outline with rounded ends, the lines wobble a
 * little like a marker drawing, and the stripes and shading are drawn as loose strokes.
 */
const INK = colors.ink;
const pen = { stroke: INK, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const WOBBLY_HEAD = 'M50 6 C74 4 96 24 94 51 C93 77 73 96 49 94 C24 95 5 75 6 49 C6 23 27 7 50 6 Z';

/**
 * Swimmer seen from above, swimming to the left, drawn by hand. The swim cap and the swimsuit
 * are in the team colour. `swimming` moves the arms and legs.
 */
export function Swimmer({
  color,
  size = 40,
  swimming,
}: {
  color: string;
  /** Head size. The whole swimmer is 2.6 × this long. */
  size?: number;
  swimming?: boolean;
}) {
  const s = size;
  const { width, height } = swimmerSize(s);
  const cy = height / 2;
  const still = useReduceMotion();
  const stroke = useSwing(!!swimming && !still, 360);

  const armLen = s * 0.72;
  const armBox = s * 0.26;
  const shoulderX = s * 1.12;
  const legLen = s * 0.72;
  const legBox = s * 0.2;
  const hipX = s * 1.8;

  // Arms swing from "reaching forward" to "back along the body", one after the other.
  const upperArm = stroke.interpolate({ inputRange: [0, 1], outputRange: ['50deg', '165deg'] });
  const lowerArm = stroke.interpolate({ inputRange: [0, 1], outputRange: ['-165deg', '-50deg'] });
  const kickA = stroke.interpolate({ inputRange: [0, 1], outputRange: ['-11deg', '11deg'] });
  const kickB = stroke.interpolate({ inputRange: [0, 1], outputRange: ['11deg', '-11deg'] });

  // Drawn pointing left from the shoulder (the middle of the box), then turned.
  const arm = (
    <Svg width={armLen * 2} height={armBox} viewBox="0 0 200 36">
      <Path
        d="M100 9 C80 6 54 9 31 10 C20 6 6 9 5 18 C4 28 19 30 31 26 C55 29 80 30 100 27 Z"
        fill={colors.skin}
        strokeWidth={4.5}
        {...pen}
      />
      <Path d="M14 13 L20 15 M12 19 L19 19" fill="none" strokeWidth={2.5} strokeOpacity={0.55} {...pen} />
    </Svg>
  );
  // Drawn pointing right from the hip, with a little foot at the end.
  const leg = (
    <Svg width={legLen * 2} height={legBox} viewBox="0 0 200 28">
      <Path
        d="M100 5 C126 3 150 6 171 7 C186 4 197 8 196 15 C195 23 184 24 171 21 C150 23 126 25 100 23 Z"
        fill={colors.skin}
        strokeWidth={4.5}
        {...pen}
      />
    </Svg>
  );

  return (
    <View style={{ width, height }} aria-hidden>
      {/* splash behind the feet while swimming: loose strokes and drops */}
      {swimming ? (
        <View style={{ position: 'absolute', left: s * 2.25, top: cy - s * 0.4 }}>
          <Svg width={s * 0.8} height={s * 0.8} viewBox="0 0 80 80">
            <Path d="M8 22 C20 12 30 14 40 6" fill="none" stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" />
            <Path d="M10 58 C24 66 34 62 46 72" fill="none" stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" />
            <Path d="M24 40 C36 38 44 42 56 38" fill="none" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
            <Circle cx={56} cy={16} r={5} fill="#FFFFFF" strokeWidth={2} {...pen} />
            <Circle cx={66} cy={50} r={6.5} fill="#FFFFFF" strokeWidth={2} {...pen} />
            <Circle cx={52} cy={62} r={3.5} fill="#FFFFFF" strokeWidth={2} {...pen} />
          </Svg>
        </View>
      ) : null}

      {/* legs */}
      <Animated.View style={{ position: 'absolute', left: hipX - legLen, top: cy - s * 0.14 - legBox / 2, transform: [{ rotate: kickA }] }}>
        {leg}
      </Animated.View>
      <Animated.View style={{ position: 'absolute', left: hipX - legLen, top: cy + s * 0.14 - legBox / 2, transform: [{ rotate: kickB }] }}>
        {leg}
      </Animated.View>

      {/* arms (under the body, so the shoulders are covered) */}
      <Animated.View style={{ position: 'absolute', left: shoulderX - armLen, top: cy - s * 0.3 - armBox / 2, transform: [{ rotate: upperArm }] }}>
        {arm}
      </Animated.View>
      <Animated.View style={{ position: 'absolute', left: shoulderX - armLen, top: cy + s * 0.3 - armBox / 2, transform: [{ rotate: lowerArm }] }}>
        {arm}
      </Animated.View>

      {/* body: swimsuit in the team colour, with hand-drawn stripes and a few shading strokes */}
      <View style={{ position: 'absolute', left: s * 0.86, top: cy - s * 0.33 }}>
        <Svg width={s * 1.1} height={s * 0.66} viewBox="0 0 110 66">
          <Path
            d="M22 5 C41 2 72 3 90 6 C102 9 107 21 106 34 C106 48 100 59 88 61 C69 64 40 63 22 60 C9 57 4 46 4 33 C4 19 10 8 22 5 Z"
            fill={color}
            strokeWidth={3.5}
            {...pen}
          />
          <Path d="M50 7 C46 23 54 44 49 60" fill="none" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" />
          <Path d="M66 7 C69 24 62 42 67 60" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
          <Path d="M80 46 L88 53 M72 49 L80 56 M88 40 L95 46" fill="none" strokeWidth={2} strokeOpacity={0.3} {...pen} />
        </Svg>
      </View>

      {/* head from above: the swim cap in the team colour, a little forehead at the front */}
      <View style={{ position: 'absolute', left: 0, top: cy - s / 2 }}>
        <Svg width={s} height={s} viewBox="0 0 100 100">
          <Path d={WOBBLY_HEAD} fill={colors.skin} strokeWidth={4.5} {...pen} />
          <Path d="M38 9 C61 1 94 22 93 51 C93 78 60 98 38 91 C27 70 28 30 38 9 Z" fill={color} strokeWidth={4.5} {...pen} />
          <Path d="M36 50 C55 46 75 54 92 50" fill="none" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" />
          <Path d="M44 27 C60 22 76 26 86 34" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeOpacity={0.9} />
          <Path d="M44 73 C60 78 76 74 86 66" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeOpacity={0.9} />
        </Svg>
      </View>
    </View>
  );
}

/** How much room the celebrating swimmer takes for a given head size. */
export const cheerSize = (size: number) => ({ width: size * 2.3, height: size * 2 });

/**
 * The winning swimmer, drawn by hand: upright in the water, jumping a little, one arm up and
 * the other waving, goggles pushed up on the cap and a big smile.
 */
export function SwimmerCheer({ color, size = 40 }: { color: string; size?: number }) {
  const s = size;
  const { width, height } = cheerSize(s);
  const cx = width / 2;
  const still = useReduceMotion();
  const wave = useSwing(!still, 230);
  const bob = useSwing(!still, 420);

  const armLen = s * 0.82;
  const armBox = s * 0.3;
  const shoulderY = s * 1.12;
  const jump = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -s * 0.09] });
  const waving = wave.interpolate({ inputRange: [0, 1], outputRange: ['14deg', '58deg'] });

  // Drawn pointing straight up from the shoulder (the middle of the box), then turned.
  const arm = (
    <Svg width={armBox} height={armLen * 2} viewBox="0 0 36 200">
      <Path
        d="M9 100 C6 80 9 54 10 31 C6 20 9 6 18 5 C28 4 30 19 26 31 C29 55 30 80 27 100 Z"
        fill={colors.skin}
        strokeWidth={4}
        {...pen}
      />
      <Path d="M13 10 L14 18 M18 8 L18 17 M23 10 L22 18" fill="none" strokeWidth={2.2} strokeOpacity={0.55} {...pen} />
    </Svg>
  );

  return (
    <View style={{ width, height }} aria-hidden>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width, height, transform: [{ translateY: jump }] }}>
        {/* arms: left one held up, right one waving */}
        <View style={{ position: 'absolute', left: cx - s * 0.42 - armBox / 2, top: shoulderY - armLen, transform: [{ rotate: '-32deg' }] }}>
          {arm}
        </View>
        <Animated.View style={{ position: 'absolute', left: cx + s * 0.42 - armBox / 2, top: shoulderY - armLen, transform: [{ rotate: waving }] }}>
          {arm}
        </Animated.View>

        {/* body: swimsuit in the team colour, with hand-drawn stripes */}
        <View style={{ position: 'absolute', left: cx - s * 0.55, top: s * 0.9 }}>
          <Svg width={s * 1.1} height={s * 1.0} viewBox="0 0 110 100">
            <Path
              d="M24 7 C44 1 68 2 87 7 C101 12 104 24 101 36 L93 100 L17 100 L9 36 C6 23 10 11 24 7 Z"
              fill={color}
              strokeWidth={3.5}
              {...pen}
            />
            <Path d="M48 6 C44 36 52 70 47 100" fill="none" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" />
            <Path d="M64 6 C67 36 60 68 65 100" fill="none" stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" />
            <Path d="M80 62 L88 70 M76 72 L85 81 M82 50 L90 57" fill="none" strokeWidth={2.2} strokeOpacity={0.3} {...pen} />
          </Svg>
        </View>

        {/* head: a happy face, goggles pushed up on a swim cap in the team colour */}
        <View style={{ position: 'absolute', left: cx - s / 2, top: s * 0.02 }}>
          <Svg width={s} height={s} viewBox="0 0 100 100">
            <Path d={WOBBLY_HEAD} fill={colors.skin} strokeWidth={4.5} {...pen} />
            <Path d="M7 47 C5 22 28 5 50 5 C73 4 96 22 93 47 C70 35 30 36 7 47 Z" fill={color} strokeWidth={4.5} {...pen} />
            <Path d="M50 7 C47 17 53 26 50 36" fill="none" stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" />
            {/* goggles */}
            <Path d="M9 41 C30 29 70 29 91 41" fill="none" strokeWidth={3.5} {...pen} />
            <Ellipse cx={35} cy={32} rx={10} ry={7} fill="#CFEFFF" strokeWidth={3.5} {...pen} />
            <Ellipse cx={65} cy={32} rx={10} ry={7} fill="#CFEFFF" strokeWidth={3.5} {...pen} />
            {/* face */}
            <Circle cx={24} cy={69} r={7} fill="#FF9C8A" fillOpacity={0.75} />
            <Circle cx={76} cy={69} r={7} fill="#FF9C8A" fillOpacity={0.75} />
            <Path d="M29 51 Q36 46 43 51 M57 51 Q64 46 71 51" fill="none" strokeWidth={3} {...pen} />
            <Circle cx={36} cy={59} r={4.8} fill={INK} />
            <Circle cx={64} cy={59} r={4.8} fill={INK} />
            <Circle cx={37.5} cy={57.5} r={1.4} fill="#FFFFFF" />
            <Circle cx={65.5} cy={57.5} r={1.4} fill="#FFFFFF" />
            <Path d="M33 69 Q50 91 67 69 Q50 75 33 69 Z" fill={INK} strokeWidth={3} {...pen} />
            <Path d="M41 73 Q50 76 59 73" fill="none" stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" />
          </Svg>
        </View>
      </Animated.View>

      {/* the water around the waist stays put while the swimmer jumps */}
      <View style={{ position: 'absolute', left: cx - s * 1.0, top: s * 1.6 }}>
        <Svg width={s * 2} height={s * 0.42} viewBox="0 0 200 42">
          <Path
            d="M6 22 C8 9 54 3 100 4 C148 3 193 10 194 22 C194 34 146 39 100 38 C52 39 6 34 6 22 Z"
            fill="#FFFFFF"
            strokeWidth={3}
            {...pen}
          />
          <Path d="M32 21 C40 14 160 13 168 21 C160 28 40 29 32 21 Z" fill={colors.seaLight} />
          <Path d="M46 21 Q54 16 62 21 T78 21 M122 21 Q130 16 138 21 T154 21" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
        </Svg>
      </View>
    </View>
  );
}

/** Finish flag on a pole. `raised` animates it up the pole and makes it wave. */
export function Flag({ color, raised, size = 44 }: { color: string; raised: boolean; size?: number }) {
  const up = useState(() => new Animated.Value(raised ? 1 : 0))[0];
  const wave = useState(() => new Animated.Value(0))[0];
  const still = useReduceMotion();
  useEffect(() => {
    Animated.spring(up, { toValue: raised ? 1 : 0, friction: 5, useNativeDriver: nativeDriver }).start();
    if (!raised || still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wave, { toValue: 1, duration: 380, useNativeDriver: nativeDriver }),
        Animated.timing(wave, { toValue: 0, duration: 380, useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [raised, up, wave, still]);
  const poleH = size * 1.4;
  const flagH = size * 0.5;
  return (
    <View style={{ width: size, height: poleH }} aria-hidden>
      <View style={{ position: 'absolute', left: 2, top: 0, width: 4, height: poleH, borderRadius: 2, backgroundColor: colors.ink }} />
      <View style={{ position: 'absolute', left: 0, top: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold }} />
      <Animated.View
        style={{
          position: 'absolute',
          left: 6,
          transform: [
            { translateY: up.interpolate({ inputRange: [0, 1], outputRange: [poleH - flagH - 2, 2] }) },
            { scaleX: wave.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) },
          ],
        }}
      >
        <Svg width={size - 6} height={flagH} viewBox="0 0 38 22">
          <Polygon points="0,0 38,4 30,11 38,18 0,22" fill={color} stroke={colors.ink} strokeWidth={1.5} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Black-and-white finish strip, two squares wide, standing at the end of a lane. */
export function FinishLine({ height, square = 11 }: { height: number; square?: number }) {
  const rows = Math.max(1, Math.ceil(height / square));
  return (
    <Svg width={square * 2} height={height}>
      {Array.from({ length: rows * 2 }).map((_, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        return (
          <Rect key={i} x={col * square} y={row * square} width={square} height={square} fill={(col + row) % 2 === 0 ? colors.ink : '#FFFFFF'} />
        );
      })}
    </Svg>
  );
}
