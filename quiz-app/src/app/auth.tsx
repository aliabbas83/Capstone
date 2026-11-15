import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { BackIcon } from '@/components/icons';
import { Button, Card, FadeIn, haptic, IconButton, Row, Screen, T } from '@/components/ui';
import { toArabicDigits } from '@/lib/arabic';
import { authErrorMessage, useAuth } from '@/lib/auth';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { cleanCode, maskPhone, normalizeEmail, normalizeKuwaitPhone } from '@/lib/validate';
import { colors, fonts, radius, ROW } from '@/theme';

type Method = 'email' | 'phone';
type Step = 'enter' | 'code';
const RESEND_SECONDS = 60;

export default function Auth() {
  const params = useLocalSearchParams<{ method?: string }>();
  const { ready, session } = useAuth();
  const [method, setMethod] = useState<Method>(params.method === 'phone' ? 'phone' : 'email');
  const [step, setStep] = useState<Step>('enter');
  const [raw, setRaw] = useState('');
  const [target, setTarget] = useState(''); // normalised email / +965 number the code was sent to
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);

  // Resend countdown.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (!ready) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" accessibilityLabel="جاري التحميل" />
      </Screen>
    );
  }
  if (session) return <Redirect href="/lobby" />;

  const switchMethod = (m: Method) => {
    if (m === method) return;
    haptic();
    setMethod(m);
    setRaw('');
    setError('');
    setStep('enter');
  };

  const sendCode = async () => {
    setError('');
    const value = method === 'email' ? normalizeEmail(raw) : normalizeKuwaitPhone(raw);
    if (!value) {
      setError(method === 'email' ? 'اكتب إيميل صحيح، مثل: name@example.com' : 'اكتب رقم جوال كويتي من 8 أرقام، مثل: 99123456');
      return;
    }
    setBusy(true);
    const { error: e } =
      method === 'email'
        ? await supabase.auth.signInWithOtp({ email: value, options: { shouldCreateUser: true } })
        : await supabase.auth.signInWithOtp({ phone: value, options: { shouldCreateUser: true } });
    setBusy(false);
    if (e) {
      setError(authErrorMessage(e));
      return;
    }
    haptic('success');
    setTarget(value);
    setCode('');
    setStep('code');
    setWait(RESEND_SECONDS);
  };

  const verify = async () => {
    setError('');
    if (code.length < 6) {
      setError('اكتب الرمز كاملاً (6 أرقام).');
      return;
    }
    setBusy(true);
    const { error: e } =
      method === 'email'
        ? await supabase.auth.verifyOtp({ email: target, token: code, type: 'email' })
        : await supabase.auth.verifyOtp({ phone: target, token: code, type: 'sms' });
    setBusy(false);
    if (e) {
      haptic('warning');
      setError(authErrorMessage(e));
      return;
    }
    haptic('success');
    router.replace('/lobby');
  };

  const resend = async () => {
    setError('');
    setBusy(true);
    const { error: e } =
      method === 'email'
        ? await supabase.auth.signInWithOtp({ email: target })
        : await supabase.auth.signInWithOtp({ phone: target });
    setBusy(false);
    if (e) setError(authErrorMessage(e));
    else setWait(RESEND_SECONDS);
  };

  return (
    <Screen style={styles.page}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Row style={{ gap: 12 }}>
          <IconButton label="رجوع" onPress={() => (step === 'code' ? setStep('enter') : router.back())}>
            <BackIcon />
          </IconButton>
          <T weight="black" size={24} accessibilityRole="header">
            حسابك في جولة
          </T>
        </Row>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <FadeIn>
            <Card style={{ gap: 16 }}>
              {!supabaseConfigured ? (
                <T size={16} center color={colors.redDeep}>
                  إعدادات الخادم ناقصة في التطبيق. أضف قيم Supabase في ملف ‎.env.local ثم أعد التشغيل.
                </T>
              ) : step === 'enter' ? (
                <>
                  <T size={16} color={colors.inkSoft}>
                    سجّل أو ادخل بنفس الطريقة: نرسل لك رمزاً من 6 أرقام، بدون كلمة مرور.
                  </T>

                  <View style={styles.segment} accessibilityRole="tablist">
                    {(['email', 'phone'] as Method[]).map((m) => {
                      const on = m === method;
                      return (
                        <Pressable
                          key={m}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: on }}
                          onPress={() => switchMethod(m)}
                          style={[styles.segBtn, on && styles.segOn]}
                        >
                          <T weight={on ? 'black' : 'bold'} center color={on ? colors.ink : colors.muted}>
                            {m === 'email' ? 'الإيميل' : 'رقم الهاتف'}
                          </T>
                        </Pressable>
                      );
                    })}
                  </View>

                  {method === 'email' ? (
                    <TextInput
                      key="email"
                      value={raw}
                      onChangeText={(t) => {
                        setRaw(t);
                        setError('');
                      }}
                      placeholder="name@example.com"
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="الإيميل"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      inputMode="email"
                      returnKeyType="send"
                      onSubmitEditing={sendCode}
                      style={[styles.input, styles.ltr]}
                    />
                  ) : (
                    <View style={[styles.phoneRow]}>
                      <View style={styles.prefix}>
                        <T weight="black" size={18}>
                          🇰🇼 965+
                        </T>
                      </View>
                      <TextInput
                        key="phone"
                        value={raw}
                        onChangeText={(t) => {
                          setRaw(t);
                          setError('');
                        }}
                        placeholder="9912 3456"
                        placeholderTextColor={colors.muted}
                        accessibilityLabel="رقم الجوال الكويتي"
                        keyboardType="phone-pad"
                        autoComplete="tel"
                        textContentType="telephoneNumber"
                        inputMode="tel"
                        maxLength={16}
                        returnKeyType="send"
                        onSubmitEditing={sendCode}
                        style={[styles.input, styles.ltr, { flex: 1 }]}
                      />
                    </View>
                  )}

                  {error ? <ErrorText text={error} /> : null}
                  <Button label="أرسل الرمز" loading={busy} onPress={sendCode} />
                  {method === 'phone' ? (
                    <T size={13} center color={colors.muted}>
                      تصلك رسالة SMS. قد تُطبَّق رسوم الرسائل حسب شركتك.
                    </T>
                  ) : null}
                </>
              ) : (
                <>
                  <T size={16} color={colors.inkSoft}>
                    أرسلنا رمزاً إلى
                  </T>
                  <T weight="black" size={18} style={styles.ltrText}>
                    {method === 'email' ? target : maskPhone(target)}
                  </T>
                  <TextInput
                    value={code}
                    onChangeText={(t) => {
                      setCode(cleanCode(t));
                      setError('');
                    }}
                    placeholder="••••••"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="رمز التحقق"
                    keyboardType="number-pad"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={8}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={verify}
                    style={[styles.input, styles.code]}
                  />
                  {error ? <ErrorText text={error} /> : null}
                  <Button label="تأكيد ودخول" tone="green" loading={busy} disabled={code.length < 6} onPress={verify} />
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Pressable accessibilityRole="button" onPress={() => setStep('enter')} hitSlop={8}>
                      <T size={14} color={colors.seaDeep} weight="black">
                        {method === 'email' ? 'غيّر الإيميل' : 'غيّر الرقم'}
                      </T>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: wait > 0 || busy }}
                      disabled={wait > 0 || busy}
                      onPress={resend}
                      hitSlop={8}
                    >
                      <T size={14} weight="black" color={wait > 0 ? colors.muted : colors.seaDeep}>
                        {wait > 0 ? `إعادة الإرسال بعد ${toArabicDigits(wait)} ث` : 'أعد إرسال الرمز'}
                      </T>
                    </Pressable>
                  </Row>
                  {method === 'email' ? (
                    <T size={13} center color={colors.muted}>
                      ما وصلك؟ شيّك على مجلد الرسائل غير المرغوبة (Spam).
                    </T>
                  ) : null}
                </>
              )}
            </Card>
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <T size={14} weight="bold" color={colors.redDeep}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20 },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20 },
  segment: { flexDirection: ROW, backgroundColor: colors.cardSoft, borderRadius: radius.md, padding: 4, gap: 4 },
  segBtn: { flex: 1, height: 46, borderRadius: radius.sm, justifyContent: 'center' },
  segOn: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.gold },
  input: {
    fontFamily: fonts.black,
    fontSize: 20,
    color: colors.ink,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 56,
    backgroundColor: colors.cardSoft,
  },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  ltrText: { textAlign: 'center', writingDirection: 'ltr' },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  prefix: {
    height: 56,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.sand,
    justifyContent: 'center',
  },
  code: { textAlign: 'center', letterSpacing: 10, fontSize: 28, writingDirection: 'ltr' },
  error: { backgroundColor: '#FDECEC', borderRadius: radius.sm, padding: 10 },
});
