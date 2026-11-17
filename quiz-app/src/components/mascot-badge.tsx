import { useState } from 'react';
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
  // If the photo can't be loaded (deleted from the phone, bad link), fall back to the mascot.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showPhoto = !!photoUri && photoUri !== failedUri;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ?? (showPhoto ? 'صورة الفريق' : m.label)}
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
      {showPhoto ? (
        <Image source={{ uri: photoUri }} style={{ width: size, height: size }} onError={() => setFailedUri(photoUri)} />
      ) : (
        <Text style={{ fontSize: size * 0.52, lineHeight: size * 0.7 }} aria-hidden>
          {m.emoji}
        </Text>
      )}
    </View>
  );
}
