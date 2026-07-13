/**
 * Расчёт налогов: самозанятый (НПД), ИП (УСН / патент / ОСНО), зарплата (НДФЛ).
 *
 * Главная задача модуля — ответить на вопрос «сколько отложить прямо сейчас,
 * когда пришли деньги». Считаем предельно (маржинально): берём налоговую
 * нагрузку за год ДО поступления и ПОСЛЕ, разница и есть сумма к откладыванию.
 * Так автоматически ловятся все пороги — и 1% свыше 300 000 ₽, и ступени НДФЛ,
 * и исчерпание бонуса самозанятого.
 *
 * Все ставки и лимиты — в src/data/tax.ts.
 */

import {
  IP_CONTRIBUTIONS,
  NDFL,
  NDFL_BRACKETS,
  NDFL_SELF_DUES,
  NPD,
  PAYROLL,
  PSN,
  USN,
  usnIncomeLimit,
  VOLUNTARY_SFR,
  voluntarySfrAmount,
} from '../data/tax';
import { PayerType, TaxProfile, TaxStatus } from '../types';

/* ────────────────────────────  НДФЛ  ──────────────────────────── */

/**
 * НДФЛ по прогрессивной шкале. Повышенная ставка бьёт только по той части
 * дохода, что попала в свою ступень, — а не по всему доходу.
 * Нерезидент платит плоские 30% и вычетов не получает.
 */
export function ndfl(income: number, resident: boolean): number {
  if (income <= 0) return 0;
  if (!resident) return income * NDFL.nonResident;

  let tax = 0;
  let prevCap = 0;

  for (const { upTo, rate } of NDFL_BRACKETS) {
    if (income <= prevCap) break;
    const inBracket = Math.min(income, upTo) - prevCap;
    tax += inBracket * rate;
    prevCap = upTo;
  }
  return tax;
}

/** Разбор зарплаты: сколько удержат и сколько дойдёт до карты. */
export function salaryBreakdown(gross: number, resident: boolean) {
  const tax = ndfl(gross, resident);
  return {
    gross,
    ndfl: tax,
    net: gross - tax,
    /** Эффективная ставка — с учётом прогрессии она ниже максимальной. */
    effectiveRate: gross > 0 ? tax / gross : 0,
  };
}

/* ──────────────────  НПД — самозанятый  ────────────────── */

export interface NpdResult {
  tax: number;
  /** Сколько бонуса съело это поступление. */
  bonusUsed: number;
  /** Фактическая ставка с учётом бонуса: 3% / 4% пока бонус есть. */
  effectiveRate: number;
  baseRate: number;
}

/**
 * Налог с одного поступления самозанятого.
 * @param bonusLeft остаток налогового бонуса (из 10 000 ₽)
 */
export function npdTax(amount: number, payer: PayerType, bonusLeft: number): NpdResult {
  const baseRate = payer === 'company' ? NPD.rateCompany : NPD.rateIndividual;
  const bonusRate = payer === 'company' ? NPD.bonusRateCompany : NPD.bonusRateIndividual;

  if (amount <= 0) {
    return { tax: 0, bonusUsed: 0, effectiveRate: baseRate, baseRate };
  }

  const gross = amount * baseRate;
  // Бонус гасит часть налога, но не больше своего остатка.
  const bonusUsed = Math.min(amount * bonusRate, Math.max(0, bonusLeft));
  const tax = gross - bonusUsed;

  return { tax, bonusUsed, effectiveRate: tax / amount, baseRate };
}

/* ──────────────────  Страховые взносы ИП  ────────────────── */

export interface Contributions {
  /** «За себя», фиксированная часть — платится, даже если дохода не было вообще. */
  fixed: number;
  /** «За себя», 1% с дохода свыше 300 000 ₽. */
  extra: number;
  /** Добровольные взносы в СФР на больничные и декрет (если включены). */
  voluntary: number;
  /** За работников: единый тариф. */
  employees: number;
  /** За работников: взносы на травматизм. */
  injury: number;
  /** Всё вместе. */
  total: number;
  /** Только то, на что можно уменьшить налог на УСН «Доходы» и патенте. */
  reducible: number;
}

