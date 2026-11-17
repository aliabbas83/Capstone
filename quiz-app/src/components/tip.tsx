import { StyleSheet, View } from 'react-native';
import { TIP_TEXT, type TipId } from '@/game/tips';
import { useTip } from '@/lib/use-tip';
import { colors, radius } from '@/theme';
import { InfoIcon } from './icons';
import { FadeIn, Row, T } from './ui';

/** A one-line tip shown the first time a moment happens on this phone (steal, comeback, move or push). */
export function FirstTimeTip({ id, active = true }: { id: TipId; active?: boolean }) {
  const show = useTip(id, active);
  if (!show) return null;
  return (
    <FadeIn>
      <View style={styles.tip} accessibilityRole="text" accessibilityLiveRegion="polite">
        <Row style={{ gap: 8, alignItems: 'flex-start' }}>
          <View style={{ paddingTop: 2 }}>
            <InfoIcon size={20} color={colors.ink} />
          </View>
          <T size={14} weight="bold" color={colors.ink} style={{ flex: 1 }}>
            {TIP_TEXT[id]}
          </T>
        </Row>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  tip: { backgroundColor: colors.sand, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
});
