import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { other, Points, RaceState, STEAL_SECONDS, TeamIdx } from '@/game/engine';
import type { Category, Question } from '@/game/demo-questions';
import { toArabicDigits } from '@/lib/arabic';
import { colors, nativeDriver, radius, ROW } from '@/theme';
import { play } from '@/lib/sound';
import { Confetti, TimerRing } from './effects';
import { SoundToggles } from './sound-toggles';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CrossIcon } from './icons';
import { MascotBadge } from './mascot-badge';
import { Flag } from './race-art';
import { Button, Card, haptic, PopIn, Row, T } from './ui';
import { useReduceMotion } from '@/lib/motion';

export const teamName = (race: RaceState, i: TeamIdx) => race.teams[i].name;

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.backdropContent} bounces={false}>
        {children}
      </ScrollView>
    </View>
  );
}

const PRAISE = ['كفو!', 'أبطال!', 'صح عليكم!', 'عاش!'];

/** Question card with countdown, reveal and right / wrong buttons. */
export function QuestionOverlay({
  race,
  question,
  category,
  timerSeconds,
  paused = false,
  onCorrect,
  onWrong,
}: {
  race: RaceState;
  question: Question;
  category: Category | undefined;
  timerSeconds: number;
  /** True while the pause menu is open: the countdown stops. */
  paused?: boolean;
  onCorrect: () => void;
  onWrong: () => void;
}) {
  const p = race.pending!;
  const stealing = race.phase === 'steal';
  const total = stealing ? STEAL_SECONDS : timerSeconds;
  const [seconds, setSeconds] = useState(total);
  const [revealed, setRevealed] = useState(false);
  const flip = useState(() => new Animated.Value(0))[0];
  const still = useReduceMotion();
  const answering = p.answering;
  const color = colors.team[answering];

  useEffect(() => {
    if (still) return flip.setValue(1);
    flip.setValue(0);
    Animated.spring(flip, { toValue: 1, friction: 7, tension: 60, useNativeDriver: nativeDriver }).start();
  }, [flip, still]);

  useEffect(() => {
    if (revealed || paused || seconds <= 0) return;
    const id = setTimeout(() => {
      setSeconds((s) => s - 1);
      if (seconds - 1 > 0 && seconds - 1 <= 5) play('tick'); // last five seconds
      if (seconds - 1 === 0) haptic('warning');
    }, 1000);
    return () => clearTimeout(id);
  }, [seconds, revealed, paused]);

  const timeUp = seconds <= 0 && !revealed;
  const rivalName = teamName(race, other(answering));
  // Wrong or out of time in the first round: hand over to the other team without showing the answer.
  const toSteal = () => {
    haptic('warning');
    onWrong();
  };

  return (
    <Backdrop>
      <Animated.View
        style={{
          opacity: flip,
          transform: [
            { perspective: 800 },
            { rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: ['80deg', '0deg'] }) },
          ],
        }}
      >
        <Card style={[styles.qCard, { borderColor: color }]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ gap: 6 }}>
              <Text style={{ fontSize: 20 }} aria-hidden>
                {category?.emoji}
              </Text>
              <T weight="black" size={16}>
                {category?.name}
              </T>
            </Row>
            <View style={[styles.pointsBadge, p.isComeback && { backgroundColor: colors.ink }]}>
              <T weight="black" size={16} color={p.isComeback ? colors.gold : colors.ink} center>
                {p.isComeback ? 'سؤال الإنقاذ ' : ''}+{toArabicDigits(p.points)}
              </T>
            </View>
          </Row>

          <View style={[styles.answerer, { backgroundColor: colors.teamSoft[answering] }]}>
            <Row style={{ gap: 10 }}>
              <MascotBadge mascotId={race.teams[answering].mascotId} photoUri={race.teams[answering].photoUri} size={40} ring={color} />
              <View style={{ flex: 1 }}>
                <T weight="black" size={16} accessibilityLiveRegion="polite">
                  {stealing ? `فرصة سرقة! يجاوب ${teamName(race, answering)}` : `يجاوب ${teamName(race, answering)}`}
                </T>
                {stealing ? (
                  <T size={13} color={colors.inkSoft}>
                    {teamName(race, p.owner)} ما جاوبوا صح
                  </T>
                ) : null}
              </View>
              <TimerRing seconds={seconds} total={total} color={color} size={64} />
            </Row>
          </View>

          <T weight="black" size={24} center style={{ marginVertical: 8 }}>
            {question.q}
          </T>

          {timeUp ? (
            <T weight="bold" size={15} center color={colors.redDeep} accessibilityLiveRegion="assertive">
              {stealing ? 'انتهى الوقت! اكشف الإجابة' : `انتهى الوقت! الفرصة الآن لـ ${rivalName}`}
            </T>
          ) : null}

          {revealed ? (
            <PopIn style={styles.answerBox}>
              <T size={13} color={colors.greenDeep} center>
                الإجابة الصحيحة
              </T>
              <T weight="black" size={22} center accessibilityLiveRegion="polite">
                {question.a}
              </T>
            </PopIn>
          ) : null}

          {revealed ? (
            <View style={{ gap: 10 }}>
              <T size={14} center color={colors.inkSoft}>
                هل جاوب {teamName(race, answering)} صح؟
              </T>
              <Row style={{ gap: 10 }}>
                <Button label="صح" tone="green" icon={<CheckIcon />} style={{ flex: 1 }} onPress={() => {
                  haptic('success');
                  onCorrect();
                }} />
                <Button label="خطأ" tone="red" icon={<CrossIcon />} style={{ flex: 1 }} onPress={() => {
                  haptic('warning');
                  onWrong();
                }} />
              </Row>
            </View>
          ) : timeUp && !stealing ? (
            <View style={{ gap: 10 }}>
              <Button label={`فرصة سرقة لـ ${rivalName}`} onPress={toSteal} />
              <Button label="اكشف الإجابة" tone="white" size="md" onPress={() => setRevealed(true)} />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Button label="اكشف الإجابة" onPress={() => setRevealed(true)} />
              {!stealing ? (
                <Button
                  label={`ما عرفوا؟ السرقة لـ ${rivalName}`}
                  tone="white"
                  size="md"
                  accessibilityHint="ينتقل السؤال للفريق الثاني بدون كشف الإجابة"
                  onPress={toSteal}
                />
              ) : null}
            </View>
          )}
          {!revealed ? (
            <T size={13} center color={colors.muted}>
              المقدّم يقرأ السؤال بصوت عالي
            </T>
          ) : null}
        </Card>
      </Animated.View>
    </Backdrop>
  );
}

