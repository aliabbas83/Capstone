import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { play } from '@/lib/sound';
import { colors, fonts, nativeDriver, radius, ROW, shadow, TEXT_START } from '@/theme';
import { useReduceMotion } from '@/lib/motion';

export function haptic(kind: 'tap' | 'success' | 'warning' | 'heavy' = 'tap') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else if (kind === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

type Weight = keyof typeof fonts;

export function T({
  weight = 'bold',
  size = 16,
  color = colors.ink,
  center,
  style,
  ...rest
}: TextProps & { weight?: Weight; size?: number; color?: string; center?: boolean }) {
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: fonts[weight],
          fontSize: size,
          lineHeight: Math.round(size * 1.6),
          color,
          textAlign: center ? 'center' : TEXT_START,
          writingDirection: 'rtl',
        },
        style,
      ]}
    />
  );
}

export function Row({ children, style, ...rest }: ViewProps & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View {...rest} style={[{ flexDirection: ROW, alignItems: 'center' }, style]}>
      {children}
    </View>
  );
}

/** Sky-to-sea background with a soft sun. */
export function Screen({
  children,
  style,
  edges,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <LinearGradient colors={[colors.sky, colors.seaLight, colors.sea]} locations={[0, 0.45, 1]} style={{ flex: 1 }}>
      <View pointerEvents="none" style={styles.sun} />
      <SafeAreaView edges={edges} style={[{ flex: 1 }, style]}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const BUTTON_COLORS = {
  gold: [colors.gold, colors.goldDeep, colors.ink],
  green: [colors.greenDeep, '#0B4F23', '#FFFFFF'],
  red: [colors.redDeep, '#7A1212', '#FFFFFF'],
  white: [colors.card, '#BFD9E6', colors.ink],
  team0: [colors.team[0], colors.teamDeep[0], colors.onTeam[0]],
  team1: [colors.team[1], colors.teamDeep[1], colors.onTeam[1]],
} as const;

export type ButtonTone = keyof typeof BUTTON_COLORS;

/** Chunky cartoon button: a solid face on a darker base that squashes when pressed. */
export function Button({
  label,
  onPress,
  tone = 'gold',
  disabled,
  loading,
  icon,
  size = 'lg',
  style,
  accessibilityHint,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  size?: 'lg' | 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  /** Spoken label when it should say more than the visible text. */
  accessibilityLabel?: string;
}) {
  const [face, base, text] = BUTTON_COLORS[tone];
  const h = size === 'lg' ? 60 : size === 'md' ? 50 : 42;
  const depth = size === 'sm' ? 4 : 6;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={() => {
        haptic(tone === 'gold' ? 'heavy' : 'tap');
        play('tap');
        onPress?.();
      }}
      style={[{ opacity: disabled ? 0.45 : 1 }, style]}
    >
      {({ pressed }) => (
        <View style={{ height: h + depth, borderRadius: radius.md, backgroundColor: base }}>
          <View
            style={[
              styles.btnFace,
              {
                height: h,
                paddingHorizontal: size === 'lg' ? 18 : 8,
                backgroundColor: face,
                transform: [{ translateY: pressed ? depth - 1 : 0 }],
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={text} />
            ) : (
              <Row style={{ gap: 8, justifyContent: 'center' }}>
                {icon}
                <T
                  weight="black"
                  size={size === 'lg' ? 19 : size === 'md' ? 17 : 15}
                  color={text}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ flexShrink: 1 }}
                >
                  {label}
                </T>
              </Row>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** Small round icon button (pause, back…). */
export function IconButton({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        haptic();
        play('tap');
        onPress();
      }}
      style={({ pressed }) => [styles.iconBtn, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      {children}
    </Pressable>
  );
}

/** Fades + slides children in on mount. */
export function FadeIn({
  children,
  delay = 0,
  from = 18,
  style,
}: {
  children: ReactNode;
  delay?: number;
  from?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useState(() => new Animated.Value(0))[0];
  const still = useReduceMotion();
  useEffect(() => {
    if (still) return v.setValue(1);
    Animated.timing(v, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: nativeDriver,
    }).start();
  }, [v, delay, still]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Pops in with a bounce (cards, badges). */
export function PopIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useState(() => new Animated.Value(0))[0];
  const still = useReduceMotion();
  useEffect(() => {
    if (still) return v.setValue(1);
    Animated.spring(v, { toValue: 1, delay, friction: 6, tension: 90, useNativeDriver: nativeDriver }).start();
  }, [v, delay, still]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sun: {
    position: 'absolute',
    top: -60,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#FFF4B8',
    opacity: 0.7,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    ...shadow,
  },
  btnFace: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
});
