import { Platform } from 'react-native';

export const Colors = {
  background: '#F3EEE6',
  surface: '#FBF8F3',
  surfaceSunken: '#E9E1D5',
  mirror: '#DCD2C4',
  mirrorDeep: '#C9BDAC',
  ink: '#211C18',
  inkSoft: '#4A423B',
  muted: '#7C7168',
  line: '#DDD3C5',
  accent: '#A8502B',
  accentSoft: '#F0DDD0',
  onAccent: '#FFF8F2',
  worn: '#7A6A2F',
  wornSoft: '#EFE6C4',
  laundry: '#2F5D7A',
  laundrySoft: '#D5E4EE',
  success: '#3F6B4A',
  successSoft: '#DCE9DD',
  danger: '#9B3A2E',
  mock: '#5B4B8A',
  mockSoft: '#E6E0F3',
} as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif' },
  web: { sans: 'system-ui, -apple-system, Segoe UI, sans-serif', serif: "Georgia, 'Times New Roman', serif" },
  default: { sans: 'normal', serif: 'serif' },
})!;

export const Spacing = { half: 2, one: 4, two: 8, three: 12, four: 16, five: 24, six: 32 } as const;

export const Radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
