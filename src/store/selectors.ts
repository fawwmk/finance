import { CurrencyCode, ExchangeRates, RecurringItem, Transaction } from '../types';
import { daysUntil, todayISO } from '../utils/format';
import { NPD } from '../data/tax';
import { npdTax } from '../utils/tax';

/** Конвертация суммы в базовую валюту. Пока курсы не загружены — 1:1. */
export function convertToBase(
  amount: number,
  from: CurrencyCode,
  base: CurrencyCode,
  rates?: ExchangeRates | null
): number {
  if (from === base) return amount;
  const r = rates?.rates?.[from];
  return r ? amount * r : amount;
}

/** Знаковая сумма операции в базовой валюте (доход +, расход −). */
export function signedBase(
  t: Transaction,
  base: CurrencyCode,
  rates?: ExchangeRates | null
): number {
  const v = convertToBase(t.amount, t.currency, base, rates);
  return t.kind === 'income' ? v : -v;
}

/** Текущий баланс = сумма всех операций. */
export function currentBalance(
  txs: Transaction[],
  base: CurrencyCode,
  rates?: ExchangeRates | null
): number {
  return txs.reduce((acc, t) => acc + signedBase(t, base, rates), 0);
}

export interface MonthTotals {
  income: number;
  expense: number;
  net: number;
}

/** Итоги за конкретный месяц (по умолчанию — текущий). ym = "YYYY-MM". */
export function monthTotals(
  txs: Transaction[],
  base: CurrencyCode,
  rates?: ExchangeRates | null,
  ym: string = todayISO().slice(0, 7)
): MonthTotals {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (!t.date.startsWith(ym)) continue;
    const v = convertToBase(t.amount, t.currency, base, rates);
    if (t.kind === 'income') income += v;
    else expense += v;
  }
  return { income, expense, net: income - expense };
}

/** Группировка операций по дню (свежие сверху) для ленты. */
export function groupByDay(txs: Transaction[]): { date: string; items: Transaction[] }[] {
  const map = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (!map.has(t.date)) map.set(t.date, []);
    map.get(t.date)!.push(t);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items }));
}

/** Ближайшие запланированные события в пределах N дней (отсортированы по дате). */
export function upcoming(recurring: RecurringItem[], withinDays = 45): RecurringItem[] {
  return recurring
    .filter((r) => r.active)
    .map((r) => ({ r, d: daysUntil(r.nextDate) }))
    .filter(({ d }) => d >= 0 && d <= withinDays)
    .sort((a, b) => a.d - b.d)
    .map(({ r }) => r);
}

/* ────────────────────────────  НАЛОГИ  ──────────────────────────── */

/** Облагаемый налогом доход с начала года (в базовой валюте). */
export function taxYearIncome(
  txs: Transaction[],
  base: CurrencyCode,
  rates?: ExchangeRates | null,
  year: number = new Date().getFullYear()
): number {
  const prefix = String(year);
  return txs
    .filter((t) => t.kind === 'income' && t.taxable && t.date.startsWith(prefix))
    .reduce((s, t) => s + convertToBase(t.amount, t.currency, base, rates), 0);
}

/** Подтверждённые расходы бизнеса с начала года — нужны для УСН «доходы минус расходы». */
export function taxYearExpenses(
  txs: Transaction[],
  base: CurrencyCode,
  rates?: ExchangeRates | null,
  year: number = new Date().getFullYear()
): number {
  const prefix = String(year);
  return txs
    .filter((t) => t.kind === 'expense' && t.taxDeductible && t.date.startsWith(prefix))
    .reduce((s, t) => s + convertToBase(t.amount, t.currency, base, rates), 0);
}

/**
 * Сколько налогового бонуса самозанятого (10 000 ₽) уже израсходовано.
 *
 * Считаем по фактическим поступлениям, а не храним счётчик: бонус даётся
 * один раз на всю жизнь, и от порядка поступлений зависит, когда он кончится.
 * Проходим все облагаемые доходы по возрастанию даты и «скармливаем» им бонус.
 */
export function npdBonusUsed(txs: Transaction[]): number {
  const income = txs
    .filter((t) => t.kind === 'income' && t.taxable)
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));

  let used = 0;
  for (const t of income) {
    if (used >= NPD.bonusTotal) break;
    const r = npdTax(t.amount, t.payerType ?? 'company', NPD.bonusTotal - used);
    used += r.bonusUsed;
  }
  return Math.min(used, NPD.bonusTotal);
}

/**
 * Сколько можно тратить в день до конца месяца, чтобы остатка хватило.
 * Простая модель: (баланс + ожидаемые поступления − предстоящие обяз. платежи) / дни до конца месяца.
 */
export function dailyBudget(
  balance: number,
  recurring: RecurringItem[],
  base: CurrencyCode,
  rates?: ExchangeRates | null
): { perDay: number; daysLeft: number } {
  const now = new Date(todayISO() + 'T00:00:00');
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - now.getDate() + 1);
  const endOfMonth = `${todayISO().slice(0, 7)}-${String(daysInMonth).padStart(2, '0')}`;

  let projected = balance;
  for (const r of recurring) {
    if (!r.active) continue;
    if (r.nextDate < todayISO() || r.nextDate > endOfMonth) continue;
    const v = convertToBase(r.amount, r.currency, base, rates);
    projected += r.kind === 'income' ? v : -v;
  }
  return { perDay: Math.max(0, projected / daysLeft), daysLeft };
}
