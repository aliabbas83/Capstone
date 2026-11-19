import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, View } from 'react-native';
import { BookIcon, CheckIcon } from '@/components/icons';
import { Flag, Swimmer } from '@/components/race-art';
import { SoundToggles } from '@/components/sound-toggles';
import { Button, FadeIn, PopIn, Row, Screen, T } from '@/components/ui';
import { REAL_LANE_LENGTH } from '@/game/demo-questions';
import { useGame } from '@/game/game-store';
import { useAuth } from '@/lib/auth';
import { colors, nativeDriver, radius, ROW } from '@/theme';
import { useReduceMotion } from '@/lib/motion';

export default function Home() {
  const { begin } = useGame();
  const { session } = useAuth();
  // Arriving here right after the free demo ended: tell them what the full game adds.
  const { after } = useLocalSearchParams<{ after?: string }>();
  const afterDemo = after === 'demo';
  const bob = useState(() => new Animated.Value(0))[0];
  const still = useReduceMotion();
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
        Animated.timing(bob, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, still]);
  const drift = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <Screen style={styles.page}>
      <FadeIn style={{ alignItems: 'center', marginTop: 24 }}>
        <T weight="black" size={76} center color={colors.ink} style={{ lineHeight: 100 }} accessibilityRole="header">
          جولة
        </T>
        <T size={18} center color={colors.ink}>
          سباق الأسئلة بين الفرق — جاوب صح واسبح لخط النهاية!
        </T>
      </FadeIn>

      {/* Right after a demo the space goes to the "what you get" card instead. */}
      {afterDemo ? null : (
      <View style={{ marginTop: 14, gap: 10, alignItems: 'center' }}>
        <SoundToggles compact />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="طريقة اللعب"
          onPress={() => router.push('/how-to-play')}
          style={({ pressed }) => [styles.howTo, pressed && { transform: [{ scale: 0.96 }] }]}
        >
          <BookIcon size={18} />
          <T weight="black" size={14}>
            طريقة اللعب
          </T>
        </Pressable>
      </View>
      )}

      {afterDemo ? (
        <DemoDoneCard signedIn={!!session} />
      ) : (
      <View style={styles.scene} accessible accessibilityLabel="سبّاحان يتسابقان نحو العلم">
        {/* The flag is on the left: the swimmers race towards it, right to left. */}
        <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
          <Flag color={colors.gold} raised size={56} />
          <View style={{ gap: 14 }}>
            <Animated.View style={{ transform: [{ translateX: drift }] }}>
              <Swimmer color={colors.team[0]} size={42} swimming />
            </Animated.View>
            <Animated.View style={{ marginLeft: 34, transform: [{ translateX: Animated.multiply(drift, -1) }] }}>
              <Swimmer color={colors.team[1]} size={42} swimming />
            </Animated.View>
          </View>
        </View>
      </View>
      )}

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
        {session ? (
          <Button label="حسابي" tone="white" size="md" onPress={() => router.push('/lobby')} />
        ) : (
          <>
            <T size={15} center color={colors.ink}>
              اللعبة الكاملة بدينار واحد — سجّل حسابك
            </T>
            <Row style={{ gap: 10 }}>
              <Button
                label="بالإيميل"
                tone="white"
                size="md"
                style={{ flex: 1 }}
                accessibilityHint="إنشاء حساب جديد بالإيميل"
                onPress={() => router.push({ pathname: '/auth', params: { method: 'email', mode: 'signup' } })}
              />
              <Button
                label="برقم الهاتف"
                tone="white"
                size="md"
                style={{ flex: 1 }}
                accessibilityHint="إنشاء حساب جديد برقم جوال كويتي"
                onPress={() => router.push({ pathname: '/auth', params: { method: 'phone', mode: 'signup' } })}
              />
            </Row>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="عندك حساب؟ سجّل دخول"
              onPress={() => router.push({ pathname: '/auth', params: { mode: 'signin' } })}
              style={styles.link}
            >
              <T size={15} center weight="black" color={colors.seaDeep}>
                عندك حساب؟ سجّل دخول
              </T>
            </Pressable>
          </>
        )}
      </FadeIn>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="بعض الأسئلة مترجمة من Open Trivia DB بترخيص CC BY-SA 4.0"
        onPress={() => Linking.openURL('https://opentdb.com').catch(() => {})}
        style={styles.credit}
      >
        <T size={12} center color={colors.ink}>
          بعض الأسئلة مترجمة من Open Trivia DB · CC BY-SA 4.0
        </T>
      </Pressable>
    </Screen>
  );
}

/** After the free demo: what the paid game adds, once, on the way back home (not on the winner screen). */
function DemoDoneCard({ signedIn }: { signedIn: boolean }) {
  const perks = ['مئات الأسئلة في 14 فئة', `سباق ${REAL_LANE_LENGTH} خطوة بدل 10`, 'أسئلة جديدة ما تتكرر في حسابك'];
  return (
    <View style={styles.scene}>
      <PopIn style={styles.demoDone}>
        <T weight="black" size={20} accessibilityRole="header">
          عجبتكم التجربة؟
        </T>
        <View style={{ gap: 6 }}>
          {perks.map((p) => (
            <Row key={p} style={{ gap: 8 }}>
              <CheckIcon size={18} color={colors.greenDeep} />
              <T size={15} weight="bold">
                {p}
              </T>
            </Row>
          ))}
        </View>
        <T size={15} color={colors.ink}>
          اللعبة الكاملة بدينار واحد.
        </T>
        {signedIn ? <Button label="اشترِ لعبة كاملة" size="md" onPress={() => router.push('/lobby')} /> : null}
      </PopIn>
    </View>
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
  link: { minHeight: 44, justifyContent: 'center' },
  credit: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  howTo: {
    flexDirection: ROW,
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  demoDone: { alignSelf: 'stretch', backgroundColor: colors.sand, borderRadius: radius.xl, padding: 16, gap: 10 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 4 },
});
