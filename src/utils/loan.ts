/**
 * Расчёт кредитов по формулам, которые реально применяют банки РФ
 * (Сбер, Т-Банк, Альфа, ВТБ и др.). Все они считают одинаково —
 * это регламентировано ЦБ и 353-ФЗ «О потребительском кредите».
 * Отличаются банки только ставкой, сроком и страховкой.
 *
 * Два типа платежа:
 *  1. Аннуитетный (по умолчанию почти везде) — платёж одинаковый каждый месяц.
 *     P = S · i · (1+i)^n / ((1+i)^n − 1)
 *  2. Дифференцированный — тело долга делится поровну, платёж убывает.
 *     P_k = S/n + (S − S/n·(k−1)) · i
 *
 * где S — сумма кредита, i — месячная ставка (годовая/12/100), n — срок в месяцах.
 */

import { Loan, LoanType } from '../types';

/** Одна строка графика платежей. */
export interface ScheduleRow {
  /** Номер платежа, начиная с 1. */
  n: number;
  /** Дата платежа (ISO YYYY-MM-DD). */
  date: string;
  /** Полный платёж за месяц. */
  payment: number;
  /** Из него — проценты банку. */
  interest: number;
  /** Из него — погашение тела долга. */
  principal: number;
  /** Остаток долга после платежа. */
  balance: number;
}

export interface LoanCalc {
  /** Ежемесячный платёж (для дифференцированного — первый, самый большой). */
  monthlyPayment: number;
  /** Всего будет выплачено за весь срок. */
  totalPaid: number;
  /** Переплата = проценты банку. */
  overpayment: number;
  schedule: ScheduleRow[];
}

/** Месячная ставка из годовой в процентах. 18% годовых -> 0.015 */
export function monthlyRate(annualPercent: number): number {
  return annualPercent / 12 / 100;
}

/**
 * Аннуитетный платёж — та самая формула из кредитного договора.
 * При ставке 0% просто делим сумму на срок.
 */
export function annuityPayment(principal: number, annualPercent: number, months: number): number {
  if (months <= 0) return 0;
  const i = monthlyRate(annualPercent);
  if (i === 0) return principal / months;
  const k = Math.pow(1 + i, months);
  return (principal * i * k) / (k - 1);
}

/** Прибавляет месяцы к ISO-дате, аккуратно обрезая 31-е число в коротких месяцах. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  const yy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Полный график платежей.
 *
 * @param principal   сумма кредита
 * @param annualPercent  ставка, % годовых
 * @param months      срок, месяцев
 * @param type        аннуитетный / дифференцированный
 * @param firstDate   дата первого платежа (ISO)
 * @param extraMonthly доп. сумма сверх платежа каждый месяц (досрочное погашение)
 */
export function buildSchedule(
  principal: number,
  annualPercent: number,
  months: number,
  type: LoanType,
  firstDate: string,
  extraMonthly = 0
): LoanCalc {
  const i = monthlyRate(annualPercent);
  const rows: ScheduleRow[] = [];
  let balance = principal;
  let totalPaid = 0;

  const basePayment = annuityPayment(principal, annualPercent, months);
  const flatPrincipal = principal / months;

  // Лимит на случай, если платёж меньше начисляемых процентов (долг не гасится).
  const maxIterations = Math.max(months, 1) + 600;

  for (let n = 1; n <= maxIterations && balance > 0.005; n++) {
    const interest = balance * i;

    let payment =
      type === 'annuity' ? basePayment + extraMonthly : flatPrincipal + interest + extraMonthly;

    // Последний платёж: гасим ровно остаток + проценты, не больше.
    if (payment > balance + interest) payment = balance + interest;

    let principalPart = payment - interest;

    // Защита: если ставка так велика, что платёж не покрывает проценты — выходим.
    if (principalPart <= 0) break;

    balance -= principalPart;
    if (balance < 0.005) balance = 0;
    totalPaid += payment;

    rows.push({
      n,
      date: addMonths(firstDate, n - 1),
      payment,
      interest,
      principal: principalPart,
      balance,
    });
  }

  return {
    monthlyPayment: rows[0]?.payment ?? 0,
    totalPaid,
    overpayment: totalPaid - principal,
    schedule: rows,
  };
}

