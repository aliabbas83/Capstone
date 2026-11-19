import { I18nManager, Platform } from 'react-native';

/** Bright cartoon daytime sea. Text colours are checked for ≥4.5:1 contrast on their backgrounds. */
export const colors = {
  sky: '#8EE0FF',
  seaLight: '#3CCBE6',
  sea: '#16A9D2',
  seaDeep: '#0B7DAE',
  foam: 'rgba(255,255,255,0.75)',
  sand: '#FFE6A6',
  ink: '#0B2545',
  inkSoft: '#3A5578',
  muted: '#5F7896',
  card: '#FFFFFF',
  cardSoft: '#F1FAFF',
  line: '#D3ECF6',
  gold: '#FFC83D',
  goldDeep: '#E0A100',
  green: '#22C55E',
  greenDeep: '#15803D',
  red: '#F04B4B',
  redDeep: '#B91C1C',
  wood: '#B97A40',
  woodDeep: '#7A4A1E',
  /** Swimmer's arms and legs. */
  skin: '#F6C8A0',
  skinDeep: '#D9996B',
  team: ['#FF8A1F', '#7B4DFF'] as const,
  teamDeep: ['#C25E00', '#5129D6'] as const,
  teamSoft: ['#FFEBD6', '#ECE5FF'] as const,
  /** Text colour that reads well on each team colour. */
  onTeam: ['#2B1400', '#FFFFFF'] as const,
};

export const fonts = {
  regular: 'Cairo_500Medium',
  bold: 'Cairo_700Bold',
  black: 'Cairo_900Black',
};

export const radius = { sm: 12, md: 18, lg: 24, xl: 32, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/**
 * Arabic-first layout. Native direction stays LTR (works the same in Expo Go and on web),
 * and we mirror rows ourselves.
 */
export const ROW = I18nManager.isRTL ? 'row' : 'row-reverse';
export const TEXT_START = I18nManager.isRTL ? 'left' : 'right';

export const nativeDriver = Platform.OS !== 'web';

export const shadow = {
  shadowColor: '#06314A',
  shadowOpacity: 0.18,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 5,
};
