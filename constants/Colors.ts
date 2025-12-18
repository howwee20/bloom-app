// Bloom Theme - Coinbase-inspired with Orange Accent
// Using Zen Dots font for headers

export const theme = {
  // Accent color (replacing Coinbase blue #0052FF)
  accent: '#FFD7B5',
  accentDark: '#E5B896',
  accentLight: '#FFF0E5',

  // Backgrounds (Coinbase dark mode style)
  background: '#0A0B0D',
  backgroundSecondary: '#111214',
  backgroundTertiary: '#16171A',
  card: '#1E2026',
  cardHover: '#252830',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#8A919E',
  textTertiary: '#5F6673',
  textInverse: '#0A0B0D',

  // Borders
  border: '#2C2F36',
  borderLight: '#3C3F46',

  // Status colors
  success: '#00D395',
  successBg: '#0D2E26',
  error: '#F6465D',
  errorBg: '#2E1519',
  warning: '#F0B90B',
  warningBg: '#2E2B15',

  // Tab bar
  tabBar: '#0A0B0D',
  tabBarBorder: '#1E2026',
  tabIconDefault: '#5F6673',
  tabIconSelected: '#FFD7B5',
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
