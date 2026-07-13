/**
 * Дизайн-система приложения.
 * Тёмная тема по умолчанию — выглядит дорого и снижает нагрузку на глаза
 * при частом открытии приложения (учёт трат — это ежедневная привычка).
 */

export const palette = {
  // Фон и поверхности (глубокий сине-графитовый, не «чёрный ноль»)
  bg: '#0E1116',
  surface: '#171B22',
  surfaceElevated: '#1E242D',
  border: '#2A313C',

  // Текст
  text: '#F2F5F8',
  textMuted: '#9AA4B2',
  textFaint: '#5E6875',

  // Акцент — спокойный индиго/фиолетовый (доверие + современность)
  accent: '#6D8BFF',
  accentSoft: 'rgba(109, 139, 255, 0.14)',

  // Смысловые цвета денег
  income: '#3ECF8E', // доход — зелёный
  incomeSoft: 'rgba(62, 207, 142, 0.14)',
  expense: '#FF6B7A', // расход — коралловый (мягче чистого красного)
  expenseSoft: 'rgba(255, 107, 122, 0.14)',
  credit: '#F5A623', // кредиты/долги — янтарный
  creditSoft: 'rgba(245, 166, 35, 0.14)',
  warning: '#F5A623',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const font = {
  // Размеры
  size: {
    caption: 12,
    body: 15,
    subtitle: 17,
    title: 22,
    display: 34,
    hero: 40,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

export const theme = { palette, spacing, radius, font } as const;
export type Theme = typeof theme;
