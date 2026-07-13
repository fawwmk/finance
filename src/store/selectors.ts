import { CurrencyCode, Exchange, ExchangeRates, RecurringItem, Transaction } from '../types';
import { daysUntil, todayISO } from '../utils/format';
import { NPD } from '../data/tax';
import { npdTax } from '../utils/tax';

/**
 * Курс: сколько единиц базовой валюты стоит 1 единица `from`.
 * null — курса нет, и это ЧЕСТНЫЙ ответ.
 *
 * Раньше здесь при отсутствии курса возвращалась единица, и 500 € молча
 * превращались в 500 ₽. Складывать евро с рублями один к одному нельзя
 * никогда: лучше не показать сумму, чем показать неправильную.
 *
 * Отдельно проверяем rates.base: сохранённые курсы могут быть от прошлой
 * базовой валюты (переключил рубли на доллары — курсы ещё не перезагрузились).
 */
export function rateFor(
  from: CurrencyCode,
  base: CurrencyCode,
  rates?: ExchangeRates | null
): number | null {
  if (from === base) return 1;
  if (!rates || rates.base !== base) return null;
  const r = rates.rates?.[from];
  return typeof r === 'number' && isFinite(r) && r > 0 ? r : null;
}

/** Конвертация в базовую валюту. null — курс неизвестен, сумму складывать нельзя. */
export function convertToBase(
  amount: number,
  from: CurrencyCode,
  base: CurrencyCode,
  rates?: ExchangeRates | null
): number | null {
  const r = rateFor(from, base, rates);
  return r == null ? null : amount * r;
}

/** Знаковая сумма операции в базовой валюте (доход +, расход −). null — нет курса. */
export function signedBase(
  t: Transaction,
  base: CurrencyCode,
  rates?: ExchangeRates | null
): number | null {
  const v = convertToBase(t.amount, t.currency, base, rates);
  return v == null ? null : t.kind === 'income' ? v : -v;
}

/**
 * Сколько операций не удалось перевести в базовую валюту.
 * Если больше нуля — итоги неполные, и интерфейс обязан об этом сказать.
 */
export function unconvertedCount(
  txs: Transaction[],
  base: CurrencyCode,
  rates?: ExchangeRates | null
): number {
  return txs.filter((t) => rateFor(t.currency, base, rates) == null).length;
}

/* ─────────────────────────  КОШЕЛЬКИ ПО ВАЛЮТАМ  ───────────────────────── */

/** Сколько лежит в каждой валюте. */
export type Wallets = Partial<Record<CurrencyCode, number>>;

/**
 * Деньги по кошелькам: отдельно рубли, отдельно евро, отдельно доллары.
 *
 * Так и устроена жизнь, если ты зарабатываешь в одной валюте, а тратишь
 * в другой. «Общий баланс» одним числом тут врёт: он прячет главное —
 * хватит ли ЕВРО, чтобы заплатить за квартиру в Италии, если весь доход
 * лежит в рублях.
 *
 * Обмен валюты — это ПЕРЕКЛАДЫВАНИЕ, а не доход и не расход:
 * из одного кошелька уходит, в другой приходит. Деньги не появляются
 * и не исчезают, меняется только то, где они лежат.
 * Раньше обмен вообще никак не влиял на баланс — просто запись в журнале.
 */
export function walletBalances(txs: Transaction[], exchanges: Exchange[] = []): Wallets {
  const w: Wallets = {};
  const add = (code: CurrencyCode, delta: number) => {
    w[code] = (w[code] ?? 0) + delta;
  };

  for (const t of txs) {
    add(t.currency, t.kind === 'income' ? t.amount : -t.amount);
  }

  for (const e of exchanges) {
    add(e.fromCurrency, -e.fromAmount); // отдал
    add(e.toCurrency, e.toAmount); // получил
  }

  return w;
}

/** Кошельки, в которых что-то есть (или ушли в минус — это тоже важно видеть). */
export function nonEmptyWallets(w: Wallets): { code: CurrencyCode; amount: number }[] {
  return (Object.entries(w) as [CurrencyCode, number][])
    .filter(([, amount]) => Math.abs(amount) >= 0.005)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([code, amount]) => ({ code, amount }));
}

