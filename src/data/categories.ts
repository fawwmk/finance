import { Category } from '../types';
import { palette } from '../theme/theme';

/**
 * Встроенные категории. Пользователь сможет добавлять свои позже.
 * Иконки — из набора Ionicons (@expo/vector-icons).
 */
export const DEFAULT_CATEGORIES: Category[] = [
  // --- Расходы ---
  { id: 'groceries', name: 'Продукты', icon: 'cart', color: '#3ECF8E', kind: 'expense', system: true },
  { id: 'fuel', name: 'Бензин', icon: 'car-sport', color: '#6D8BFF', kind: 'expense', system: true },
  { id: 'subscriptions', name: 'Подписки', icon: 'repeat', color: '#B57BFF', kind: 'expense', system: true },
  { id: 'credit', name: 'Кредиты', icon: 'card', color: palette.credit, kind: 'expense', system: true },
  { id: 'cafe', name: 'Кафе и рестораны', icon: 'restaurant', color: '#FF8A5B', kind: 'expense', system: true },
  { id: 'transport', name: 'Транспорт', icon: 'bus', color: '#4FC3F7', kind: 'expense', system: true },
  { id: 'home', name: 'Дом и ЖКХ', icon: 'home', color: '#8D9CB0', kind: 'expense', system: true },
  { id: 'health', name: 'Здоровье', icon: 'medkit', color: '#FF6B7A', kind: 'expense', system: true },
  { id: 'shopping', name: 'Покупки', icon: 'pricetags', color: '#F06292', kind: 'expense', system: true },
  { id: 'entertainment', name: 'Развлечения', icon: 'game-controller', color: '#9575CD', kind: 'expense', system: true },
  { id: 'other_expense', name: 'Другое', icon: 'ellipsis-horizontal', color: '#9AA4B2', kind: 'expense', system: true },

  // --- Доходы ---
  { id: 'salary', name: 'Зарплата', icon: 'wallet', color: '#3ECF8E', kind: 'income', system: true },
  { id: 'advance', name: 'Аванс', icon: 'cash', color: '#26C6DA', kind: 'income', system: true },
  { id: 'freelance', name: 'Подработка', icon: 'briefcase', color: '#6D8BFF', kind: 'income', system: true },
  { id: 'gift', name: 'Подарок', icon: 'gift', color: '#F06292', kind: 'income', system: true },
  { id: 'other_income', name: 'Другое', icon: 'add-circle', color: '#9AA4B2', kind: 'income', system: true },
];

export const categoryById = (id: string, cats: Category[] = DEFAULT_CATEGORIES) =>
  cats.find((c) => c.id === id);
