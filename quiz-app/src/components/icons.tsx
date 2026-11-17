import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';

type P = { size?: number; color?: string };

const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 2.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

export const PauseIcon = ({ size = 22, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M8 5v14M16 5v14" {...stroke(color)} strokeWidth={3.2} />
  </Svg>
);

/** Points right in RTL = "back". */
export const BackIcon = ({ size = 22, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M9 5l7 7-7 7" {...stroke(color)} strokeWidth={3} />
  </Svg>
);

export const ArrowUpIcon = ({ size = 26, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 20V5M5 11l7-7 7 7" {...stroke(color)} strokeWidth={3} />
  </Svg>
);

export const ArrowDownIcon = ({ size = 26, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 4v15M5 13l7 7 7-7" {...stroke(color)} strokeWidth={3} />
  </Svg>
);

export const CheckIcon = ({ size = 22, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 12.5l4.5 4.5L19 7" {...stroke(color)} strokeWidth={3.2} />
  </Svg>
);

export const CrossIcon = ({ size = 22, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 6l12 12M18 6L6 18" {...stroke(color)} strokeWidth={3.2} />
  </Svg>
);

export const ImageIcon = ({ size = 20, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" {...stroke(color)} />
    <Path d="M4 16l4.5-4.5 4 4L15 13l5 5" {...stroke(color)} />
    <Path d="M15.5 8.5h.01" {...stroke(color)} strokeWidth={3.5} />
  </Svg>
);

export const UndoIcon = ({ size = 18, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M15 7h-5a5 5 0 000 10h6M15 7l-3-3M15 7l-3 3" {...stroke(color)} />
  </Svg>
);

/** Speaker; `off` adds a cross for "muted". */
export const SpeakerIcon = ({ size = 20, color = colors.ink, off }: P & { off?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" {...stroke(color)} />
    {off ? (
      <Path d="M16 9.5l5 5M21 9.5l-5 5" {...stroke(color)} />
    ) : (
      <Path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" {...stroke(color)} />
    )}
  </Svg>
);

export const MusicIcon = ({ size = 20, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M9 18V6l10-2v12" {...stroke(color)} />
    <Path d="M9 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM19 16a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" {...stroke(color)} />
  </Svg>
);
