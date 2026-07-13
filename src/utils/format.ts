import { CurrencyCode } from '../types';

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  GBP: '£',
  KGS: 'сом',
  KZT: '₸',
};

export const CURRENCY_NAME: Record<CurrencyCode, string> = {
  RUB: 'Рубль',
  USD: 'Доллар',
  EUR: 'Евро',
  GBP: 'Фунт',
  KGS: 'Сом',
  KZT: 'Тенге',
};

export const ALL_CURRENCIES: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'KGS', 'KZT', 'GBP'];

/** Форматирует сумму: 12000 -> "12 000 ₽". */
export function formatMoney(amount: number, currency: CurrencyCode = 'RUB'): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // узкий неразрывный пробел
  return `${sign}${digits} ${CURRENCY_SYMBOL[currency]}`;
}

/** Курс валюты — с копейками: 78.4231 -> "78,42 ₽". */
export function formatRate(value: number, currency: CurrencyCode = 'RUB'): string {
  return `${value.toFixed(2).replace('.', ',')} ${CURRENCY_SYMBOL[currency]}`;
}

/** Короткий формат для крупных сумм: 1250000 -> "1,25 млн". */
export function formatMoneyShort(amount: number, currency: CurrencyCode = 'RUB'): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(2).replace('.', ',')} млн ${CURRENCY_SYMBOL[currency]}`;
  if (abs >= 100_000) return `${Math.round(amount / 1000)} тыс ${CURRENCY_SYMBOL[currency]}`;
  return formatMoney(amount, currency);
}

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** ISO YYYY-MM-DD текущего дня в местном времени. */
export function todayISO(): string {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "2026-07-06" -> "6 июля". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "2026-07-06" -> "6 июля, пн". */
export function formatDateFull(iso: string): string {
  const date = new Date(iso + 'T00:00:00');
  return `${formatDate(iso)}, ${WEEKDAYS[date.getDay()]}`;
}

/** Человеческий ярлык: Сегодня / Вчера / дата. */
export function relativeDay(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Сегодня';
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  if (iso === toISODate(d)) return 'Вчера';
  return formatDate(iso);
}

/**
 * Ближайшая дата, когда наступит указанное число месяца.
 * Если это число в текущем месяце уже прошло — берём следующий месяц.
 * 31-е число в коротком месяце обрезается до последнего дня.
 */
export function nextMonthlyDate(day: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const clamp = (year: number, month: number) =>
    Math.min(day, new Date(year, month + 1, 0).getDate());

  const thisMonth = new Date(y, m, clamp(y, m));
  if (toISODate(thisMonth) >= todayISO()) return toISODate(thisMonth);

  const next = new Date(y, m + 1, 1);
  next.setDate(clamp(next.getFullYear(), next.getMonth()));
  return toISODate(next);
}

/** Количество дней до даты (может быть отрицательным). */
export function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00').getTime();
  const now = new Date(todayISO() + 'T00:00:00').getTime();
  return Math.round((target - now) / 86_400_000);
}

/**
 * Русское склонение по числу: plural(2, 'кредит', 'кредита', 'кредитов') → 'кредита'.
 * Одна реализация на весь проект — раньше их было две, слегка разные.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
