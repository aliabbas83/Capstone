import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BackIcon, UndoIcon } from '@/components/icons';
import { Button, Card, IconButton, Row, Screen, T } from '@/components/ui';
import { COMEBACK_POINTS, COMEBACK_TRIGGER, LEVEL_LIMITS, STEAL_SECONDS } from '@/game/engine';
import { LIFELINE_LABELS } from '@/game/lifelines';
import { levelLabel, timesLabel } from '@/game/levels';
import { CATEGORIES_PER_TEAM, DEMO_LANE_LENGTH, REAL_LANE_LENGTH } from '@/game/demo-questions';
import { colors, radius } from '@/theme';

/** The whole game in nine short steps: something the host can read out in under a minute. */
const STEPS = [
  `الفريقين يختارون ${CATEGORIES_PER_TEAM * 2} فئات بالتناوب، ${CATEGORIES_PER_TEAM} لكل فريق.`,
  `في دوركم اختاروا أي فئة منها، وبعدها النقاط: ${levelLabel(2)}، ${levelLabel(3)} أو ${levelLabel(4)}. كل ما زادت النقاط صار السؤال أصعب.`,
  `لكل فريق: ${levelLabel(2)} ${timesLabel(LEVEL_LIMITS[2])}، ${levelLabel(3)} ${timesLabel(LEVEL_LIMITS[3])}، ${levelLabel(4)} ${timesLabel(LEVEL_LIMITS[4])}. السرقة تُحسب من مرّاتكم، ولما تخلصونها كلها تتجدد.`,
  'المقدّم يقرأ السؤال بصوت عالي، يكشف الإجابة، ويضغط صح أو خطأ.',
  'جاوبتوا صح؟ تقدّموا بسبّاحكم، أو رجّعوا سبّاح الخصم نفس الخطوات.',
  `غلطتوا أو خلص الوقت؟ الفريق الثاني عنده ${STEAL_SECONDS} ثانية يسرق السؤال.`,
  `لكل فريق 3 مساعدات، كل وحدة مرة بالسباق: «${LIFELINE_LABELS.two}» (واحد صح وواحد غلط، وإذا غلطتوا ما فيه سرقة)، «${LIFELINE_LABELS.time}»، و«${LIFELINE_LABELS.swap}».`,
  `إذا صار الخصم على بعد ${COMEBACK_TRIGGER} خطوات أو أقل من النهاية، ينفتح لكم سؤال الإنقاذ +${COMEBACK_POINTS} مرة وحدة.`,
  `أول سبّاح يوصل خط النهاية ويرفع العلم يفوز. السباق ${REAL_LANE_LENGTH} خطوة، والتجربة المجانية ${DEMO_LANE_LENGTH}.`,
];

export default function HowToPlay() {
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Screen>
      <Row style={styles.header}>
        <IconButton label="رجوع" onPress={close}>
          <BackIcon />
        </IconButton>
        <T weight="black" size={24} accessibilityRole="header">
          طريقة اللعب
        </T>
      </Row>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={{ gap: 14 }}>
          {STEPS.map((text, i) => (
            <Row key={i} style={styles.step} accessible accessibilityLabel={`${i + 1}. ${text}`}>
              <View style={styles.num}>
                <T weight="black" size={15} color={colors.ink} center>
                  {i + 1}
                </T>
              </View>
              <T size={16} style={{ flex: 1 }}>
                {text}
              </T>
            </Row>
          ))}
        </Card>

        <View style={styles.note} accessible>
          <Row style={{ gap: 10, alignItems: 'flex-start' }}>
            <View style={{ paddingTop: 3 }}>
              <UndoIcon size={20} color={colors.ink} />
            </View>
            <T size={15} weight="bold" style={{ flex: 1 }}>
              ضغطتوا غلط؟ بعد كل قرار يطلع زر «تراجع» لكم ثواني، ويرجّع آخر قرار.
            </T>
          </Row>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="فهمنا، يلا نلعب" onPress={close} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  content: { padding: 20, gap: 14, paddingBottom: 24 },
  step: { gap: 12, alignItems: 'flex-start' },
  num: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  note: { backgroundColor: colors.sand, borderRadius: radius.lg, padding: 14 },
  footer: { paddingHorizontal: 20, paddingBottom: 12 },
});
