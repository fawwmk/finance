/**
 * Раскрытие регулярного события в список ближайших дат.
 * Нужно и для напоминаний, и для того, чтобы просроченные планы
 * («зарплата 5-го», а сегодня уже 12-е) сами перескакивали на следующий месяц.
 *
 * Важно: месячные даты всегда отсчитываем от исходного числа события.
 * Иначе платёж 31-го числа, обрезанный февралём до 28-го, так и остался бы
 * 28-м навсегда — дата бы «уползала».
 */

import { RecurringItem } from '../types';
import { toISODate, todayISO } from './format';

/** Исходное число месяца: либо явно заданное, либо из первой даты. */
function anchorDay(item: RecurringItem): number {
  return item.dayOfMonth ?? Number(item.nextDate.split('-')[2]);
}

/**
 * Дата через n месяцев от опорной, с посадкой на нужное число.
 * 31-е в феврале превращается в 28-е (или 29-е в високосный год),
 * но в марте снова становится 31-м.
 */
function monthsFrom(baseIso: string, n: number, day: number): string {
  const [y, m] = baseIso.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, lastDay));
  return toISODate(t);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/**
 * n-е по счёту повторение события, считая от его nextDate (n = 0 — само nextDate).
 */
export function occurrenceAt(item: RecurringItem, n: number): string {
  if (n === 0 || item.recurrence === 'once') return item.nextDate;

  switch (item.recurrence) {
    case 'weekly':
      return addDays(item.nextDate, 7 * n);
    case 'monthly':
      return monthsFrom(item.nextDate, n, anchorDay(item));
    case 'yearly':
      return monthsFrom(item.nextDate, 12 * n, anchorDay(item));
  }
}

/**
 * Если дата события уже прошла — перематываем вперёд, пока не станет
 * сегодняшней или будущей. Разовые события не трогаем.
 * Возвращает null, если менять нечего.
 */
export function rollForward(item: RecurringItem): string | null {
  if (item.recurrence === 'once') return null;

  const today = todayISO();
  if (item.nextDate >= today) return null;

  // страховка от бесконечного цикла на «битых» данных
  for (let n = 1; n <= 400; n++) {
    const date = occurrenceAt(item, n);
    if (date >= today) return date;
  }
  return null;
}

/** Ближайшие N дат события, начиная с nextDate. */
export function occurrences(item: RecurringItem, count: number): string[] {
  if (item.recurrence === 'once') return [item.nextDate];

  return Array.from({ length: count }, (_, n) => occurrenceAt(item, n));
}