/** After a correct answer: move forward or push the rival back. */
export function ChooseOverlay({ race, onChoose }: { race: RaceState; onChoose: (k: 'forward' | 'push') => void }) {
  const p = race.pending!;
  const scorer = p.answering;
  const rival = other(scorer);
  const rivalAtStart = race.teams[rival].position === 0;
  const praise = useState(() => PRAISE[Math.floor(Math.random() * PRAISE.length)])[0];
  return (
    <Backdrop>
      <Confetti count={24} />
      <PopIn>
        <Card style={[styles.qCard, { borderColor: colors.team[scorer] }]}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <MascotBadge mascotId={race.teams[scorer].mascotId} photoUri={race.teams[scorer].photoUri} size={76} ring={colors.team[scorer]} />
            <T weight="black" size={26} center accessibilityRole="header">
              {praise} {teamName(race, scorer)}
            </T>
            <T size={16} center color={colors.inkSoft}>
              ربحتوا {toArabicDigits(p.points)} خطوات. وش تبون؟
            </T>
          </View>

          <ChoiceCard
            tone={scorer}
            icon={<ArrowUpIcon color={colors.onTeam[scorer]} />}
            title="تقدّم بقاربنا"
            sub={`+${toArabicDigits(p.points)} خطوات لـ ${teamName(race, scorer)}`}
            onPress={() => onChoose('forward')}
          />
          <ChoiceCard
            tone={rival}
            icon={<ArrowDownIcon color={colors.onTeam[rival]} />}
            title={`ارجع قارب ${teamName(race, rival)}`}
            sub={rivalAtStart ? 'قاربهم عند البداية، ما يرجع أكثر' : `−${toArabicDigits(p.points)} خطوات لهم`}
            disabled={rivalAtStart}
            onPress={() => onChoose('push')}
          />
        </Card>
      </PopIn>
    </Backdrop>
  );
}

