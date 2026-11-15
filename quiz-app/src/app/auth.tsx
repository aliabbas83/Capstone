import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BackIcon } from '@/components/icons';
import { Button, Card, IconButton, Row, Screen, T } from '@/components/ui';
import { colors } from '@/theme';

// Placeholder until milestone M4 (Supabase email + phone codes).
export default function Auth() {
  const { method } = useLocalSearchParams<{ method?: string }>();
  const byPhone = method === 'phone';
  return (
    <Screen style={styles.page}>
      <Row style={{ gap: 12 }}>
        <IconButton label="رجوع" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <T weight="black" size={24} accessibilityRole="header">
          {byPhone ? 'التسجيل برقم الهاتف' : 'التسجيل بالإيميل'}
        </T>
      </Row>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Card style={{ gap: 12 }}>
          <T weight="black" size={20} center>
            قريباً
          </T>
          <T size={16} center color={colors.inkSoft}>
            التسجيل والدفع يُضافان في المرحلة القادمة. جرّب اللعبة المجانية الآن!
          </T>
          <Button label="جرّب مجاناً" onPress={() => router.replace('/')} />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20 },
});
