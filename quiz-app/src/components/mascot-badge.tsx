import { Image, Text, View } from 'react-native';
import { MASCOT_BY_ID } from '@/game/mascots';

/** Round team picture: the uploaded photo if there is one, otherwise the mascot. */
export function MascotBadge({
  mascotId,
  photoUri,
  size = 56,
  ring,
  label,
}: {
  mascotId: string;
  photoUri?: string | null;
  size?: number;
  ring?: string;
  label?: string;
}) {
  const m = MASCOT_BY_ID[mascotId] ?? MASCOT_BY_ID.falcon;
  const border = ring ? Math.max(2, Math.round(size / 18)) : 0;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ?? m.label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: m.bg,
        borderWidth: border,
        borderColor: ring,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ fontSize: size * 0.52, lineHeight: size * 0.7 }} aria-hidden>
          {m.emoji}
        </Text>
      )}
    </View>
  );
}