function ChoiceCard({
  tone,
  icon,
  title,
  sub,
  disabled,
  onPress,
}: {
  tone: TeamIdx;
  icon: ReactNode;
  title: string;
  sub: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic('heavy');
        onPress();
      }}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: colors.team[tone], borderBottomColor: colors.teamDeep[tone], opacity: disabled ? 0.45 : 1 },
        pressed && { transform: [{ translateY: 4 }], borderBottomWidth: 2 },
      ]}
    >
      <Row style={{ gap: 12 }}>
        <View style={styles.choiceIcon}>{icon}</View>
        <View style={{ flex: 1 }}>
          <T weight="black" size={19} color={colors.onTeam[tone]}>
            {title}
          </T>
          <T size={14} color={colors.onTeam[tone]}>
            {sub}
          </T>
        </View>
      </Row>
    </Pressable>
  );
}

export function WinnerOverlay({
  race,
  onPlayAgain,
  onChangeTeams,
  onEnd,
  ending = false,
}: {
  race: RaceState;
  onPlayAgain: () => void;
  onChangeTeams: () => void;
  onEnd: () => void;
  /** True while the game result is being saved before leaving. */
  ending?: boolean;
}) {
  const w = race.winner!;
  const l = other(w);
  // The flag starts down and is raised a moment after the card appears.
  const [flagUp, setFlagUp] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setFlagUp(true), 350);
    return () => clearTimeout(id);
  }, []);
  return (
    <Backdrop>
      <Confetti />
      <PopIn>
        <Card style={[styles.qCard, { borderColor: colors.gold, alignItems: 'stretch' }]}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <T size={16} center color={colors.inkSoft}>
              رفعوا العلم!
            </T>
            <Row style={{ gap: 6, alignItems: 'flex-end' }}>
              <MascotBadge mascotId={race.teams[w].mascotId} photoUri={race.teams[w].photoUri} size={110} ring={colors.team[w]} />
              <Flag color={colors.team[w]} raised={flagUp} size={56} />
            </Row>
            <T weight="black" size={32} center accessibilityRole="header" accessibilityLiveRegion="assertive">
              فاز {teamName(race, w)}!
            </T>
          </View>
          <Row style={{ gap: 10 }}>
            {[w, l].map((i) => (
              <View key={i} style={[styles.result, { backgroundColor: colors.teamSoft[i] }]}>
                <T weight="bold" size={14} center numberOfLines={1}>
                  {teamName(race, i)}
                </T>
                <T weight="black" size={22} center color={colors.teamDeep[i]}>
                  {toArabicDigits(race.teams[i].position)}/{toArabicDigits(race.laneLength)}
                </T>
              </View>
            ))}
          </Row>
          <Button label="العب مرة ثانية" disabled={ending} onPress={onPlayAgain} />
          <Row style={{ gap: 10 }}>
            <Button label="غيّر الفرق" tone="white" size="md" disabled={ending} style={{ flex: 1 }} onPress={onChangeTeams} />
            <Button label="إنهاء اللعبة" tone="white" size="md" loading={ending} style={{ flex: 1 }} onPress={onEnd} />
          </Row>
        </Card>
      </PopIn>
    </Backdrop>
  );
}

type LeaveAction = 'again' | 'teams' | 'end';
const LEAVE_LABELS: Record<LeaveAction, string> = {
  again: 'العب مرة ثانية',
  teams: 'غيّر الفرق',
  end: 'إنهاء اللعبة',
};

