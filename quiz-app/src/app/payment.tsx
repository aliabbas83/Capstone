import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button, Card, FadeIn, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { PAY_MESSAGES, paymentErrorMessage, verifyOrder, type PayStatus } from '@/lib/payments';
import { colors } from '@/theme';

// On the web the payment page opens in a popup; this closes it and hands the result back.
WebBrowser.maybeCompleteAuthSession();

/** Where MyFatoorah returns to. The status in the link is only a hint: we always ask the server. */
export default function Payment() {
  const { order } = useLocalSearchParams<{ order?: string }>();
  const { ready, session, refreshProfile } = useAuth();
  const [status, setStatus] = useState<PayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const orderId = typeof order === 'string' ? order : '';

  const check = useCallback(async () => {
    if (!orderId) return;
    setChecking(true);
    setError(null);
    try {
      const r = await verifyOrder(orderId);
      setStatus(r.status);
      if (r.status === 'paid') refreshProfile();
    } catch (e) {
      setError(paymentErrorMessage(e));
    } finally {
      setChecking(false);
    }
  }, [orderId, refreshProfile]);

  const signedIn = !!session;
  useEffect(() => {
    // Asking the server is an external sync, so it belongs in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (signedIn) check();
  }, [signedIn, check]);

  let body;
  if (!orderId) {
    body = <T size={17} center>ما لقينا رقم الطلب.</T>;
  } else if (!ready || (signedIn && status === null && !error)) {
    body = <ActivityIndicator color={colors.ink} size="large" accessibilityLabel="جاري التحقق من الدفع" />;
  } else if (!signedIn) {
    body = <T size={17} center>سجّل دخول عشان نتحقق من الدفع.</T>;
  } else if (error) {
    body = (
      <>
        <T size={16} center color={colors.redDeep}>
          {error}
        </T>
        <Button label="حاول مرة ثانية" tone="white" size="md" loading={checking} onPress={check} />
      </>
    );
  } else if (status) {
    body = (
      <>
        <T size={44} center aria-hidden>
          {status === 'paid' ? '🎉' : status === 'pending' ? '⏳' : '😕'}
        </T>
        <T weight="black" size={19} center accessibilityLiveRegion="polite">
          {PAY_MESSAGES[status]}
        </T>
        {status === 'pending' ? (
          <Button label="تحقق" tone="white" size="md" loading={checking} onPress={check} />
        ) : null}
      </>
    );
  }

  return (
    <Screen style={styles.page}>
      <FadeIn>
        <Card style={{ gap: 16, alignItems: 'stretch' }}>
          <T weight="black" size={22} center accessibilityRole="header">
            الدفع
          </T>
          <View style={{ gap: 14 }}>{body}</View>
          <Button label="ارجع لحسابي" onPress={() => router.replace(signedIn ? '/lobby' : '/auth')} />
        </Card>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, justifyContent: 'center' },
});
