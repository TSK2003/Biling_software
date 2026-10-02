// ============================================================
// Application Theme Management System
// Allows users to switch application primary/accent color scheme
// ============================================================

export interface ThemeOption {
  id: string;
  name: string;
  tagline: string;
  primaryHex: string;
  accentHex: string;
  badgeHex: string;
  colors: Record<number, string>; // shade -> "R G B" space-separated
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'navy',
    name: 'Corporate Navy',
    tagline: 'Deep Zoho-style dark navy & midnight slate (Default)',
    primaryHex: '#172554',
    accentHex: '#1e3a8a',
    badgeHex: '#dbeafe',
    colors: {
      50: '239 246 255',
      100: '219 234 254',
      200: '191 219 254',
      300: '147 197 253',
      400: '59 130 246',
      500: '29 78 216',
      600: '30 64 175',
      700: '30 58 138',
      800: '23 37 84',
      900: '15 23 42',
      950: '2 6 23',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald Forest',
    tagline: 'Rich natural emerald & deep forest green',
    primaryHex: '#064e3b',
    accentHex: '#047857',
    badgeHex: '#d1fae5',
    colors: {
      50: '236 253 245',
      100: '209 250 229',
      200: '167 243 208',
      300: '110 231 183',
      400: '52 211 153',
      500: '16 185 129',
      600: '5 150 105',
      700: '4 120 87',
      800: '6 78 59',
      900: '2 44 34',
      950: '1 28 22',
    },
  },
  {
    id: 'blue',
    name: 'Royal Sapphire',
    tagline: 'Vibrant modern sapphire & classic royal blue',
    primaryHex: '#1e40af',
    accentHex: '#2563eb',
    badgeHex: '#e0f2fe',
    colors: {
      50: '240 249 255',
      100: '224 242 254',
      200: '186 230 253',
      300: '125 211 252',
      400: '56 189 248',
      500: '14 165 233',
      600: '2 132 199',
      700: '3 105 161',
      800: '7 89 133',
      900: '12 74 110',
      950: '8 47 73',
    },
  },
  {
    id: 'burgundy',
    name: 'Crimson Burgundy',
    tagline: 'Sophisticated wine red & deep crimson rose',
    primaryHex: '#881337',
    accentHex: '#be123c',
    badgeHex: '#ffe4e6',
    colors: {
      50: '255 241 242',
      100: '255 228 230',
      200: '254 205 211',
      300: '253 164 175',
      400: '251 113 133',
      500: '244 63 94',
      600: '225 29 72',
      700: '190 18 60',
      800: '136 19 55',
      900: '76 5 25',
      950: '50 3 16',
    },
  },
  {
    id: 'purple',
    name: 'Amethyst Purple',
    tagline: 'Imperial amethyst & deep velvet purple',
    primaryHex: '#4c1d95',
    accentHex: '#6d28d9',
    badgeHex: '#f3e8ff',
    colors: {
      50: '250 245 255',
      100: '243 232 255',
      200: '233 213 255',
      300: '216 180 254',
      400: '192 132 252',
      500: '168 85 247',
      600: '147 51 234',
      700: '126 34 206',
      800: '88 28 135',
      900: '59 7 100',
      950: '46 16 101',
    },
  },
  {
    id: 'teal',
    name: 'Ocean Teal',
    tagline: 'Executive dark teal & maritime cyan',
    primaryHex: '#134e4a',
    accentHex: '#0f766e',
    badgeHex: '#ccfbf1',
    colors: {
      50: '240 253 250',
      100: '204 251 241',
      200: '153 246 228',
      300: '94 234 212',
      400: '45 212 191',
      500: '20 184 166',
      600: '13 148 136',
      700: '15 118 110',
      800: '19 78 74',
      900: '4 47 46',
      950: '2 32 31',
    },
  },
  {
    id: 'slate',
    name: 'Titanium Slate',
    tagline: 'Modern high-contrast monochrome & dark graphite',
    primaryHex: '#1e293b',
    accentHex: '#334155',
    badgeHex: '#e2e8f0',
    colors: {
      50: '248 250 252',
      100: '241 245 249',
      200: '226 232 240',
      300: '203 213 225',
      400: '148 163 184',
      500: '100 116 139',
      600: '71 85 105',
      700: '51 65 85',
      800: '30 41 59',
      900: '15 23 42',
      950: '2 6 23',
    },
  },
  {
    id: 'bronze',
    name: 'Warm Bronze',
    tagline: 'Rustic warm amber & dark copper bronze',
    primaryHex: '#78350f',
    accentHex: '#b45309',
    badgeHex: '#fef3c7',
    colors: {
      50: '255 251 235',
      100: '254 243 199',
      200: '253 230 138',
      300: '252 211 77',
      400: '251 191 36',
      500: '245 158 11',
      600: '217 119 6',
      700: '180 83 9',
      800: '120 53 15',
      900: '67 20 7',
      950: '42 12 4',
    },
  },
];

export function getActiveThemeId(): string {
  try {
    return localStorage.getItem('pos_app_theme') || 'navy';
  } catch {
    return 'navy';
  }
}

export function applyTheme(themeId: string): void {
  const theme = THEME_OPTIONS.find((t) => t.id === themeId) || THEME_OPTIONS[0];
  const root = document.documentElement;

  // Set all color shades as CSS RGB variables
  Object.entries(theme.colors).forEach(([shade, rgbVal]) => {
    root.style.setProperty(`--color-primary-${shade}`, rgbVal);
  });

  // Track data attribute on HTML
  root.setAttribute('data-theme', theme.id);

  try {
    localStorage.setItem('pos_app_theme', theme.id);
  } catch {
    // ignore
  }
}

// Immediately apply theme upon file evaluation to eliminate flicker
if (typeof window !== 'undefined') {
  applyTheme(getActiveThemeId());
}
