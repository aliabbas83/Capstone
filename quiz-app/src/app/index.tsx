import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Boat, Flag } from '@/components/race-art';
import { Button, FadeIn, Row, Screen, T } from '@/components/ui';
import { useGame } from '@/game/game-store';
import { colors, nativeDriver, radius } from '@/theme';

export default function Home() {
  const { begin } = useGame();
  const bob = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
        Animated.timing(bob, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  return (
    <Screen style={styles.page}>
      <FadeIn style={{ alignItems: 'center', marginTop: 24 }}>
        <T weight="black" size={76} center color={colors.ink} style={{ lineHeight: 100 }} accessibilityRole="header">
          جولة
        </T>
        <T size={18} center color={colors.inkSoft}>
          سباق الأسئلة بين الفرق — جاوب صح وجدّف لخط النهاية!
        </T>
      </FadeIn>

      <View style={styles.scene} accessible accessibilityLabel="قاربان يتسابقان نحو العلم">
        <Row style={{ gap: 40, alignItems: 'flex-end' }}>
          <Animated.View style={{ transform: [{ translateY }] }}>
            <Boat color={colors.team[0]} mascotId="falcon" photoUri={null} width={58} />
          </Animated.View>
          <Flag color={colors.gold} raised size={56} />
          <Animated.View style={{ transform: [{ translateY: Animated.multiply(translateY, -1) }] }}>
            <Boat color={colors.team[1]} mascotId="tiger" photoUri={null} width={58} />
          </Animated.View>
        </Row>
      </View>

      <FadeIn delay={150} style={styles.panel}>
        <Button
          label="جرّب مجاناً"
          accessibilityHint="لعبة تجريبية قصيرة بدون تسجيل"
          onPress={() => {
            begin('demo');
            router.push('/setup/teams');
          }}
        />
        <T size={14} center color={colors.muted}>
          لعبة تجريبية قصيرة بدون حساب
        </T>
        <View style={styles.divider} />
        <T size={15} center color={colors.ink}>
          اللعبة الكاملة بدينار واحد — سجّل حسابك
        </T>
        <Row style={{ gap: 10 }}>
          <Button
            label="بالإيميل"
            tone="white"
            size="md"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/auth', params: { method: 'email' } })}
          />
          <Button
            label="برقم الهاتف"
            tone="white"
            size="md"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/auth', params: { method: 'phone' } })}
          />
        </Row>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingBottom: 16 },
  scene: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 18,
    gap: 10,
  },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 4 },
});
