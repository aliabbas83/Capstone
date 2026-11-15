import { ReactNode, useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { other, Points, RaceState, STEAL_SECONDS, TeamIdx } from '@/game/engine';
import type { Category, Question } from '@/game/demo-questions';
import { toArabicDigits } from '@/lib/arabic';
import { colors, nativeDriver, radius, ROW } from '@/theme';
import { Confetti, TimerRing } from './effects';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CrossIcon } from './icons';
import { MascotBadge } from './mascot-badge';
import { Button, Card, haptic, PopIn, Row, T } from './ui';

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
  onCorrect,
  onWrong,
}: {
  race: RaceState;
  question: Question;
  category: Category | undefined;
  timerSeconds: number;
  onCorrect: () => void;
  onWrong: () => void;
}) {
  const p = race.pending!;
  const stealing = race.phase === 'steal';
  const total = stealing ? STEAL_SECONDS : timerSeconds;
  const [seconds, setSeconds] = useState(total);
  const [revealed, setRevealed] = useState(false);
  const flip = useState(() => new Animated.Value(0))[0];
  const answering = p.answering;
  const color = colors.team[answering];

  useEffect(() => {
    flip.setValue(0);
    Animated.spring(flip, { toValue: 1, friction: 7, tension: 60, useNativeDriver: nativeDriver }).start();
  }, [flip]);

  useEffect(() => {
    if (revealed || seconds <= 0) return;
    const id = setTimeout(() => {
      setSeconds((s) => s - 1);
      if (seconds - 1 === 0) haptic('warning');
    }, 1000);
    return () => clearTimeout(id);
  }, [seconds, revealed]);

  const timeUp = seconds <= 0 && !revealed;

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
              انتهى الوقت! اكشف الإجابة
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
          ) : (
            <Button label="اكشف الإجابة" onPress={() => setRevealed(true)} />
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
}: {
  race: RaceState;
  onPlayAgain: () => void;
  onChangeTeams: () => void;
  onEnd: () => void;
}) {
  const w = race.winner!;
  const l = other(w);
  return (
    <Backdrop>
      <Confetti />
      <PopIn>
        <Card style={[styles.qCard, { borderColor: colors.gold, alignItems: 'stretch' }]}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <T size={16} center color={colors.inkSoft}>
              رفعوا العلم!
            </T>
            <MascotBadge mascotId={race.teams[w].mascotId} photoUri={race.teams[w].photoUri} size={110} ring={colors.team[w]} />
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
          <Button label="العب مرة ثانية" onPress={onPlayAgain} />
          <Row style={{ gap: 10 }}>
            <Button label="غيّر الفرق" tone="white" size="md" style={{ flex: 1 }} onPress={onChangeTeams} />
            <Button label="إنهاء اللعبة" tone="white" size="md" style={{ flex: 1 }} onPress={onEnd} />
          </Row>
        </Card>
      </PopIn>
    </Backdrop>
  );
}

export function PauseMenu({
  onResume,
  onPlayAgain,
  onChangeTeams,
  onEnd,
}: {
  onResume: () => void;
  onPlayAgain: () => void;
  onChangeTeams: () => void;
  onEnd: () => void;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  return (
    <Backdrop>
      <PopIn>
        <Card style={[styles.qCard, { borderColor: colors.ink }]}>
          <T weight="black" size={26} center accessibilityRole="header">
            استراحة
          </T>
          <Button label="كمّل اللعب" onPress={onResume} />
          <Button label="العب مرة ثانية" tone="white" onPress={onPlayAgain} />
          <Button label="غيّر الفرق" tone="white" onPress={onChangeTeams} />
          {confirmEnd ? (
            <View style={{ gap: 8 }}>
              <T size={15} center color={colors.redDeep}>
                متأكدين؟ بتضيع نتيجة هذا السباق.
              </T>
              <Row style={{ gap: 10 }}>
                <Button label="إي، أنهِ" tone="red" size="md" style={{ flex: 1 }} onPress={onEnd} />
                <Button label="لا" tone="white" size="md" style={{ flex: 1 }} onPress={() => setConfirmEnd(false)} />
              </Row>
            </View>
          ) : (
            <Button label="إنهاء اللعبة" tone="white" onPress={() => setConfirmEnd(true)} />
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
}: {
  race: RaceState;
  categories: Category[];
  remaining: (categoryId: string, points: Points) => number;
  onAsk: (categoryId: string, points: Points, isComeback: boolean) => void;
}) {
  const [cat, setCat] = useState<string | null>(null);
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

  return (
    <View style={styles.panel}>
      <Row style={{ gap: 10 }}>
        <MascotBadge mascotId={team.mascotId} photoUri={team.photoUri} size={36} ring={colors.team[turn]} />
        <T weight="black" size={17} style={{ flex: 1 }} accessibilityLiveRegion="polite">
          {cat ? `${byId[cat]?.name}: اختاروا الصعوبة` : `دور ${team.name}: اختاروا فئة`}
        </T>
        {cat ? (
          <Button label="غيّر" tone="white" size="sm" onPress={() => setCat(null)} />
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
                  label={`${lv.label} +${toArabicDigits(lv.points)}`}
                  disabled={left === 0}
                  style={{ flex: 1 }}
                  onPress={() => onAsk(cat, lv.points, false)}
                />
              );
            })}
          </Row>
          {canComeback ? (
            <Button
              label="سؤال الإنقاذ +٥ (مرة وحدة)"
              disabled={remaining(cat, 5) === 0}
              onPress={() => onAsk(cat, 5, true)}
            />
          ) : null}
        </View>
      )}
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