/**
 * Взносы за работников за `months` месяцев.
 *
 * Единый тариф — 30% с выплат, а сверх годовой предельной базы (на каждого
 * работника отдельно) — 15,1%. Малый бизнес может применять льготу: с части
 * выплат сверх 1,5 МРОТ в месяц — 15% вместо 30%.
 *
 * Плюс взносы на травматизм: от 0,2% до 8,5% в зависимости от класса
 * профриска, без всякой предельной базы.
 */
export function employeeContributions(profile: TaxProfile, months: number) {
  const count = profile.employeeCount ?? 0;
  const payrollMonthly = profile.payrollMonthly ?? 0;

  if (count <= 0 || payrollMonthly <= 0 || months <= 0) {
    return { unified: 0, injury: 0, total: 0 };
  }

  // Считаем на одного работника — предельная база и МРОТ применяются к каждому.
  const perHeadMonthly = payrollMonthly / count;
  const perHeadTotal = perHeadMonthly * months;

  let unifiedPerHead: number;

  if (profile.msmeTariff) {
    const threshold = PAYROLL.mrot * PAYROLL.msmeThresholdMrots;
    const atBase = Math.min(perHeadMonthly, threshold);
    const above = Math.max(0, perHeadMonthly - threshold);
    unifiedPerHead = (atBase * PAYROLL.baseRate + above * PAYROLL.msmeRate) * months;
  } else {
    const atBase = Math.min(perHeadTotal, PAYROLL.limitBase);
    const above = Math.max(0, perHeadTotal - PAYROLL.limitBase);
    unifiedPerHead = atBase * PAYROLL.baseRate + above * PAYROLL.aboveLimitRate;
  }

  const injuryRate = (profile.injuryRatePercent ?? PAYROLL.injuryMin * 100) / 100;
  const injuryPerHead = perHeadTotal * injuryRate;

  const unified = unifiedPerHead * count;
  const injury = injuryPerHead * count;

  return { unified, injury, total: unified + injury };
}

/**
 * Все взносы ИП.
 *
 * @param months сколько месяцев года прошло — взносы за работников платятся
 *   ежемесячно, поэтому «должен на сегодня» зависит от месяца. А вот
 *   фиксированные взносы «за себя» берём целиком: их всё равно платить
 *   до 28 декабря, даже если доход завтра кончится.
 */
export function ipContributions(
  yearIncome: number,
  profile?: TaxProfile,
  months = 12
): Contributions {
  const over = Math.max(0, yearIncome - IP_CONTRIBUTIONS.extraThreshold);
  const extra = Math.min(over * IP_CONTRIBUTIONS.extraRate, IP_CONTRIBUTIONS.extraCap);

  const voluntary = profile?.voluntarySfr ? voluntarySfrAmount() : 0;
  const emp = profile ? employeeContributions(profile, months) : { unified: 0, injury: 0 };

  const fixed = IP_CONTRIBUTIONS.fixed;

  return {
    fixed,
    extra,
    voluntary,
    employees: emp.unified,
    injury: emp.injury,
    total: fixed + extra + voluntary + emp.unified + emp.injury,
    // Добровольные взносы в СФР налог НЕ уменьшают — это не обязательные взносы.
    reducible: fixed + extra + emp.unified + emp.injury,
  };
}

/* ─────────────────  Годовая нагрузка целиком  ───────────────── */

