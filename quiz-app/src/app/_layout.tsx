import { Cairo_500Medium, Cairo_700Bold, Cairo_900Black, useFonts } from '@expo-google-fonts/cairo';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GameProvider } from '@/game/game-store';
import { colors } from '@/theme';

export default function RootLayout() {
  const [loaded] = useFonts({ Cairo_500Medium, Cairo_700Bold, Cairo_900Black });

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.sea, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <GameProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_left', contentStyle: { backgroundColor: colors.sea } }}>
        <Stack.Screen name="race" options={{ gestureEnabled: false, animation: 'fade' }} />
      </Stack>
    </GameProvider>
  );
}
