import { useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { toArabicDigits } from '@/lib/arabic';
import { colors, nativeDriver } from '@/theme';
import { T } from './ui';

const CONFETTI_COLORS = [colors.gold, colors.team[0], colors.team[1], '#22C55E', '#2EA8FF', '#FF5C93'];

export function Confetti({ count = 46 }: { count?: number }) {
  const { width, height } = Dimensions.get('window');
  // Random layout is generated once, in the state initialiser (not during render).
  const [pieces] = useState(() =>
      Array.from({ length: count }).map((_, i) => ({
        x: Math.random() * width,
        delay: Math.random() * 900,
        duration: 2200 + Math.random() * 1600,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 8 + Math.random() * 8,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        round: Math.random() > 0.6,
      })),
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Piece key={i} {...p} height={height} />
      ))}
    </View>
  );
}

function Piece({
  x,
  delay,
  duration,
  color,
  size,
  spin,
  round,
  height,
}: {
  x: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  spin: number;
  round: boolean;
  height: number;
}) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.in(Easing.quad), useNativeDriver: nativeDriver }),
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration, delay]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: -20,
        width: size,
        height: round ? size : size * 0.5,
        borderRadius: round ? size / 2 : 2,
        backgroundColor: color,
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spin}deg`] }) },
        ],
      }}
    />
  );
}

/** Circular countdown. */
export function TimerRing({ seconds, total, color, size = 84 }: { seconds: number; total: number; color: string; size?: number }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, seconds) / total : 0;
  const urgent = seconds <= 5;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`باقي ${seconds} ثانية`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={8} fill="#FFFFFF" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={urgent ? colors.red : color}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <T weight="black" size={size * 0.32} color={urgent ? colors.redDeep : colors.ink} center>
        {toArabicDigits(Math.max(0, seconds))}
      </T>
    </View>
  );
}