/**
 * Всё вместе, приведённое к базовой валюте.
 *
 * Возвращает ещё и список валют, курс которых неизвестен: их сумма в итог
 * не вошла, и человек должен об этом знать, а не гадать, почему цифра не сходится.
 */
export function totalInBase(
  w: Wallets,
  base: CurrencyCode,
  rates?: ExchangeRates | null
): { total: number; missing: CurrencyCode[] } {
  let total = 0;
  const missing: CurrencyCode[] = [];

  for (const [code, amount] of Object.entries(w) as [CurrencyCode, number][]) {
    if (Math.abs(amount) < 0.005) continue;
    const v = convertToBase(amount, code, base, rates);
    if (v == null) missing.push(code);
    else total += v;
  }

  return { total, missing };
}

/** Текущий баланс одним числом, в базовой валюте. Включает обмены. */
export function currentBalance(
  txs: Transaction[],
  base: CurrencyCode,
  rates?: ExchangeRates | null,
  exchanges: Exchange[] = []
): number {
  return totalInBase(walletBalances(txs, exchanges), base, rates).total;
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
    if (v == null) continue; // курса нет — в итог не тащим
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

/* ──────────────────────────  ЛЕНТА СОБЫТИЙ  ────────────────────────── */

/**
 * Одна строка в истории. Обмен валюты — не доход и не расход, но в ленте он
 * обязан быть: без него непонятно, откуда в кошельке взялись евро и куда
 * делись рубли. Деньги не растворяются — они переехали, и это должно быть видно.
 */
export type FeedEntry =
  | { kind: 'tx'; id: string; date: string; createdAt: number; tx: Transaction }
  | { kind: 'exchange'; id: string; date: string; createdAt: number; ex: Exchange };

/** История: операции и обмены вперемешку, сгруппированные по дням. */
export function feedByDay(
  txs: Transaction[],
  exchanges: Exchange[] = []
): { date: string; items: FeedEntry[] }[] {
  const entries: FeedEntry[] = [
    ...txs.map((tx): FeedEntry => ({ kind: 'tx', id: tx.id, date: tx.date, createdAt: tx.createdAt, tx })),
    ...exchanges.map(
      (ex): FeedEntry => ({ kind: 'exchange', id: ex.id, date: ex.date, createdAt: ex.createdAt, ex })
    ),
  ];

  const map = new Map<string, FeedEntry[]>();
  for (const e of entries) {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date)!.push(e);
  }

  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      // Внутри дня — свежие сверху.
      items: items.sort((a, b) => b.createdAt - a.createdAt),
    }));
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
    .reduce((s, t) => s + (convertToBase(t.amount, t.currency, base, rates) ?? 0), 0);
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
    .reduce((s, t) => s + (convertToBase(t.amount, t.currency, base, rates) ?? 0), 0);
}

/**
 * Сколько налогового бонуса самозанятого (10 000 ₽) уже израсходовано.
 *
 * Считаем по фактическим поступлениям, а не храним счётчик: бонус даётся
 * один раз на всю жизнь, и от порядка поступлений зависит, когда он кончится.
 * Проходим все облагаемые доходы по возрастанию даты и «скармливаем» им бонус.
 */
export function npdBonusUsed(
  txs: Transaction[],
  base: CurrencyCode,
  rates?: ExchangeRates | null
): number {
  const income = txs
    .filter((t) => t.kind === 'income' && t.taxable)
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));

  let used = 0;
  for (const t of income) {
    if (used >= NPD.bonusTotal) break;
    // Налог считается в рублях, значит и поступление надо привести к базовой валюте.
    const amount = convertToBase(t.amount, t.currency, base, rates);
    if (amount == null) continue;
    const r = npdTax(amount, t.payerType ?? 'company', NPD.bonusTotal - used);
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
    if (v == null) continue;
    projected += r.kind === 'income' ? v : -v;
  }
  return { perDay: Math.max(0, projected / daysLeft), daysLeft };
}
