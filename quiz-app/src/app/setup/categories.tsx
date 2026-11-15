import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackIcon, UndoIcon } from '@/components/icons';
import { MascotBadge } from '@/components/mascot-badge';
import { Button, Card, FadeIn, haptic, IconButton, PopIn, Row, Screen, T } from '@/components/ui';
import { nextPicker } from '@/game/engine';
import { CATEGORIES_PER_TEAM } from '@/game/demo-questions';
import { useGame } from '@/game/game-store';
import { toArabicDigits } from '@/lib/arabic';
import { colors, radius, ROW } from '@/theme';

export default function Categories() {
  const { state, categories, pick, undoPick, startRace } = useGame();
  const { picks, teams } = state;
  const who = nextPicker(picks, CATEGORIES_PER_TEAM);
  const done = who === null;
  const owner = (id: string) => (picks[0].includes(id) ? 0 : picks[1].includes(id) ? 1 : null);
  const name = (i: 0 | 1) => teams[i].name.trim() || (i === 0 ? 'الفريق الأول' : 'الفريق الثاني');

  return (
    <Screen>
      <Row style={styles.header}>
        <IconButton label="رجوع" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <T weight="black" size={24} accessibilityRole="header">
          اختيار الفئات
        </T>
      </Row>

      <View style={{ paddingHorizontal: 20 }}>
        {done ? (
          <Card style={[styles.banner, { borderColor: colors.gold }]}>
            <T weight="black" size={18} center>
              جاهزين! ٨ فئات مختلفة للسباق
            </T>
          </Card>
        ) : (
          <FadeIn key={`${picks[0].length}-${picks[1].length}`}>
            <Card style={[styles.banner, { borderColor: colors.team[who], backgroundColor: colors.teamSoft[who] }]}>
              <Row style={{ gap: 12 }}>
                <MascotBadge mascotId={teams[who].mascotId} photoUri={teams[who].photoUri} size={48} ring={colors.team[who]} />
                <View style={{ flex: 1 }}>
                  <T weight="black" size={18} accessibilityLiveRegion="polite">
                    دور {name(who)} يختار
                  </T>
                  <T size={14} color={colors.inkSoft}>
                    الفئة {toArabicDigits(picks[who].length + 1)} من {toArabicDigits(CATEGORIES_PER_TEAM)}
                  </T>
                </View>
              </Row>
            </Card>
          </FadeIn>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {categories.map((c, idx) => {
          const o = owner(c.id);
          const taken = o !== null;
          return (
            <PopIn key={c.id} delay={idx * 40} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: taken || done }}
                accessibilityLabel={taken ? `${c.name}، اختارها ${name(o)}` : c.name}
                disabled={taken || done}
                onPress={() => {
                  haptic();
                  pick(c.id);
                }}
                style={({ pressed }) => [
                  styles.tile,
                  taken && { backgroundColor: colors.team[o], borderColor: colors.teamDeep[o], borderBottomColor: colors.teamDeep[o] },
                  !taken && done && { opacity: 0.5 },
                  pressed && { transform: [{ scale: 0.95 }] },
                ]}
              >
                <View style={[styles.emojiWrap, { backgroundColor: taken ? 'rgba(255,255,255,0.85)' : `${c.color}22` }]}>
                  <Text style={{ fontSize: 26 }} aria-hidden>
                    {c.emoji}
                  </Text>
                </View>
                <T weight="black" size={16} center color={taken ? colors.onTeam[o] : colors.ink}>
                  {c.name}
                </T>
                {taken ? (
                  <View style={styles.ownerBadge}>
                    <MascotBadge mascotId={teams[o].mascotId} photoUri={teams[o].photoUri} size={26} ring="#fff" />
                  </View>
                ) : null}
              </Pressable>
            </PopIn>
          );
        })}
      </ScrollView>

      <Row style={styles.footer}>
        <Button
          tone="white"
          size="lg"
          label="تراجع"
          icon={<UndoIcon />}
          disabled={picks[0].length + picks[1].length === 0}
          onPress={undoPick}
        />
        <Button
          label="ابدأ السباق!"
          disabled={!done}
          style={{ flex: 1 }}
          onPress={() => {
            startRace();
            router.replace('/race');
          }}
        />
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  banner: { borderWidth: 3, paddingVertical: 12 },
  grid: { flexDirection: ROW, flexWrap: 'wrap', padding: 14, gap: 0 },
  cell: { width: '50%', padding: 6 },
  tile: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: 'transparent',
    borderBottomWidth: 6,
    borderBottomColor: '#BFD9E6',
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
    minHeight: 112,
  },
  emojiWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  ownerBadge: { position: 'absolute', top: 6, left: 6 },
  footer: { gap: 10, paddingHorizontal: 20, paddingBottom: 12 },
});
