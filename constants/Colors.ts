// Bloom Theme - Warm cream with Orange Accent
// Using Zen Dots font for headers

export const theme = {
  // Accent color - Bloom baby blue
  accent: '#A8D4E6',
  accentDark: '#7BB8D4',
  accentLight: '#E8F4FA',

  // Backgrounds - Warm cream palette
  background: '#FDF8F3',
  backgroundSecondary: '#F7F2ED',
  backgroundTertiary: '#F0EBE6',
  card: '#FFFFFF',
  cardHover: '#FDF8F3',

  // Text - Dark for readability on cream
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
  textTertiary: '#9A9A9A',
  textInverse: '#1A1A1A',

  // Borders - Soft warm tones
  border: 'rgba(0, 0, 0, 0.08)',
  borderLight: 'rgba(0, 0, 0, 0.05)',

  // Status colors
  success: '#00A878',
  successBg: '#E6F7F2',
  error: '#E53935',
  errorBg: '#FFEBEE',
  warning: '#F9A825',
  warningBg: '#FFF8E1',

  // Tab bar
  tabBar: '#FDF8F3',
  tabBarBorder: 'rgba(0, 0, 0, 0.08)',
  tabIconDefault: '#9A9A9A',
  tabIconSelected: '#A8D4E6',
};

// Font family constant
export const fonts = {
  heading: 'ZenDots',
  body: 'System',
};

// Legacy export for compatibility
const tintColorDark = theme.accent;

export default {
  light: {
    text: theme.textPrimary,
    background: theme.background,
    tint: tintColorDark,
    tabIconDefault: theme.tabIconDefault,
    tabIconSelected: tintColorDark,
  },
  dark: {
    text: theme.textPrimary,
    background: theme.background,
    tint: tintColorDark,
    tabIconDefault: theme.tabIconDefault,
    tabIconSelected: tintColorDark,
  },
};
