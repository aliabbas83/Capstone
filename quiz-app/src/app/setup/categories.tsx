import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackIcon, UndoIcon } from '@/components/icons';
import { MascotBadge } from '@/components/mascot-badge';
import { Button, Card, FadeIn, haptic, IconButton, PopIn, Row, Screen, T } from '@/components/ui';
import { nextPicker } from '@/game/engine';
import { CATEGORIES_PER_TEAM } from '@/game/demo-questions';
import { useGame } from '@/game/game-store';
import { toArabicDigits } from '@/lib/arabic';
import { colors, radius, ROW } from '@/theme';

export default function Categories() {
  const { state, categories, pick, undoPick, startRace, starting, startError, catalogStatus, reloadCatalog, categoryLeft } = useGame();
  const real = state.mode === 'real';
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

      {catalogStatus !== 'ready' ? (
        <View style={styles.state}>
          {catalogStatus === 'error' ? (
            <>
              <T size={16} center color={colors.redDeep} accessibilityRole="alert">
                ما قدرنا نحمّل الفئات. تأكد من الاتصال.
              </T>
              <Button label="حاول مرة ثانية" tone="white" size="md" onPress={reloadCatalog} />
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.ink} size="large" accessibilityLabel="جاري تحميل الفئات" />
              <T size={15} center color={colors.ink}>
                جاري تحميل الفئات…
              </T>
            </>
          )}
        </View>
      ) : categories.filter((c) => !real || categoryLeft(c.id) > 0).length < CATEGORIES_PER_TEAM * 2 ? (
        <View style={styles.state}>
          <T size={16} center accessibilityLiveRegion="polite">
            خلصت أغلب الأسئلة في حسابك 🎉 أسئلة جديدة قريباً.
          </T>
          <Button label="حدّث القائمة" tone="white" size="md" onPress={reloadCatalog} />
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.grid}>
        {categories.map((c, idx) => {
          const o = owner(c.id);
          const taken = o !== null;
          const empty = real && !taken && categoryLeft(c.id) === 0;
          return (
            <PopIn key={c.id} delay={idx * 40} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: taken || done || empty }}
                accessibilityLabel={taken ? `${c.name}، اختارها ${name(o)}` : empty ? `${c.name}، خلصت أسئلتها` : c.name}
                disabled={taken || done || empty}
                onPress={() => {
                  haptic();
                  pick(c.id);
                }}
                style={({ pressed }) => [
                  styles.tile,
                  taken && { backgroundColor: colors.team[o], borderColor: colors.teamDeep[o], borderBottomColor: colors.teamDeep[o] },
                  !taken && (done || empty) && { opacity: 0.5 },
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
                {empty ? (
                  <T size={12} color={colors.muted}>
                    خلصت أسئلتها
                  </T>
                ) : null}
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
      )}

      {startError ? (
        <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <T size={14} weight="bold" color={colors.redDeep}>
            {startError}
          </T>
        </View>
      ) : null}
      <Row style={styles.footer}>
        <Button
          tone="white"
          size="lg"
          label="تراجع"
          icon={<UndoIcon />}
          disabled={picks[0].length + picks[1].length === 0 || starting}
          onPress={undoPick}
        />
        <Button
          label={real ? 'ابدأ السباق (لعبة من رصيدك)' : 'ابدأ السباق!'}
          disabled={!done}
          loading={starting}
          style={{ flex: 1 }}
          onPress={async () => {
            if (await startRace()) router.replace('/race');
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
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  error: { backgroundColor: '#FDECEC', borderRadius: radius.sm, padding: 10, marginHorizontal: 20, marginBottom: 8 },
});