export interface TaxBurden {
  /** Начисленный налог до вычета взносов. */
  taxGross: number;
  /** Налог, который реально уйдёт в бюджет (после уменьшения на взносы). */
  taxPayable: number;
  contributions: Contributions;
  /** На сколько взносы срезали налог. */
  reducedBy: number;
  /** Всё вместе — вот это и есть «сколько стоит год». */
  total: number;
  /** Эффективная ставка от дохода. */
  effectiveRate: number;
  /** Что стоит знать: превышения лимитов, НДС и т.п. */
  warnings: string[];
}

/**
 * Полная налоговая нагрузка за год при таком доходе.
 *
 * Ключевая механика, которую часто упускают: на УСН «Доходы» и на патенте
 * страховые взносы НЕ добавляются к налогу, а ВЫЧИТАЮТСЯ из него.
 * ИП без работников уменьшает налог на все взносы, вплоть до нуля.
 * Поэтому итог = max(налог, взносы), а не «налог + взносы».
 */
export function annualBurden(
  profile: TaxProfile,
  income: number,
  expenses = 0,
  monthsElapsed = 12
): TaxBurden {
  const warnings: string[] = [];
  const status = profile.status;

  const zeroContributions: Contributions = {
    fixed: 0,
    extra: 0,
    voluntary: 0,
    employees: 0,
    injury: 0,
    total: 0,
    reducible: 0,
  };

  /* — Зарплата: НДФЛ удерживает работодатель, откладывать нечего — */
  if (status === 'employee') {
    const tax = ndfl(income, profile.resident);
    return {
      taxGross: tax,
      taxPayable: 0, // с тебя уже удержали
      contributions: zeroContributions,
      reducedBy: 0,
      total: 0,
      effectiveRate: 0,
      warnings: profile.resident
        ? []
        : ['Ты нерезидент: с зарплаты удерживают 30% и вычеты не положены.'],
    };
  }

  /**
   * — Работа без оформления —
   *
   * Никакого налогового агента нет: работодатель ничего не удерживает и
   * ничего за тебя не платит. Но доход от этого не перестаёт быть облагаемым:
   * по НК его нужно задекларировать (3-НДФЛ) и заплатить НДФЛ самому.
   * Считаем по той же прогрессивной шкале, что и зарплату.
   */
  if (status === 'unofficial') {
    const tax = ndfl(income, profile.resident);

    warnings.push(
      'За тебя никто не платит НДФЛ. По закону этот доход декларируется самостоятельно (3-НДФЛ до 30 апреля) и налог платится до 15 июля.'
    );
    warnings.push(
      'Пенсионный стаж не идёт, больничных и отпускных нет, справку о доходах для ипотеки или визы получить негде.'
    );
    warnings.push(
      'Самозанятость обошлась бы в 4–6% вместо 13% — и это законно. Посмотри сравнение режимов ниже.'
    );

    return {
      taxGross: tax,
      taxPayable: tax,
      contributions: zeroContributions,
      reducedBy: 0,
      total: tax,
      effectiveRate: income > 0 ? tax / income : 0,
      warnings,
    };
  }

  /* — Самозанятый — */
  if (status === 'npd') {
    // Для годовой оценки считаем по фактической смеси плательщиков — она
    // приходит уже посчитанной в income/…; здесь берём консервативно 6%.
    const bonusLeft = Math.max(0, NPD.bonusTotal - (profile.npdBonusUsed ?? 0));
    const r = npdTax(income, 'company', bonusLeft);

    if (income > NPD.incomeLimit) {
      warnings.push(
        `Превышен лимит НПД (${fmt(NPD.incomeLimit)} ₽). Право на самозанятость теряется — нужно открывать ИП.`
      );
    } else if (income > NPD.incomeLimit * 0.8) {
      warnings.push(
        `Осталось ${fmt(NPD.incomeLimit - income)} ₽ до лимита НПД. Дальше — только ИП.`
      );
    }

    return {
      taxGross: r.tax,
      taxPayable: r.tax,
      contributions: zeroContributions,
      reducedBy: 0,
      total: r.tax,
      effectiveRate: income > 0 ? r.tax / income : 0,
      warnings,
    };
  }

  /* — Дальше всё ИП: сначала взносы — */
  const contributions = ipContributions(income, profile, monthsElapsed);
  const withEmployees = profile.hasEmployees === true;

  if (withEmployees && !profile.payrollMonthly) {
    warnings.push(
      'Указан статус «с работниками», но не задан фонд оплаты труда — взносы за сотрудников не посчитаны.'
    );
  }
  if (withEmployees && profile.payrollMonthly) {
    warnings.push(
      'НДФЛ 13% с зарплат сотрудников здесь не считаю — он удерживается из их зарплаты, но перечислять его в бюджет должен ты.'
    );
  }

  /**
   * Насколько можно срезать налог взносами.
   * Уменьшать можно только на ОБЯЗАТЕЛЬНЫЕ взносы (contributions.reducible):
   * добровольные взносы в СФР на больничные налог не уменьшают.
   */
  const applyReduction = (tax: number) => {
    if (withEmployees) {
      // С работниками налог уменьшается максимум наполовину.
      const payable = Math.max(tax * 0.5, tax - contributions.reducible);
      return { payable, reducedBy: tax - payable };
    }
    const payable = Math.max(0, tax - contributions.reducible);
    return { payable, reducedBy: tax - payable };
  };

  if (status === 'ip_usn_income') {
    const rate = (profile.usnRatePercent ?? USN.incomeRate * 100) / 100;
    const taxGross = income * rate;
    const { payable, reducedBy } = applyReduction(taxGross);

    if (income > USN.vatThreshold) {
      warnings.push(
        `Доход выше ${fmt(USN.vatThreshold)} ₽ — ИП на УСН становится плательщиком НДС. Порог менялся, сверься с ФНС.`
      );
    }
    if (income > usnIncomeLimit()) {
      warnings.push(`Превышен лимит УСН (${fmt(usnIncomeLimit())} ₽ с учётом дефлятора) — слетаешь на ОСНО.`);
    }

    const total = payable + contributions.total;
    return {
      taxGross,
      taxPayable: payable,
      contributions,
      reducedBy,
      total,
      effectiveRate: income > 0 ? total / income : 0,
      warnings,
    };
  }

  if (status === 'ip_usn_profit') {
    const rate = (profile.usnRatePercent ?? USN.profitRate * 100) / 100;
    // Здесь взносы — это расход, а не вычет из налога.
    const base = Math.max(0, income - expenses - contributions.total);
    const regular = base * rate;
    const minTax = income * USN.minTaxRate;
    const payable = Math.max(regular, minTax);

    if (payable === minTax && regular < minTax) {
      warnings.push(
        `Расходы съели прибыль — платишь минимальный налог 1% с дохода (${fmt(minTax)} ₽).`
      );
    }
    if (income > USN.vatThreshold) {
      warnings.push(
        `Доход выше ${fmt(USN.vatThreshold)} ₽ — появляется НДС. Порог менялся, сверься с ФНС.`
      );
    }

    const total = payable + contributions.total;
    return {
      taxGross: regular,
      taxPayable: payable,
      contributions,
      reducedBy: 0,
      total,
      effectiveRate: income > 0 ? total / income : 0,
      warnings,
    };
  }

  if (status === 'ip_psn') {
    const patent = profile.patentCost ?? 0;
    const { payable, reducedBy } = applyReduction(patent);

    if (!patent) {
      warnings.push(
        'Укажи стоимость патента — её считает регион под твой вид деятельности. Точная цифра: patent.nalog.ru.'
      );
    }
    if (income > PSN.incomeLimit) {
      warnings.push(
        `Превышен лимит патента (${fmt(PSN.incomeLimit)} ₽) — пересчитают по УСН или ОСНО с начала действия патента.`
      );
    }

    const total = payable + contributions.total;
    return {
      taxGross: patent,
      taxPayable: payable,
      contributions,
      reducedBy,
      total,
      effectiveRate: income > 0 ? total / income : 0,
      warnings,
    };
  }

  /* — ОСНО — */
  const base = Math.max(0, income - expenses - contributions.total);
  const tax = ndfl(base, profile.resident);
  warnings.push(
    'На ОСНО добавляется НДС — его здесь не считаем. Нужен бухгалтер.'
  );
  if (!profile.resident) {
    warnings.push('Нерезидент на ОСНО: НДФЛ 30% и профвычеты недоступны.');
  }

  const total = tax + contributions.total;
  return {
    taxGross: tax,
    taxPayable: tax,
    contributions,
    reducedBy: 0,
    total,
    effectiveRate: income > 0 ? total / income : 0,
    warnings,
  };
}