/** Сколько уже выплачено и сколько осталось на сегодняшний день. */
export function loanProgress(calc: LoanCalc, todayIso: string) {
  const paidRows = calc.schedule.filter((r) => r.date <= todayIso);
  const paid = paidRows.reduce((s, r) => s + r.payment, 0);
  const remainingRows = calc.schedule.filter((r) => r.date > todayIso);
  const remainingDebt = paidRows.length
    ? paidRows[paidRows.length - 1].balance
    : calc.schedule[0]?.balance != null
      ? calc.schedule[0].balance + calc.schedule[0].principal
      : 0;
  return {
    paid,
    paidCount: paidRows.length,
    totalCount: calc.schedule.length,
    remainingDebt,
    remainingToPay: remainingRows.reduce((s, r) => s + r.payment, 0),
    next: remainingRows[0] ?? null,
    progress: calc.schedule.length ? paidRows.length / calc.schedule.length : 0,
  };
}

/**
 * Выгода от досрочного погашения: платим +extra каждый месяц.
 * Возвращает, на сколько месяцев короче срок и сколько сэкономим на процентах.
 */
export function earlyRepaymentBenefit(
  principal: number,
  annualPercent: number,
  months: number,
  type: LoanType,
  firstDate: string,
  extra: number
) {
  const base = buildSchedule(principal, annualPercent, months, type, firstDate, 0);
  const fast = buildSchedule(principal, annualPercent, months, type, firstDate, extra);
  return {
    monthsSaved: base.schedule.length - fast.schedule.length,
    moneySaved: base.overpayment - fast.overpayment,
    newTermMonths: fast.schedule.length,
    newOverpayment: fast.overpayment,
  };
}

/* ─────────────────  КРЕДИТНЫЕ КАРТЫ: беспроцентный период  ───────────────── */

export interface CardStatus {
  /** Последний день, когда можно погасить долг без процентов. */
  graceEndDate: string;
  /** Сколько дней осталось (отрицательное — период уже прошёл). */
  daysLeft: number;
  /** Успеваем ли ещё уложиться в льготный период. */
  inGrace: boolean;
  debt: number;
  /** Свободный остаток лимита. */
  available: number;
  /** Минимальный платёж — он НЕ спасает от процентов, только от просрочки. */
  minPayment: number;
  /**
   * Сколько процентов набежит, если проспать льготный период.
   * Это главная ловушка кредитки: банк начисляет проценты не с завтрашнего дня,
   * а ЗАДНИМ ЧИСЛОМ — на весь долг с даты каждой покупки.
   */
  interestIfMissed: number;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Состояние кредитной карты на сегодня.
 *
 * Беспроцентный период («грейс») работает так: банк даёт N дней с начала
 * расчётного периода, чтобы вернуть всё потраченное. Успел — заплатил 0 ₽
 * процентов, кредит был бесплатным. Не успел — проценты начисляются задним
 * числом за ВЕСЬ период, а не с момента просрочки. Именно поэтому «минимальный
 * платёж» — ловушка: он закрывает просрочку, но грейс всё равно сгорает.
 */
export function cardStatus(loan: Loan, todayIso: string): CardStatus {
  const debt = loan.cardDebt ?? 0;
  const limit = loan.creditLimit ?? 0;
  const graceDays = loan.gracePeriodDays ?? 55;
  const start = loan.graceStartDate ?? todayIso;

  const graceEndDate = addDaysIso(start, graceDays);

  const msPerDay = 86_400_000;
  const daysLeft = Math.round(
    (new Date(graceEndDate + 'T00:00:00').getTime() -
      new Date(todayIso + 'T00:00:00').getTime()) /
      msPerDay
  );

  const dailyRate = loan.annualRate / 100 / 365;

  return {
    graceEndDate,
    daysLeft,
    inGrace: daysLeft >= 0 && debt > 0,
    debt,
    available: Math.max(0, limit - debt),
    minPayment: Math.round(debt * ((loan.minPaymentPercent ?? 5) / 100)),
    // Проценты за весь льготный период — та сумма, что прилетит задним числом.
    interestIfMissed: debt * dailyRate * graceDays,
  };
}

/** "24 месяца" -> "2 года"; для подписей в интерфейсе. */
export function formatTerm(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const yStr = y > 0 ? `${y} ${plural(y, 'год', 'года', 'лет')}` : '';
  const mStr = m > 0 ? `${m} ${plural(m, 'месяц', 'месяца', 'месяцев')}` : '';
  return [yStr, mStr].filter(Boolean).join(' ') || '0 месяцев';
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
