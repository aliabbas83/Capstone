import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { BackIcon, CheckIcon, LockIcon } from '@/components/icons';
import { SoundToggles } from '@/components/sound-toggles';
import { Button, Card, FadeIn, IconButton, Row, Screen, T } from '@/components/ui';
import { REAL_LANE_LENGTH } from '@/game/demo-questions';
import { useGame } from '@/game/game-store';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/monitoring';
import { buyGame, PAY_MESSAGES, paymentErrorMessage, verifyOrder, type PayStatus } from '@/lib/payments';
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
  const [reviewing, setReviewing] = useState(false);
  const [payNote, setPayNote] = useState<{ status: PayStatus } | { error: string } | null>(null);
  // The last order we opened, so a "pending" payment can be re-checked with the server.
  const [lastOrder, setLastOrder] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
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

  /** First a short summary of what they buy and how paying works; the payment page opens only after "ادفع". */
  const startBuy = () => {
    setPayNote(null);
    setReviewing(true);
  };

  const onBuy = async () => {
    setReviewing(false);
    setPaying(true);
    setPayNote(null);
    try {
      const { orderId, status } = await buyGame();
      setLastOrder(orderId);
      setPayNote({ status });
    } catch (e) {
      reportError(e, 'buy_game');
      setPayNote({ error: paymentErrorMessage(e) });
    } finally {
      setPaying(false);
      refreshProfile();
      loadGames();
    }
  };

  /** Ask the server again about a pending payment. Only the server decides if it is paid. */
  const onCheck = async () => {
    if (!lastOrder) return;
    setChecking(true);
    try {
      const { status } = await verifyOrder(lastOrder);
      setPayNote({ status });
      if (status === 'paid') refreshProfile();
    } catch (e) {
      reportError(e, 'verify_payment');
      setPayNote({ error: paymentErrorMessage(e) });
    } finally {
      setChecking(false);
    }
  };

  const pending = !!payNote && !('error' in payNote) && payNote.status === 'pending' && !!lastOrder;

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
                  <T size={16} color={colors.inkSoft} accessible={false} importantForAccessibility="no">
                    رصيد الألعاب
                  </T>
                  <View
                    style={styles.credit}
                    accessible
                    accessibilityLabel={`الألعاب المتبقية: ${profile.games_credit}`}
                  >
                    <T weight="black" size={22}>
                      {profile.games_credit} 🎟️
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
                ) : null}
                {reviewing ? (
                  <PaySummary onPay={onBuy} onCancel={() => setReviewing(false)} />
                ) : profile.games_credit > 0 ? (
                  <Button label="اشترِ لعبة إضافية (1 د.ك)" tone="white" size="md" loading={paying} onPress={startBuy} />
                ) : (
                  <Button
                    label="اشترِ لعبة بدينار واحد"
                    tone="gold"
                    loading={paying}
                    accessibilityHint="يعرض ملخص الشراء قبل الدفع"
                    onPress={startBuy}
                  />
                )}
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
                {pending ? (
                  <Button label="تحقق" tone="white" size="md" loading={checking} onPress={onCheck} />
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

        <FadeIn delay={240}>
          <Card style={{ gap: 12 }}>
            <T weight="black" size={18} accessibilityRole="header">
              الإعدادات
            </T>
            <SoundToggles />
            <T size={13} color={colors.muted}>
              وقت الإجابة (30 / 60 / 90 ثانية، أو بدون وقت) تختارونه عند إعداد الفرق قبل كل لعبة.
            </T>
            <View style={styles.divider} />
            {confirmOut ? (
              <View style={{ gap: 12 }}>
                <T weight="black" size={16} center>
                  متأكد تبي تطلع من حسابك؟
                </T>
                <Row style={{ gap: 10 }}>
                  <Button label="إلغاء" tone="white" size="md" style={{ flex: 1 }} onPress={() => setConfirmOut(false)} />
                  <Button label="تسجيل الخروج" tone="red" size="md" loading={leaving} style={{ flex: 1 }} onPress={onSignOut} />
                </Row>
              </View>
            ) : (
              <Button label="تسجيل الخروج" tone="white" size="md" onPress={() => setConfirmOut(true)} />
            )}
          </Card>
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}

/** What one game gives and how paying works, shown before the payment page opens. Price is set by the server. */
function PaySummary({ onPay, onCancel }: { onPay: () => void; onCancel: () => void }) {
  const perks = [
    `14 فئة تختارون منها 8، وسباق ${REAL_LANE_LENGTH} خطوة`,
    'أسئلة جديدة ما تتكرر في حسابك',
    'اللعبة تبقى في رصيدكم لين تبدأونها',
  ];
  return (
    <View style={styles.summary} accessibilityLiveRegion="polite">
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="black" size={17} accessibilityRole="header">
          لعبة كاملة واحدة
        </T>
        <T weight="black" size={17}>
          1 د.ك
        </T>
      </Row>
      <View style={{ gap: 6 }}>
        {perks.map((p) => (
          <Row key={p} style={{ gap: 8 }}>
            <CheckIcon size={18} color={colors.greenDeep} />
            <T size={14} style={{ flex: 1 }}>
              {p}
            </T>
          </Row>
        ))}
      </View>
      <View style={styles.divider} />
      <Row style={{ gap: 8, alignItems: 'flex-start' }}>
        <View style={{ paddingTop: 2 }}>
          <LockIcon size={18} color={colors.ink} />
        </View>
        <T size={14} style={{ flex: 1 }}>
          تدفعون بكي نت أو بطاقة في صفحة دفع آمنة من ماي فاتورة، وبعد الدفع ترجعون هنا والرصيد يزيد.
        </T>
      </Row>
      <Row style={{ gap: 10 }}>
        <Button label="ادفع 1 د.ك" style={{ flex: 1 }} accessibilityHint="يفتح صفحة الدفع الآمنة" onPress={onPay} />
        <Button label="إلغاء" tone="white" size="md" onPress={onCancel} />
      </Row>
    </View>
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
  divider: { height: 1, backgroundColor: colors.line },
  summary: { gap: 12, backgroundColor: colors.cardSoft, borderRadius: radius.md, borderWidth: 2, borderColor: colors.line, padding: 14 },
  gameRow: { gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
});
