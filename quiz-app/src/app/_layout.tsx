import { Cairo_500Medium, Cairo_700Bold, Cairo_900Black, useFonts } from '@expo-google-fonts/cairo';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GameProvider } from '@/game/game-store';
import { AuthProvider } from '@/lib/auth';
import { withMonitoring } from '@/lib/monitoring';
import { startSound } from '@/lib/sound';
import { colors } from '@/theme';

startSound();

export default withMonitoring(RootLayout);

function RootLayout() {
  const [loaded] = useFonts({ Cairo_500Medium, Cairo_700Bold, Cairo_900Black });

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.sea, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <GameProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_left', contentStyle: { backgroundColor: colors.sea } }}>
          <Stack.Screen name="race" options={{ gestureEnabled: false, animation: 'fade' }} />
        </Stack>
      </GameProvider>
    </AuthProvider>
  );
}
