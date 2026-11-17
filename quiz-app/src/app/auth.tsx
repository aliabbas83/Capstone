import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { BackIcon } from '@/components/icons';
import { Button, Card, FadeIn, haptic, IconButton, Row, Screen, T } from '@/components/ui';
import { authErrorMessage, useAuth } from '@/lib/auth';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { normalizeEmail, normalizeKuwaitPhone, passwordProblem, phoneLoginEmail } from '@/lib/validate';
import { colors, fonts, radius, ROW } from '@/theme';

type Method = 'email' | 'phone';
type Mode = 'signin' | 'signup';

export default function Auth() {
  const params = useLocalSearchParams<{ method?: string }>();
  const { ready, session } = useAuth();
  const [mode, setMode] = useState<Mode>('signup');
  const [method, setMethod] = useState<Method>(params.method === 'phone' ? 'phone' : 'email');
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!ready) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" accessibilityLabel="جاري التحميل" />
      </Screen>
    );
  }
  if (session) return <Redirect href="/lobby" />;

  const clearError = () => setError('');

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    haptic();
    setMode(m);
    setConfirm('');
    setError('');
  };

  const switchMethod = (m: Method) => {
    if (m === method) return;
    haptic();
    setMethod(m);
    setId('');
    setError('');
  };

  const submit = async () => {
    setError('');
    // 1) Who: an email, or a Kuwaiti mobile turned into its internal login name.
    let loginEmail: string | null;
    if (method === 'email') {
      loginEmail = normalizeEmail(id);
      if (!loginEmail) return setError('اكتب إيميل صحيح، مثل: name@example.com');
    } else {
      const phone = normalizeKuwaitPhone(id);
      if (!phone) return setError('اكتب رقم جوال كويتي من 8 أرقام، مثل: 99123456');
      loginEmail = phoneLoginEmail(phone);
    }
    // 2) Password checks (the server checks again).
    if (mode === 'signup') {
      const problem = passwordProblem(password);
      if (problem) return setError(problem);
      if (password !== confirm) return setError('كلمتا المرور غير متطابقتين.');
    } else if (!password) {
      return setError('اكتب كلمة المرور.');
    }

    setBusy(true);
    const { data, error: e } =
      mode === 'signup'
        ? await supabase.auth.signUp({ email: loginEmail, password })
        : await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setBusy(false);

    if (e) {
      haptic('warning');
      return setError(authErrorMessage(e));
    }
    if (!data.session) {
      // Sign-up returned no session: the account already exists (Supabase hides this on purpose).
      return setError('هذا الحساب موجود. اختر "تسجيل الدخول" واكتب كلمة المرور.');
    }
    haptic('success');
    router.replace('/lobby');
  };

  const isSignup = mode === 'signup';

  return (
    <Screen style={styles.page}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Row style={{ gap: 12 }}>
          <IconButton label="رجوع" onPress={() => router.back()}>
            <BackIcon />
          </IconButton>
          <T weight="black" size={24} accessibilityRole="header">
            حسابك في جولة
          </T>
        </Row>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <FadeIn>
            <Card style={{ gap: 14 }}>
              {!supabaseConfigured ? (
                <T size={16} center color={colors.redDeep}>
                  إعدادات الخادم ناقصة في التطبيق. أضف قيم Supabase في ملف ‎.env.local ثم أعد التشغيل.
                </T>
              ) : (
                <>
                  <Segment
                    options={[
                      ['signup', 'حساب جديد'],
                      ['signin', 'تسجيل الدخول'],
                    ]}
                    value={mode}
                    onChange={(v) => switchMode(v as Mode)}
                  />
                  <Segment
                    small
                    options={[
                      ['email', 'بالإيميل'],
                      ['phone', 'برقم الهاتف'],
                    ]}
                    value={method}
                    onChange={(v) => switchMethod(v as Method)}
                  />

                  {method === 'email' ? (
                    <TextInput
                      key="email"
                      value={id}
                      onChangeText={(t) => {
                        setId(t);
                        clearError();
                      }}
                      placeholder="name@example.com"
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="الإيميل"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType={isSignup ? 'emailAddress' : 'username'}
                      inputMode="email"
                      style={[styles.input, styles.ltr]}
                    />
                  ) : (
                    <View style={styles.phoneRow}>
                      <View style={styles.prefix}>
                        <T weight="black" size={18}>
                          🇰🇼 965+
                        </T>
                      </View>
                      <TextInput
                        key="phone"
                        value={id}
                        onChangeText={(t) => {
                          setId(t);
                          clearError();
                        }}
                        placeholder="9912 3456"
                        placeholderTextColor={colors.muted}
                        accessibilityLabel="رقم الجوال الكويتي"
                        keyboardType="phone-pad"
                        autoComplete="tel"
                        textContentType="telephoneNumber"
                        inputMode="tel"
                        maxLength={16}
                        style={[styles.input, styles.ltr, { flex: 1 }]}
                      />
                    </View>
                  )}

                  <View>
                    <TextInput
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        clearError();
                      }}
                      placeholder="كلمة المرور"
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="كلمة المرور"
                      secureTextEntry={!show}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete={isSignup ? 'new-password' : 'current-password'}
                      textContentType={isSignup ? 'newPassword' : 'password'}
                      maxLength={72}
                      returnKeyType={isSignup ? 'next' : 'done'}
                      onSubmitEditing={isSignup ? undefined : submit}
                      style={[styles.input, styles.ltr, { paddingRight: 70 }]}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      onPress={() => setShow((s) => !s)}
                      hitSlop={8}
                      style={styles.eye}
                    >
                      <T size={13} weight="black" color={colors.seaDeep}>
                        {show ? 'إخفاء' : 'إظهار'}
                      </T>
                    </Pressable>
                  </View>

                  {isSignup ? (
                    <>
                      <TextInput
                        value={confirm}
                        onChangeText={(t) => {
                          setConfirm(t);
                          clearError();
                        }}
                        placeholder="أعد كتابة كلمة المرور"
                        placeholderTextColor={colors.muted}
                        accessibilityLabel="تأكيد كلمة المرور"
                        secureTextEntry={!show}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="new-password"
                        textContentType="newPassword"
                        maxLength={72}
                        returnKeyType="done"
                        onSubmitEditing={submit}
                        style={[styles.input, styles.ltr]}
                      />
                      <T size={13} color={colors.muted}>
                        8 أحرف على الأقل، فيها حروف إنجليزية وأرقام.
                      </T>
                    </>
                  ) : null}

                  {error ? <ErrorText text={error} /> : null}
                  <Button label={isSignup ? 'إنشاء الحساب' : 'دخول'} tone={isSignup ? 'gold' : 'green'} loading={busy} onPress={submit} />
                  <Pressable accessibilityRole="button" onPress={() => switchMode(isSignup ? 'signin' : 'signup')} hitSlop={8}>
                    <T size={14} center weight="black" color={colors.seaDeep}>
                      {isSignup ? 'عندك حساب؟ سجّل دخول' : 'ما عندك حساب؟ أنشئ حساباً جديداً'}
                    </T>
                  </Pressable>
                </>
              )}
            </Card>
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Segment({
  options,
  value,
  onChange,
  small,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  small?: boolean;
}) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            aria-selected={on}
            onPress={() => onChange(v)}
            style={[styles.segBtn, small && { height: 44 }, on && styles.segOn]}
          >
            <T weight={on ? 'black' : 'bold'} size={small ? 14 : 16} center color={on ? colors.ink : colors.muted}>
              {label}
            </T>
          </Pressable>
        );
      })}
    </View>
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
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.ink,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 54,
    backgroundColor: colors.cardSoft,
  },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  eye: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  prefix: {
    height: 54,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.sand,
    justifyContent: 'center',
  },
  error: { backgroundColor: '#FDECEC', borderRadius: radius.sm, padding: 10 },
});
