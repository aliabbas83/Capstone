import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Polygon, Rect } from 'react-native-svg';
import { colors, nativeDriver } from '@/theme';
import { MascotBadge } from './mascot-badge';
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
 * Swimmer seen from above, swimming to the left. The head is the team picture and the
 * swimsuit is in the team colour. `swimming` moves the arms and legs.
 */
export function Swimmer({
  color,
  mascotId,
  photoUri,
  size = 40,
  swimming,
}: {
  color: string;
  mascotId: string;
  photoUri: string | null;
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

  const arm = (
    <Svg width={armLen * 2} height={armBox}>
      <Rect x={s * 0.1} y={(armBox - s * 0.19) / 2} width={armLen - s * 0.1} height={s * 0.19} rx={s * 0.095} fill={colors.skin} />
      <Circle cx={s * 0.13} cy={armBox / 2} r={s * 0.12} fill={colors.skin} stroke={colors.skinDeep} strokeWidth={1} />
    </Svg>
  );
  const leg = (
    <Svg width={legLen * 2} height={legBox}>
      <Rect x={legLen} y={s * 0.01} width={legLen - s * 0.02} height={s * 0.18} rx={s * 0.09} fill={colors.skin} />
    </Svg>
  );

  return (
    <View style={{ width, height }} aria-hidden>
      {/* splash behind the feet while swimming */}
      {swimming ? (
        <View style={{ position: 'absolute', left: s * 2.3, top: cy - s * 0.35 }}>
          <Svg width={s * 0.7} height={s * 0.7}>
            <Circle cx={s * 0.2} cy={s * 0.2} r={s * 0.11} fill="rgba(255,255,255,0.85)" />
            <Circle cx={s * 0.48} cy={s * 0.36} r={s * 0.14} fill="rgba(255,255,255,0.7)" />
            <Circle cx={s * 0.24} cy={s * 0.54} r={s * 0.09} fill="rgba(255,255,255,0.85)" />
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

      {/* body: swimsuit in the team colour */}
      <View style={{ position: 'absolute', left: s * 0.86, top: cy - s * 0.33 }}>
        <Svg width={s * 1.1} height={s * 0.66}>
          <Rect x={1} y={1} width={s * 1.1 - 2} height={s * 0.66 - 2} rx={s * 0.3} fill={color} stroke="rgba(11,37,69,0.35)" strokeWidth={1.5} />
          <Rect x={s * 0.52} y={2} width={s * 0.12} height={s * 0.66 - 4} fill="rgba(255,255,255,0.85)" />
        </Svg>
      </View>

      {/* head: the team picture, with the cap rim in the team colour */}
      <View style={{ position: 'absolute', left: 0, top: cy - s / 2 }}>
        <MascotBadge mascotId={mascotId} photoUri={photoUri} size={s} ring={color} />
      </View>
    </View>
  );
}

/** How much room the celebrating swimmer takes for a given head size. */
export const cheerSize = (size: number) => ({ width: size * 2.3, height: size * 2 });

/**
 * The winning swimmer: upright in the water, jumping a little, one arm up and the other waving.
 */
export function SwimmerCheer({
  color,
  mascotId,
  photoUri,
  size = 40,
}: {
  color: string;
  mascotId: string;
  photoUri: string | null;
  size?: number;
}) {
  const s = size;
  const { width, height } = cheerSize(s);
  const cx = width / 2;
  const still = useReduceMotion();
  const wave = useSwing(!still, 230);
  const bob = useSwing(!still, 420);

  const armLen = s * 0.82;
  const armBox = s * 0.28;
  const shoulderY = s * 1.12;
  const jump = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -s * 0.09] });
  const waving = wave.interpolate({ inputRange: [0, 1], outputRange: ['14deg', '58deg'] });

  // Drawn pointing straight up from the shoulder (the middle of the box), then turned.
  const arm = (
    <Svg width={armBox} height={armLen * 2}>
      <Rect x={(armBox - s * 0.2) / 2} y={s * 0.14} width={s * 0.2} height={armLen - s * 0.14} rx={s * 0.1} fill={colors.skin} />
      <Circle cx={armBox / 2} cy={s * 0.14} r={s * 0.13} fill={colors.skin} stroke={colors.skinDeep} strokeWidth={1} />
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

        {/* body: swimsuit in the team colour */}
        <View style={{ position: 'absolute', left: cx - s * 0.55, top: s * 0.9 }}>
          <Svg width={s * 1.1} height={s * 1.0} viewBox="0 0 110 100">
            <Path
              d="M22 6 Q55 -4 88 6 Q104 12 100 34 L92 100 L18 100 L10 34 Q6 12 22 6 Z"
              fill={color}
              stroke="rgba(11,37,69,0.35)"
              strokeWidth={3}
            />
            <Rect x={49} y={4} width={12} height={96} fill="rgba(255,255,255,0.85)" />
          </Svg>
        </View>

        {/* head */}
        <View style={{ position: 'absolute', left: cx - s / 2, top: s * 0.02 }}>
          <MascotBadge mascotId={mascotId} photoUri={photoUri} size={s} ring={color} />
        </View>
      </Animated.View>

      {/* the water around the waist stays put while the swimmer jumps */}
      <View style={{ position: 'absolute', left: cx - s * 1.0, top: s * 1.62 }}>
        <Svg width={s * 2} height={s * 0.38}>
          <Ellipse cx={s} cy={s * 0.19} rx={s * 0.98} ry={s * 0.18} fill="rgba(255,255,255,0.9)" />
          <Ellipse cx={s} cy={s * 0.17} rx={s * 0.7} ry={s * 0.1} fill={colors.seaLight} />
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