/* ────────────  Сколько отложить с конкретного поступления  ──────────── */

export interface Reserve {
  /** Сколько отложить с этого поступления. */
  amount: number;
  /** Какая это доля от поступления. */
  rate: number;
  /** Человеческое объяснение, откуда цифра. */
  explanation: string;
}

/**
 * Пришли деньги — сколько сразу убрать в налоговую копилку.
 *
 * Считаем не «сколько налога с этой конкретной суммы», а «сколько всего должен
 * бюджету на сегодня минус сколько уже отложил». Это принципиально: у ИП есть
 * фиксированный взнос (57 390 ₽), который платится до 28 декабря независимо от
 * дохода — хоть заработал ноль. Если считать только предельный налог с каждого
 * поступления, этот взнос не отложится НИКОГДА, и к декабрю не хватит ровно его.
 *
 * Накопительная модель заодно сама себя чинит: пропустил поступление или снял
 * деньги из копилки — следующая подсказка автоматически станет больше.
 *
 * @param ytdIncomeBefore доход с начала года ДО этого поступления
 * @param alreadySetAside сколько уже лежит в налоговой копилке
 */
export function reserveForIncome(
  amount: number,
  payer: PayerType,
  profile: TaxProfile,
  ytdIncomeBefore: number,
  ytdExpenses = 0,
  alreadySetAside = 0,
  monthsElapsed: number = new Date().getMonth() + 1
): Reserve {
  if (amount <= 0) return { amount: 0, rate: 0, explanation: '' };

  if (profile.status === 'employee') {
    return {
      amount: 0,
      rate: 0,
      explanation: 'НДФЛ уже удержал работодатель — откладывать ничего не нужно.',
    };
  }

  /**
   * — Без оформления —
   * Никто не удержал, значит откладывать надо самому. Считаем накопительно:
   * весь НДФЛ с дохода за год минус то, что уже отложено. Прогрессия
   * учитывается сама — при переходе через 2,4 млн подсказка вырастет.
   */
  if (profile.status === 'unofficial') {
    const needed = ndfl(ytdIncomeBefore + amount, profile.resident);
    const gap = Math.max(0, needed - alreadySetAside);
    const suggest = Math.min(amount, gap);

    return {
      amount: suggest,
      rate: suggest / amount,
      explanation: profile.resident
        ? `НДФЛ ${pct(suggest / amount)} — за тебя его никто не платит, декларируешь и платишь сам (3-НДФЛ до 30 апреля, налог до 15 июля).`
        : `НДФЛ 30% как с нерезидента — за тебя его никто не платит, декларируешь и платишь сам.`,
    };
  }

  /* — Самозанятый: взносов нет, налог считается ровно с поступления — */
  if (profile.status === 'npd') {
    const bonusLeft = Math.max(0, NPD.bonusTotal - (profile.npdBonusUsed ?? 0));
    const r = npdTax(amount, payer, bonusLeft);

    const from = payer === 'company' ? 'от юрлица или ИП' : 'от физлица';
    const explanation = r.bonusUsed
      ? `${pct(r.baseRate)} ${from}, минус налоговый бонус — фактически ${pct(r.effectiveRate)}. Бонуса осталось ${fmt(bonusLeft - r.bonusUsed)} ₽.`
      : `${pct(r.baseRate)} ${from}. Бонус 10 000 ₽ израсходован.`;

    return { amount: r.tax, rate: r.effectiveRate, explanation };
  }

  /* — ИП: догоняем накопленный долг перед бюджетом — */
  const needed = annualBurden(
    profile,
    ytdIncomeBefore + amount,
    ytdExpenses,
    monthsElapsed
  ).total;
  const gap = Math.max(0, needed - alreadySetAside);
  // Больше, чем пришло, отложить всё равно невозможно.
  const suggest = Math.min(amount, gap);

  const crossed =
    ytdIncomeBefore < IP_CONTRIBUTIONS.extraThreshold &&
    ytdIncomeBefore + amount > IP_CONTRIBUTIONS.extraThreshold;

  let explanation: string;
  if (suggest === 0) {
    explanation = 'В копилке уже достаточно — с этого поступления откладывать нечего.';
  } else if (suggest === amount && gap > amount) {
    explanation = `Долг перед бюджетом (${fmt(gap)} ₽) больше поступления — откладывай всё, остаток догонишь со следующего.`;
  } else if (crossed) {
    explanation = `Доход перевалил за ${fmt(IP_CONTRIBUTIONS.extraThreshold)} ₽ — включился дополнительный 1% взносов.`;
  } else {
    explanation = `Всего должен на сегодня ${fmt(needed)} ₽, отложено ${fmt(alreadySetAside)} ₽. Сюда входят фиксированные взносы ${fmt(IP_CONTRIBUTIONS.fixed)} ₽ — они платятся до 28 декабря, даже если дохода больше не будет.`;
  }

  return { amount: suggest, rate: suggest / amount, explanation };
}

