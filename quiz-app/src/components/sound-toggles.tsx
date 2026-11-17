import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { toggleMusic, toggleSfx, useSoundSettings } from '@/lib/sound';
import { colors, radius } from '@/theme';
import { MusicIcon, SpeakerIcon } from './icons';
import { haptic, Row, T } from './ui';

/** Two switches: sound effects and background music. Choices are remembered. */
export function SoundToggles({ compact }: { compact?: boolean }) {
  const { sfx, music } = useSoundSettings();
  return (
    <Row style={{ gap: 8, justifyContent: 'center' }}>
      <Chip
        on={sfx}
        icon={<SpeakerIcon size={compact ? 18 : 20} off={!sfx} color={sfx ? colors.ink : colors.muted} />}
        label="الأصوات"
        onPress={toggleSfx}
        compact={compact}
      />
      <Chip
        on={music}
        icon={<MusicIcon size={compact ? 18 : 20} color={music ? colors.ink : colors.muted} />}
        label="الموسيقى"
        onPress={toggleMusic}
        compact={compact}
      />
    </Row>
  );
}

function Chip({ on, icon, label, onPress, compact }: { on: boolean; icon: ReactNode; label: string; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      aria-checked={on}
      hitSlop={6}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.compact,
        { backgroundColor: on ? colors.sand : colors.cardSoft, borderColor: on ? colors.goldDeep : colors.line },
        pressed && { transform: [{ scale: 0.95 }] },
      ]}
    >
      <Row style={{ gap: 6 }}>
        {icon}
        <T weight="black" size={compact ? 13 : 15} color={on ? colors.ink : colors.muted}>
          {label}: {on ? 'تشغيل' : 'إيقاف'}
        </T>
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 2, justifyContent: 'center' },
  compact: { minHeight: 44, paddingHorizontal: 10 },
});
