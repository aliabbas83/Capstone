import type { AuthError, Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { Database } from './database.types';
import { setMonitoringUser } from './monitoring';
import { supabase, supabaseConfigured } from './supabase';

type Profile = Database['public']['Tables']['profiles']['Row'];

type AuthValue = {
  ready: boolean; // first session check finished
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

// Keep tokens fresh only while the app is in the foreground (Supabase RN guidance).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => {
    if (s === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setProfile(null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => setMonitoringUser(userId), [userId]);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) setProfileError('تعذّر تحميل حسابك. تأكد من الاتصال وحاول مرة ثانية.');
    else if (!data) {
      // Signed in on this phone, but the account no longer exists on the server.
      setProfile(null);
      setProfileError('ما لقينا حسابك. سجّل الخروج وادخل من جديد.');
    } else {
      setProfileError(null);
      setProfile(data);
    }
  }, [userId]);

  useEffect(() => {
    // Loading the profile is an external sync, so it belongs in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (userId) refreshProfile();
  }, [userId, refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileError(null);
  }, []);

  const value = useMemo(
    () => ({ ready, session, profile, profileError, refreshProfile, signOut }),
    [ready, session, profile, profileError, refreshProfile, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be inside <AuthProvider>');
  return v;
}

/** Friendly Arabic message for Supabase auth errors. */
export function authErrorMessage(e: AuthError | Error | null | undefined): string {
  if (!e) return '';
  const code = 'code' in e ? (e as AuthError).code : undefined;
  const status = 'status' in e ? (e as AuthError).status : undefined;
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(e.message))
    return 'الإيميل/الرقم أو كلمة المرور غير صحيحة.';
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(e.message))
    return 'هذا الحساب موجود. اختر "تسجيل الدخول" واكتب كلمة المرور.';
  if (code === 'weak_password') return 'كلمة المرور ضعيفة: 8 أحرف على الأقل، فيها حروف إنجليزية وأرقام.';
  if (code === 'email_address_invalid') return 'هذا الإيميل غير مقبول. جرّب إيميلاً آخر.';
  if (code === 'signup_disabled') return 'إنشاء الحسابات متوقف حالياً.';
  if (code === 'over_request_rate_limit' || status === 429) return 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة ثانية.';
  // supabase-js reports a failed request as AuthRetryableFetchError, often with status 0.
  if (status === 0 || e.name === 'AuthRetryableFetchError' || /network|fetch/i.test(e.message)) return 'لا يوجد اتصال بالإنترنت. تأكد من الشبكة وحاول مرة ثانية.';
  return 'صار خطأ غير متوقع. حاول مرة ثانية.';
}
