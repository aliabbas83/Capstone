import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { QuestionImage } from '@/game/demo-questions';
import { APP_BUILD } from '@/lib/build';
import { reportError } from '@/lib/monitoring';
import { pictures } from '@/lib/picture-loader';
import { colors, radius } from '@/theme';
import { ExpandIcon } from './icons';
import { Button, T } from './ui';

/** If nothing has shown after this long, stop the spinner and offer "try again". */
const LOAD_LIMIT_MS = 12_000;
/** A flag that fails to load is tried again this many times before the host sees an error. */
const QUIET_RETRIES = 2;

type Status = 'loading' | 'ready' | 'error';

/**
 * The picture of a picture question (a flag or a country's outline).
 * Maps are downloaded once (and usually already are, see preloadPicture). A failed load is
 * tried again quietly; after that the host gets a "try again" button, never an endless spinner.
 * Once the picture is showing, a later network hiccup does not take it away.
 */
export function QuestionPicture({ image }: { image: QuestionImage }) {
  const svgUri = image.kind === 'svg' ? image.uri : null;
  // Pictures that are part of the app's code (the demo flags) need no download at all.
  const builtIn = image.uri.startsWith('data:');
  const [xml, setXml] = useState<string | null>(() => (svgUri ? pictures.peek(svgUri) : null));
  const [status, setStatus] = useState<Status>(() => (svgUri && pictures.peek(svgUri) ? 'ready' : 'loading'));
  const [attempt, setAttempt] = useState(0);
  const [big, setBig] = useState(false);
  const quiet = useRef(0);
  // How it failed, for the small code under the error: E = the picture reported an error, T = it never answered.
  const [reason, setReason] = useState<'E' | 'T'>('E');

  // Maps: one download, shared with the preload, with its own retries.
  useEffect(() => {
    if (!svgUri || xml) return;
    let alive = true;
    pictures.loadSvg(svgUri).then(
      (text) => {
        if (!alive) return;
        setXml(text);
        setStatus('ready');
      },
      (e) => {
        if (!alive) return;
        setReason(e instanceof Error && e.message === 'timeout' ? 'T' : 'E');
        setStatus('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [svgUri, xml, attempt]);

  // Safety net: a load that never answers becomes an error with a retry button.
  useEffect(() => {
    if (status !== 'loading') return;
    const id = setTimeout(() => {
      setReason('T');
      setStatus((s) => (s === 'loading' ? 'error' : s));
    }, LOAD_LIMIT_MS);
    return () => clearTimeout(id);
  }, [status, attempt]);

  // Tell Sentry when the host actually sees the error, so the real cause can be found later.
  useEffect(() => {
    if (status !== 'error') return;
    reportError(new Error(`question picture failed (${builtIn ? 'built-in' : image.kind})`), 'question_picture');
  }, [status, builtIn, image.kind]);

  const onLoad = () => setStatus('ready');
  const onError = () => {
    if (status === 'ready') return;
    if (quiet.current < QUIET_RETRIES) {
      quiet.current += 1;
      setAttempt((a) => a + 1);
      return;
    }
    setReason('E');
    setStatus('error');
  };
  const retry = () => {
    quiet.current = 0;
    setStatus('loading');
    setAttempt((a) => a + 1);
  };

  const picture = (watch: boolean) => {
    if (svgUri) return xml ? <SvgXml xml={xml} width="100%" height="100%" /> : null;
    return (
      <Image
        key={attempt}
        source={{ uri: image.uri }}
        style={styles.img}
        resizeMode="contain"
        onLoad={watch ? onLoad : undefined}
        onError={watch ? onError : undefined}
      />
    );
  };

  return (
    <View style={styles.picture}>
      {status !== 'error' ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          disabled={status !== 'ready'}
          accessibilityRole="imagebutton"
          accessibilityLabel="صورة السؤال، اضغط لتكبيرها"
          onPress={() => setBig(true)}
        >
          <View style={styles.inner}>{picture(true)}</View>
          {status === 'ready' ? (
            <View style={styles.expandHint} pointerEvents="none">
              <ExpandIcon size={18} color={colors.ink} />
            </View>
          ) : null}
        </Pressable>
      ) : null}
      <Modal visible={big} transparent animationType="fade" onRequestClose={() => setBig(false)} statusBarTranslucent>
        <Pressable
          style={styles.bigBackdrop}
          accessibilityRole="button"
          accessibilityLabel="صورة السؤال مكبّرة، اضغط للرجوع"
          onPress={() => setBig(false)}
        >
          <View style={styles.bigFrame}>{picture(false)}</View>
          <T size={15} weight="bold" color="#FFFFFF" center>
            اضغط في أي مكان للرجوع
          </T>
        </Pressable>
      </Modal>
      {status === 'loading' ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.ink} accessibilityLabel="جاري تحميل الصورة" />
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={[styles.overlay, { gap: 8 }]} accessibilityLiveRegion="polite">
          <T size={14} center color={colors.redDeep}>
            ما قدرنا نحمّل الصورة. تأكد من الاتصال.
          </T>
          <Button label="حاول مرة ثانية" tone="white" size="md" onPress={retry} />
          {/* A short code for support: where the picture comes from, how it failed, and the app version. */}
          <T size={11} center color={colors.muted}>
            {`${builtIn ? 'B' : image.kind === 'svg' ? 'S' : 'P'}${reason} · ${APP_BUILD}`}
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  picture: {
    height: 250,
    borderRadius: radius.lg,
    backgroundColor: '#EEF7FB',
    overflow: 'hidden',
  },
  inner: { flex: 1, padding: 10 },
  img: { width: '100%', height: '100%' },
  expandHint: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigBackdrop: { flex: 1, backgroundColor: 'rgba(6, 24, 40, 0.94)', justifyContent: 'center', padding: 16, gap: 16 },
  bigFrame: { width: '100%', aspectRatio: 1, backgroundColor: '#EEF7FB', borderRadius: radius.lg, padding: 12 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 12 },
});
