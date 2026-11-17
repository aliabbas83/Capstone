import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { BackIcon } from '@/components/icons';
import { Button, Card, FadeIn, IconButton, Row, Screen, T } from '@/components/ui';
import { useGame } from '@/game/game-store';
import { toArabicDigits } from '@/lib/arabic';
import { useAuth } from '@/lib/auth';
import { buyGame, PAY_MESSAGES, paymentErrorMessage, type PayStatus } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { maskPhone, phoneFromLoginEmail } from '@/lib/validate';
import { colors, radius } from '@/theme';

type GameRow = { id: string; team_names: string[]; winner: number | null; status: string; created_at: string };

export default function Lobby() {
  const { ready, session, profile, profileError, refreshProfile, signOut } = useAuth();
  const { begin } = useGame();
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [gamesError, setGamesError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payNote, setPayNote] = useState<{ status: PayStatus } | { error: string } | null>(null);
  const userId = session?.user.id;

  const loadGames = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('games')
      .select('id, team_names, winner, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    setGamesError(!!error);
    if (!error) setGames(data);
  }, [userId]);

  useEffect(() => {
    // Fetching from the server is an external sync, so it belongs in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGames();
  }, [loadGames]);

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/auth" />;

  const user = session.user;
  const phone = phoneFromLoginEmail(user.email);
  const who = phone ? maskPhone(phone) : (user.email ?? '');

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), loadGames()]);
    setRefreshing(false);
  };

  const onBuy = async () => {
    setPaying(true);
    setPayNote(null);
    try {
      const { status } = await buyGame();
      setPayNote({ status });
    } catch (e) {
      setPayNote({ error: paymentErrorMessage(e) });
    } finally {
      setPaying(false);
      refreshProfile();
      loadGames();
    }
  };

  const onSignOut = async () => {
    setLeaving(true);
    await signOut();
    router.replace('/');
  };

  return (
    <Screen style={styles.page}>
      <Row style={{ gap: 12 }}>
        <IconButton label="الرئيسية" onPress={() => router.replace('/')}>
          <BackIcon />
        </IconButton>
        <View style={{ flex: 1 }}>
          <T weight="black" size={24} accessibilityRole="header">
            أهلاً بك 👋
          </T>
          <T size={14} color={colors.inkSoft} style={{ writingDirection: 'ltr' }} numberOfLines={1}>
            {who}
          </T>
        </View>
      </Row>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <FadeIn>
          <Card style={{ gap: 14 }}>
            {profileError ? (
              <>
                <T size={16} color={colors.redDeep}>
                  {profileError}
                </T>
                <Button label="حاول مرة ثانية" tone="white" size="md" onPress={refreshProfile} />
              </>
            ) : !profile ? (
              <ActivityIndicator color={colors.ink} accessibilityLabel="جاري تحميل الرصيد" />
            ) : (
              <>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T size={16} color={colors.inkSoft}>
                    رصيد الألعاب
                  </T>
                  <View style={styles.credit}>
                    <T weight="black" size={22}>
                      {toArabicDigits(profile.games_credit)} 🎟️
                    </T>
                  </View>
                </Row>
                {profile.games_credit > 0 ? (
                  <Button
                    label="ابدأ لعبة كاملة"
                    accessibilityHint="تستخدم لعبة واحدة من رصيدك"
                    onPress={() => {
                      begin('real');
                      router.push('/setup/teams');
                    }}
                  />
                ) : (
                  <Button
                    label="اشترِ لعبة بدينار واحد"
                    tone="gold"
                    loading={paying}
                    accessibilityHint="يفتح صفحة الدفع: كي نت أو بطاقة"
                    onPress={onBuy}
                  />
                )}
                {profile.games_credit > 0 ? (
                  <Button label="اشترِ لعبة إضافية (١ د.ك)" tone="white" size="md" loading={paying} onPress={onBuy} />
                ) : null}
                {payNote ? (
                  <View
                    style={[styles.note, 'error' in payNote || payNote.status !== 'paid' ? styles.noteBad : styles.noteGood]}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    <T size={14} weight="bold" center>
                      {'error' in payNote ? payNote.error : PAY_MESSAGES[payNote.status]}
                    </T>
                  </View>
                ) : null}
              </>
            )}
          </Card>
        </FadeIn>

        <FadeIn delay={100}>
          <Button
            label="جرّب مجاناً"
            tone="white"
            onPress={() => {
              begin('demo');
              router.push('/setup/teams');
            }}
          />
        </FadeIn>

        <FadeIn delay={180}>
          <Card style={{ gap: 10 }}>
            <T weight="black" size={18}>
              آخر ألعابك
            </T>
            {gamesError ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <T size={14} color={colors.redDeep}>
                  تعذّر تحميل الألعاب.
                </T>
                <Button label="إعادة" tone="white" size="sm" onPress={loadGames} />
              </Row>
            ) : games === null ? (
              <ActivityIndicator color={colors.ink} accessibilityLabel="جاري تحميل الألعاب" />
            ) : games.length === 0 ? (
              <T size={15} color={colors.muted}>
                ما لعبت أي لعبة كاملة بعد. أول سباق بانتظارك! ⛵
              </T>
            ) : (
              games.map((g) => (
                <Row key={g.id} style={styles.gameRow}>
                  <T size={15} weight="bold" style={{ flex: 1 }}>
                    {g.team_names[0]} ضد {g.team_names[1]}
                  </T>
                  <T size={13} color={colors.inkSoft}>
                    {g.winner !== null ? `🏆 ${g.team_names[g.winner]}` : g.status === 'active' ? 'لم تنتهِ' : 'انتهت بدون فائز'}
                  </T>
                </Row>
              ))
            )}
          </Card>
        </FadeIn>

        <View style={{ gap: 10, marginTop: 8 }}>
          {confirmOut ? (
            <Card style={{ gap: 12 }}>
              <T weight="black" size={16} center>
                متأكد تبي تطلع من حسابك؟
              </T>
              <Row style={{ gap: 10 }}>
                <Button label="إلغاء" tone="white" size="md" style={{ flex: 1 }} onPress={() => setConfirmOut(false)} />
                <Button label="تسجيل الخروج" tone="red" size="md" loading={leaving} style={{ flex: 1 }} onPress={onSignOut} />
              </Row>
            </Card>
          ) : (
            <Button label="تسجيل الخروج" tone="white" size="md" onPress={() => setConfirmOut(true)} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Loading() {
  return (
    <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.ink} size="large" accessibilityLabel="جاري التحميل" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20 },
  body: { gap: 14, paddingVertical: 18 },
  credit: { backgroundColor: colors.sand, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 2 },
  note: { borderRadius: radius.sm, padding: 10 },
  noteGood: { backgroundColor: '#E3F7E8' },
  noteBad: { backgroundColor: '#FDECEC' },
  gameRow: { gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
});