export function PauseMenu({
  onResume,
  onPlayAgain,
  onChangeTeams,
  onEnd,
  real = false,
  ending = false,
}: {
  onResume: () => void;
  onPlayAgain: () => void;
  onChangeTeams: () => void;
  onEnd: () => void;
  /** Real (paid) game: leaving loses this game and a new one uses another credit. */
  real?: boolean;
  /** True while the unfinished game is being saved before leaving. */
  ending?: boolean;
}) {
  // Every way out of a running race loses it, so each one asks first.
  const [confirm, setConfirm] = useState<LeaveAction | null>(null);
  const run: Record<LeaveAction, () => void> = { again: onPlayAgain, teams: onChangeTeams, end: onEnd };
  const warning =
    confirm === 'end' || !real
      ? 'متأكدين؟ بتضيع نتيجة هذا السباق.'
      : 'متأكدين؟ بتضيع نتيجة هذا السباق، والسباق الجديد ينحسب لعبة من رصيدكم.';
  return (
    <Backdrop>
      <PopIn>
        <Card style={[styles.qCard, { borderColor: colors.ink }]}>
          <T weight="black" size={26} center accessibilityRole="header">
            استراحة
          </T>
          <SoundToggles compact />
          <Button label="كمّل اللعب" disabled={ending} onPress={onResume} />
          {confirm ? (
            <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
              <T weight="bold" size={15} center color={colors.redDeep}>
                {LEAVE_LABELS[confirm]}: {warning}
              </T>
              <Row style={{ gap: 10 }}>
                <Button
                  label="إي، أكّد"
                  tone="red"
                  size="md"
                  loading={ending}
                  style={{ flex: 1 }}
                  onPress={run[confirm]}
                />
                <Button label="لا" tone="white" size="md" disabled={ending} style={{ flex: 1 }} onPress={() => setConfirm(null)} />
              </Row>
            </View>
          ) : (
            <>
              <Button label={LEAVE_LABELS.again} tone="white" onPress={() => setConfirm('again')} />
              <Button label={LEAVE_LABELS.teams} tone="white" onPress={() => setConfirm('teams')} />
              <Button label={LEAVE_LABELS.end} tone="white" onPress={() => setConfirm('end')} />
            </>
          )}
        </Card>
      </PopIn>
    </Backdrop>
  );
}

