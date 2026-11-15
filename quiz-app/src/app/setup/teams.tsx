import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { BackIcon, ImageIcon } from '@/components/icons';
import { MascotBadge } from '@/components/mascot-badge';
import { Button, Card, haptic, IconButton, Row, Screen, T } from '@/components/ui';
import type { TeamIdx } from '@/game/engine';
import { TeamDraft, useGame } from '@/game/game-store';
import { MASCOT_BY_ID, MASCOTS, suggestMascot } from '@/game/mascots';
import { toArabicDigits } from '@/lib/arabic';
import { colors, fonts, radius, ROW, TEXT_START } from '@/theme';

const TIMERS = [30, 60, 90];
const MAX_NAME = 20;

export default function Teams() {
  const { state, setTeam, setTimer } = useGame();
  const [a, b] = state.teams;
  const nameA = a.name.trim();
  const nameB = b.name.trim();
  const sameName = nameA !== '' && nameA === nameB;
  const ready = nameA !== '' && nameB !== '' && !sameName;

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Row style={styles.header}>
          <IconButton label="رجوع" onPress={() => router.back()}>
            <BackIcon />
          </IconButton>
          <T weight="black" size={24} accessibilityRole="header">
            الفرق
          </T>
        </Row>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {([0, 1] as TeamIdx[]).map((i) => (
            <TeamCard key={i} index={i} team={state.teams[i]} onChange={(p) => setTeam(i, p)} />
          ))}
          {sameName ? (
            <T size={14} color={colors.redDeep} center accessibilityLiveRegion="polite">
              اختاروا اسمين مختلفين للفريقين
            </T>
          ) : null}

          <Card style={{ gap: 10 }}>
            <T weight="bold" size={16}>
              وقت الإجابة
            </T>
            <Row style={styles.segment} >
              {TIMERS.map((s) => {
                const on = state.timerSeconds === s;
                return (
                  <Pressable
                    key={s}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${s} ثانية`}
                    onPress={() => {
                      haptic();
                      setTimer(s);
                    }}
                    style={[styles.segBtn, on && styles.segOn]}
                  >
                    <T weight={on ? 'black' : 'bold'} size={15} center color={on ? colors.ink : colors.inkSoft}>
                      {toArabicDigits(s)} ثانية
                    </T>
                  </Pressable>
                );
              })}
            </Row>
          </Card>
        </ScrollView>

        <View style={styles.footer}>
          <Button label="التالي: اختيار الفئات" disabled={!ready} onPress={() => router.push('/setup/categories')} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function TeamCard({ index, team, onChange }: { index: TeamIdx; team: TeamDraft; onChange: (p: Partial<TeamDraft>) => void }) {
  const [gallery, setGallery] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const color = colors.team[index];
  const suggested = suggestMascot(team.name);

  const onName = (name: string) => {
    const patch: Partial<TeamDraft> = { name };
    if (!team.mascotLocked) {
      const m = suggestMascot(name);
      if (m) patch.mascotId = m.id;
    }
    onChange(patch);
  };

  const pickPhoto = async () => {
    setPhotoError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (!res.canceled && res.assets[0]) onChange({ photoUri: res.assets[0].uri });
    } catch {
      setPhotoError('ما قدرنا نفتح الصور. جرّب مرة ثانية أو اختر شخصية.');
    }
  };

  return (
    <Card style={[styles.teamCard, { borderColor: color }]}>
      <Row style={{ gap: 14 }}>
        <MascotBadge mascotId={team.mascotId} photoUri={team.photoUri} size={72} ring={color} />
        <View style={{ flex: 1, gap: 4 }}>
          <T weight="black" size={14} color={colors.teamDeep[index]}>
            {index === 0 ? 'الفريق الأول' : 'الفريق الثاني'}
          </T>
          <TextInput
            value={team.name}
            onChangeText={onName}
            maxLength={MAX_NAME}
            placeholder={index === 0 ? 'مثل: الصقور' : 'مثل: النمور'}
            placeholderTextColor={colors.muted}
            accessibilityLabel={index === 0 ? 'اسم الفريق الأول' : 'اسم الفريق الثاني'}
            style={styles.input}
            returnKeyType="done"
          />
          {!team.photoUri ? (
            <T size={13} color={colors.muted}>
              {suggested && suggested.id === team.mascotId
                ? `صورة تناسب الاسم: ${suggested.label}`
                : `الصورة: ${MASCOT_BY_ID[team.mascotId]?.label ?? ''}`}
            </T>
          ) : null}
        </View>
      </Row>

      <Row style={{ gap: 8 }}>
        <Button
          size="sm"
          tone="white"
          label={gallery ? 'إخفاء الشخصيات' : 'اختر شخصية'}
          style={{ flex: 1 }}
          onPress={() => setGallery((g) => !g)}
        />
        {team.photoUri ? (
          <Button size="sm" tone="white" label="إزالة الصورة" style={{ flex: 1 }} onPress={() => onChange({ photoUri: null })} />
        ) : (
          <Button size="sm" tone="white" label="من الصور" icon={<ImageIcon size={18} />} style={{ flex: 1 }} onPress={pickPhoto} />
        )}
      </Row>
      {photoError ? (
        <T size={13} color={colors.redDeep}>
          {photoError}
        </T>
      ) : null}

      {gallery ? (
        <View style={styles.grid} accessibilityRole="radiogroup">
          {MASCOTS.map((m) => {
            const on = m.id === team.mascotId && !team.photoUri;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={m.label}
                onPress={() => {
                  haptic();
                  onChange({ mascotId: m.id, mascotLocked: true, photoUri: null });
                }}
                style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.9 : 1 }] }]}
              >
                <MascotBadge mascotId={m.id} size={52} ring={on ? color : undefined} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  content: { padding: 20, gap: 16, paddingBottom: 32 },
  teamCard: { gap: 14, borderWidth: 3 },
  input: {
    fontFamily: fonts.black,
    fontSize: 22,
    color: colors.ink,
    textAlign: TEXT_START,
    writingDirection: 'rtl',
    borderBottomWidth: 2,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  grid: { flexDirection: ROW, flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  segment: { backgroundColor: colors.cardSoft, borderRadius: radius.md, padding: 4, gap: 4 },
  segBtn: { flex: 1, height: 46, borderRadius: radius.sm, justifyContent: 'center' },
  segOn: { backgroundColor: colors.gold },
  footer: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4 },
});
