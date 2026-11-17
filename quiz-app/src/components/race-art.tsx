import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Ellipse, Line, Path, Polygon, Rect } from 'react-native-svg';
import { colors, nativeDriver } from '@/theme';
import { MascotBadge } from './mascot-badge';
import { useReduceMotion } from '@/lib/motion';

/** Top-down rowing boat with the team picture on board. Bow points up (towards the finish). */
export function Boat({
  color,
  mascotId,
  photoUri,
  width = 54,
  rowing,
}: {
  color: string;
  mascotId: string;
  photoUri: string | null;
  width?: number;
  rowing?: boolean;
}) {
  const h = width * 1.55;
  const oar = useState(() => new Animated.Value(0))[0];
  const still = useReduceMotion();
  useEffect(() => {
    if (!rowing || still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(oar, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
        Animated.timing(oar, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [rowing, oar, still]);
  const rot = oar.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '14deg'] });
  const rotRev = oar.interpolate({ inputRange: [0, 1], outputRange: ['14deg', '-14deg'] });

  return (
    <View style={{ width: width * 1.6, height: h, alignItems: 'center' }} aria-hidden>
      {/* oars */}
      <Animated.View style={{ position: 'absolute', top: h * 0.52, left: 0, transform: [{ rotate: rot }] }}>
        <Svg width={width * 0.62} height={10}>
          <Line x1={4} y1={5} x2={width * 0.62} y2={5} stroke={colors.woodDeep} strokeWidth={3.5} strokeLinecap="round" />
          <Ellipse cx={6} cy={5} rx={6} ry={4} fill={colors.wood} />
        </Svg>
      </Animated.View>
      <Animated.View style={{ position: 'absolute', top: h * 0.52, right: 0, transform: [{ rotate: rotRev }] }}>
        <Svg width={width * 0.62} height={10}>
          <Line x1={0} y1={5} x2={width * 0.62 - 4} y2={5} stroke={colors.woodDeep} strokeWidth={3.5} strokeLinecap="round" />
          <Ellipse cx={width * 0.62 - 6} cy={5} rx={6} ry={4} fill={colors.wood} />
        </Svg>
      </Animated.View>
      {/* hull */}
      <Svg width={width} height={h} viewBox="0 0 56 87">
        <Ellipse cx={28} cy={82} rx={18} ry={4} fill="rgba(255,255,255,0.55)" />
        <Path d="M28 2 C41 16 46 33 46 53 C46 68 39 79 28 83 C17 79 10 68 10 53 C10 33 15 16 28 2 Z" fill={colors.wood} stroke={colors.woodDeep} strokeWidth={2.5} />
        <Path d="M28 10 C37 22 40 36 40 53 C40 64 35 72 28 75 C21 72 16 64 16 53 C16 36 19 22 28 10 Z" fill={color} />
        <Rect x={15} y={55} width={26} height={5} rx={2.5} fill={colors.woodDeep} />
      </Svg>
      <View style={{ position: 'absolute', top: h * 0.2 }}>
        <MascotBadge mascotId={mascotId} photoUri={photoUri} size={width * 0.56} ring="#FFFFFF" />
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

/** Black-and-white finish strip. */
export function FinishLine({ width, squares = 10 }: { width: number; squares?: number }) {
  const s = width / squares;
  return (
    <Svg width={width} height={s * 2}>
      {Array.from({ length: squares * 2 }).map((_, i) => {
        const col = i % squares;
        const row = Math.floor(i / squares);
        return (
          <Rect key={i} x={col * s} y={row * s} width={s} height={s} fill={(col + row) % 2 === 0 ? colors.ink : '#FFFFFF'} />
        );
      })}
    </Svg>
  );
}