/* ──────────────────  Календарь платежей  ────────────────── */

export interface TaxDue {
  /** ISO YYYY-MM-DD */
  date: string;
  label: string;
  /** Оценка суммы; null — если посчитать нельзя. */
  amount: number | null;
  kind: 'tax' | 'contributions';
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Ближайшие обязательные платежи. Даты — по НК; суммы — оценка от текущего
 * дохода, они уточнятся к сроку.
 */
export function taxCalendar(
  profile: TaxProfile,
  ytdIncome: number,
  ytdExpenses: number,
  year: number
): TaxDue[] {
  const out: TaxDue[] = [];
  const burden = annualBurden(profile, ytdIncome, ytdExpenses);

  if (profile.status === 'employee') return out;

  // Без оформления: декларируешь и платишь сам, в следующем году.
  if (profile.status === 'unofficial') {
    out.push({
      date: iso(year + 1, NDFL_SELF_DUES.declaration.month, NDFL_SELF_DUES.declaration.day),
      label: 'Подать декларацию 3-НДФЛ',
      amount: null,
      kind: 'tax',
    });
    out.push({
      date: iso(year + 1, NDFL_SELF_DUES.payment.month, NDFL_SELF_DUES.payment.day),
      label: `НДФЛ за ${year} год`,
      amount: burden.total,
      kind: 'tax',
    });
    return out;
  }

  if (profile.status === 'npd') {
    // Налог за прошлый месяц — до 28-го числа текущего.
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, NPD.payByDay);
      out.push({
        date: iso(d.getFullYear(), d.getMonth() + 1, NPD.payByDay),
        label: 'Налог НПД за прошлый месяц',
        amount: null, // считается по чекам за месяц
        kind: 'tax',
      });
    }
    return out;
  }

  // ИП: авансы по УСН
  if (profile.status === 'ip_usn_income' || profile.status === 'ip_usn_profit') {
    for (const a of USN.advanceDues) {
      out.push({
        date: iso(year, a.month, a.day),
        label: a.label,
        amount: null,
        kind: 'tax',
      });
    }
    out.push({
      date: iso(year + 1, USN.finalDue.month, USN.finalDue.day),
      label: USN.finalDue.label,
      amount: burden.taxPayable,
      kind: 'tax',
    });
  }

  // Взносы за работников — каждый месяц, до 28-го числа за прошлый месяц.
  if (burden.contributions.employees > 0) {
    const monthly = employeeContributions(profile, 1);
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, PAYROLL.payByDay);
      out.push({
        date: iso(d.getFullYear(), d.getMonth() + 1, PAYROLL.payByDay),
        label: 'Взносы за работников',
        amount: monthly.total,
        kind: 'contributions',
      });
    }
  }

  // Страховые взносы «за себя» — у всех ИП
  out.push({
    date: iso(year, IP_CONTRIBUTIONS.fixedDue.month, IP_CONTRIBUTIONS.fixedDue.day),
    label: 'Взносы «за себя» (фиксированные)',
    amount: burden.contributions.fixed,
    kind: 'contributions',
  });

  if (burden.contributions.extra > 0) {
    out.push({
      date: iso(year + 1, IP_CONTRIBUTIONS.extraDue.month, IP_CONTRIBUTIONS.extraDue.day),
      label: 'Взносы: 1% с дохода свыше 300 000 ₽',
      amount: burden.contributions.extra,
      kind: 'contributions',
    });
  }

  if (burden.contributions.voluntary > 0) {
    out.push({
      date: iso(year, VOLUNTARY_SFR.due.month, VOLUNTARY_SFR.due.day),
      label: 'Добровольные взносы в СФР (больничные)',
      amount: burden.contributions.voluntary,
      kind: 'contributions',
    });
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ──────────────────  Что выгоднее  ────────────────── */

export interface RegimeOption {
  status: TaxStatus;
  name: string;
  total: number;
  effectiveRate: number;
  available: boolean;
  reason?: string;
}

/**
 * Сравнение режимов при текущем доходе — «а что если бы».
 * Патент участвует, только если его стоимость введена: её задаёт регион.
 */
export function compareRegimes(
  profile: TaxProfile,
  income: number,
  expenses: number,
  npdAllowed: boolean,
  psnAllowed: boolean
): RegimeOption[] {
  const make = (status: TaxStatus, name: string, available: boolean, reason?: string) => {
    const b = annualBurden({ ...profile, status }, income, expenses);
    return { status, name, total: b.total, effectiveRate: b.effectiveRate, available, reason };
  };

  const options: RegimeOption[] = [];

  // Работающему без оформления показываем его текущую позицию в сравнении:
  // почти всегда выходит, что легализоваться просто дешевле.
  if (profile.status === 'unofficial') {
    options.push(make('unofficial', 'Без оформления (НДФЛ 13–22%)', true));
  }

  options.push(
    make(
      'npd',
      'Самозанятый (НПД)',
      npdAllowed && income <= NPD.incomeLimit,
      !npdAllowed
        ? 'Недоступен для этого вида деятельности'
        : income > NPD.incomeLimit
          ? `Доход выше лимита ${fmt(NPD.incomeLimit)} ₽`
          : undefined
    ),
    make('ip_usn_income', 'ИП, УСН «Доходы» 6%', true),
    make('ip_usn_profit', 'ИП, УСН «Доходы − расходы» 15%', true,
      expenses === 0 ? 'Нужны подтверждённые расходы, иначе смысла нет' : undefined)
  );

  if (psnAllowed && profile.patentCost) {
    options.push(make('ip_psn', 'ИП, патент', true));
  }

  return options.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.total - b.total;
  });
}

/* ──────────────────  Мелочи  ────────────────── */

function fmt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function pct(r: number): string {
  const v = r * 100;
  const s = Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v).toString() : v.toFixed(1);
  return `${s.replace('.', ',')}%`;
}