/** Bottom panel on the race screen: choose a category, then a difficulty (or the 5-point comeback). */
export function PickPanel({
  race,
  categories,
  remaining,
  onAsk,
  busy = false,
  error = null,
  onMenu,
  onCategoryChange,
}: {
  race: RaceState;
  categories: Category[];
  remaining: (categoryId: string, points: Points) => number;
  onAsk: (categoryId: string, points: Points, isComeback: boolean) => void;
  /** Opens the pause menu (used when no questions are left at all). */
  onMenu?: () => void;
  /** Called when the team picks or clears a category (hides an old error). */
  onCategoryChange?: () => void;
  /** True while the server is fetching the question. */
  busy?: boolean;
  error?: string | null;
}) {
  const [cat, setCatState] = useState<string | null>(null);
  const setCat = (id: string | null) => {
    setCatState(id);
    onCategoryChange?.();
  };
  const turn = race.turn;
  const team = race.teams[turn];
  const ids = [...race.teams[0].categories, ...race.teams[1].categories];
  const ownerOf = (id: string): TeamIdx => (race.teams[0].categories.includes(id) ? 0 : 1);
  const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
  const levels: { points: Points; label: string }[] = [
    { points: 2, label: 'سهل' },
    { points: 3, label: 'متوسط' },
    { points: 4, label: 'صعب' },
  ];
  const canComeback = team.comeback === 'available';
  const hasAny = (id: string) => [2, 3, 4].some((pt) => remaining(id, pt as Points) > 0) || (canComeback && remaining(id, 5) > 0);
  const allOut = ids.length > 0 && ids.every((id) => !hasAny(id));

  if (allOut) {
    return (
      <View style={styles.panel} accessibilityLiveRegion="polite">
        <T weight="black" size={17} center>
          خلصت كل أسئلة فئات هذا السباق
        </T>
        <T size={14} center color={colors.inkSoft}>
          العبوا مرة ثانية واختاروا فئات جديدة، أو أنهوا اللعبة.
        </T>
        {onMenu ? <Button label="افتح القائمة" size="md" onPress={onMenu} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Row style={{ gap: 10 }}>
        <MascotBadge mascotId={team.mascotId} photoUri={team.photoUri} size={36} ring={colors.team[turn]} />
        <T weight="black" size={17} style={{ flex: 1 }} accessibilityLiveRegion="polite">
          {cat ? `${byId[cat]?.name}: اختاروا الصعوبة` : `دور ${team.name}: اختاروا فئة`}
        </T>
        {cat ? (
          <Button label="غيّر" tone="white" size="sm" disabled={busy} onPress={() => setCat(null)} />
        ) : null}
      </Row>

      {!cat ? (
        <View style={styles.chips}>
          {ids.map((id) => {
            const c = byId[id];
            const o = ownerOf(id);
            const empty = !hasAny(id);
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={empty ? `${c?.name}، خلصت أسئلتها` : c?.name}
                accessibilityState={{ disabled: empty }}
                disabled={empty}
                onPress={() => {
                  haptic();
                  setCat(id);
                }}
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: colors.team[o], opacity: empty ? 0.4 : 1 },
                  pressed && { transform: [{ scale: 0.94 }] },
                ]}
              >
                <Text style={{ fontSize: 16 }} aria-hidden>
                  {c?.emoji}
                </Text>
                <T weight="bold" size={14}>
                  {c?.name}
                </T>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Row style={{ gap: 8 }}>
            {levels.map((lv) => {
              const left = remaining(cat, lv.points);
              return (
                <Button
                  key={lv.points}
                  size="md"
                  tone={turn === 0 ? 'team0' : 'team1'}
                  label={left === 0 ? `${lv.label}: خلصت` : `${lv.label} +${toArabicDigits(lv.points)}`}
                  disabled={left === 0 || busy}
                  style={{ flex: 1 }}
                  onPress={() => onAsk(cat, lv.points, false)}
                />
              );
            })}
          </Row>
          {canComeback ? (
            <Button
              label={remaining(cat, 5) === 0 ? 'سؤال الإنقاذ: خلصت في هذه الفئة' : 'سؤال الإنقاذ +٥ (مرة وحدة)'}
              disabled={remaining(cat, 5) === 0 || busy}
              onPress={() => onAsk(cat, 5, true)}
            />
          ) : null}
        </View>
      )}
      {busy ? <ActivityIndicator color={colors.ink} accessibilityLabel="جاري تجهيز السؤال" /> : null}
      {error ? (
        <T size={14} weight="bold" center color={colors.redDeep} accessibilityRole="alert">
          {error}
        </T>
      ) : null}
      {canComeback && !cat ? (
        <T size={13} center color={colors.ink}>
          ⭐ عندكم سؤال الإنقاذ بـ٥ نقاط — اختاروا فئة لاستخدامه
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 40, 66, 0.55)',
  },
  backdropContent: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  qCard: { gap: 14, borderWidth: 4, borderRadius: radius.xl, padding: 18 },
  pointsBadge: { backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 2 },
  answerer: { borderRadius: radius.lg, padding: 10 },
  answerBox: {
    backgroundColor: '#E3F9EA',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.green,
    padding: 12,
  },
  choice: { borderRadius: radius.lg, padding: 16, borderBottomWidth: 6 },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  result: { flex: 1, borderRadius: radius.md, padding: 10 },
  panel: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 16,
    gap: 12,
  },
  chips: { flexDirection: ROW, flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: {
    flexDirection: ROW,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2.5,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: colors.cardSoft,
  },
});
