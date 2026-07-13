/**
 * НАЛОГОВЫЕ КОНСТАНТЫ.
 *
 * Это значения ПО УМОЛЧАНИЮ, вшитые в приложение. Поверх них накладывается
 * свежий tax-config.json из репозитория (см. src/services/taxConfig.ts) —
 * так ставки можно обновлять без пересборки приложения.
 *
 * Поэтому объекты здесь МУТАБЕЛЬНЫЕ: applyTaxConfig() перезаписывает поля,
 * а весь расчёт читает их в момент вызова и сразу видит новые цифры.
 *
 * Источник истины — nalog.gov.ru и НК РФ. Приложение считает, а не
 * консультирует: перед оплатой сверяйся с личным кабинетом ФНС.
 */

export const TAX_YEAR = 2026;

/** Откуда взяты действующие цифры — показываем в интерфейсе. */
export const TAX_META = {
  year: 2026,
  updatedAt: '2026-07-13',
  source: 'nalog.gov.ru, ФЗ-425 от 28.11.2025, Распоряжение № 4125-р',
  /** true — цифры пришли из свежего конфига, а не из вшитых значений. */
  fromRemote: false,
};

/* ───────────────────  НПД — самозанятые (ФЗ-422)  ─────────────────── */

export const NPD = {
  /** Доход от физлиц. */
  rateIndividual: 0.04,
  /** Доход от юрлиц и ИП. */
  rateCompany: 0.06,

  /**
   * Налоговый бонус — 10 000 ₽ один раз на всю жизнь.
   * Он не выдаётся деньгами, а гасит часть налога: 1 п.п. из 4%
   * и 2 п.п. из 6%. Пока бонус не кончится, платишь фактически 3% и 4%.
   */
  bonusTotal: 10_000,
  bonusRateIndividual: 0.01,
  bonusRateCompany: 0.02,

  /** Превысил — слетаешь с НПД до конца года. */
  incomeLimit: 2_400_000,

  /** Налог за месяц платится до 28-го числа следующего месяца. */
  payByDay: 28,

  /**
   * Новое: самозанятые могут добровольно платить взносы и получать больничные.
   * Взнос 1 344–1 920 ₽/мес, право на выплаты — через 6 месяцев платежей.
   * Режим НПД продлён до 31.12.2028.
   */
  voluntarySickMin: 1_344,
  voluntarySickMax: 1_920,
  regimeEndsAt: '2028-12-31',
};

/* ─────────────  Страховые взносы ИП «за себя» (ст. 430 НК)  ───────────── */

export const IP_CONTRIBUTIONS = {
  /** Фиксированный взнос за 2026 год. Платится, даже если дохода не было. */
  fixed: 57_390,

  /** Плюс 1% с дохода сверх 300 000 ₽ за год. */
  extraRate: 0.01,
  extraThreshold: 300_000,
  /** Потолок этой 1%-й части. Максимум взносов за год: 57 390 + 321 818 = 379 208 ₽. */
  extraCap: 321_818,

  /** Фиксированный — до 28 декабря. */
  fixedDue: { month: 12, day: 28 },
  /** 1% с превышения — до 1 июля следующего года. */
  extraDue: { month: 7, day: 1 },
};

/* ──────────────  Взносы ИП за РАБОТНИКОВ (единый тариф)  ────────────── */

export const PAYROLL = {
  /** Базовый единый тариф с выплат работнику. */
  baseRate: 0.3,
  /** Сверх единой предельной базы тариф падает. */
  aboveLimitRate: 0.151,
  /**
   * Единая предельная база на одного работника за год.
   * Постановление Правительства РФ № 1705 от 31.10.2025.
   */
  limitBase: 2_979_000,

  /**
   * Льготный тариф МСП: с выплат сверх 1,5 МРОТ — 15% вместо 30%.
   *
   * ⚠️ С 2026 года статус МСП САМ ПО СЕБЕ льготу больше не даёт. Нужны два
   * условия сразу:
   *   1. основной ОКВЭД входит в перечень (Распоряжение Правительства РФ
   *      от 27.12.2025 № 4125-р);
   *   2. доля дохода от этого вида деятельности — не менее 70% за каждый
   *      квартал, полугодие, 9 месяцев и год.
   * Не попадаешь — платишь общие 30%.
   */
  msmeRate: 0.15,
  msmeThresholdMrots: 1.5,

  /** МРОТ с 1 января 2026 года. */
  mrot: 27_093,

  /**
   * Взносы на травматизм (НС и ПЗ). Ставка зависит от класса профриска:
   * от 0,2% (офис) до 8,5% (опасное производство). Предельной базы нет.
   */
  injuryMin: 0.002,
  injuryMax: 0.085,

  /** Взносы за работников — до 28-го числа следующего месяца. */
  payByDay: 28,
};

/**
 * Добровольные взносы ИП «за себя» в СФР — на больничные и декрет.
 * Платить НЕ обязательно. Заплатил в этом году — получишь право на выплаты
 * в следующем. Сумма = 2,9% × МРОТ × 12.
 */
export const VOLUNTARY_SFR = {
  rate: 0.029,
  due: { month: 12, day: 31 },
};

/** Сумма добровольного взноса в СФР за год. Считается от текущего МРОТ. */
export function voluntarySfrAmount(): number {
  return Math.round(PAYROLL.mrot * 12 * VOLUNTARY_SFR.rate);
}

/* ────────────────────────────  УСН  ──────────────────────────── */

export const USN = {
  /** «Доходы». Регион может снизить до 1%. */
  incomeRate: 0.06,
  /** «Доходы минус расходы». Регион может снизить до 5%. */
  profitRate: 0.15,
  /** Минимальный налог на «доходы минус расходы»: 1% от всех доходов. */
  minTaxRate: 0.01,

  /**
   * Базовый лимит дохода для УСН. Индексируется коэффициентом-дефлятором,
   * поэтому реальный лимит выше — см. usnIncomeLimit().
   */
  incomeLimit: 450_000_000,

  /** Коэффициент-дефлятор на 2026 год (приказ Минэкономразвития № 734 от 06.11.2025). */
  deflator: 1.09,

  /**
   * Порог, после которого ИП на УСН становится плательщиком НДС.
   * Реформа-2026 (ФЗ-425 от 28.11.2025) обрушила его с 60 млн до 20 млн ₽.
   * На дефлятор НЕ индексируется — 20 млн это 20 млн.
   */
  vatThreshold: 20_000_000,

  /**
   * Ставки НДС для тех, кто перевалил порог:
   *   5%  — доход 20–250 млн, БЕЗ права на вычеты;
   *   7%  — доход 250–450 млн, тоже без вычетов;
   *   22% — по выбору, зато с вычетами (базовая ставка НДС выросла с 20% до 22%).
   */
  vatRateBase: 0.22,
  vatRateLow: 0.05,
  vatRateMid: 0.07,
  vatLowLimit: 250_000_000,
  vatMidLimit: 450_000_000,

  /** Авансы: 1 кв., полугодие, 9 мес. Годовой — до 28 апреля следующего года. */
  advanceDues: [
    { month: 4, day: 28, label: 'Аванс за I квартал' },
    { month: 7, day: 28, label: 'Аванс за полугодие' },
    { month: 10, day: 28, label: 'Аванс за 9 месяцев' },
  ],
  finalDue: { month: 4, day: 28, label: 'Налог за год' },
};

/**
 * Реальный лимит дохода для УСН: базовый × коэффициент-дефлятор.
 * В 2026-м это 450 млн × 1,09 ≈ 490,5 млн ₽ — а не 450, как можно подумать,
 * глядя в Налоговый кодекс.
 */
export function usnIncomeLimit(): number {
  return USN.incomeLimit * USN.deflator;
}

/* ────────────────────────  Патент (ПСН)  ──────────────────────── */

export const PSN = {
  /** Стоимость = потенциальный доход (его задаёт регион) × 6%. */
  rate: 0.06,

  /**
   * Реформа-2026 срезала лимит с 60 млн до 20 млн ₽ — и продолжит резать:
   * 15 млн в 2027-м, 10 млн с 2028-го.
   */
  incomeLimit: 20_000_000,
  limitNextYears: { 2027: 15_000_000, 2028: 10_000_000 },

  /** Патент нельзя купить, если работников больше 15. */
  employeeLimit: 15,
};

/* ─────────────────  НДФЛ — прогрессивная шкала (с 2025)  ───────────────── */

/** Ставка применяется к части дохода внутри своей ступени, а не ко всему доходу. */
export const NDFL_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 2_400_000, rate: 0.13 },
  { upTo: 5_000_000, rate: 0.15 },
  { upTo: 20_000_000, rate: 0.18 },
  { upTo: 50_000_000, rate: 0.2 },
  { upTo: Infinity, rate: 0.22 },
];

/**
 * Нерезидент платит плоские 30% и не имеет права на вычеты.
 * Исключение: у нерезидентов, работающих по трудовому/патентному оформлению
 * в РФ, может применяться та же прогрессия 13–22% — это отдельный случай,
 * здесь его не моделируем.
 */
export const NDFL = { nonResident: 0.3 };

/**
 * Сроки для тех, за кого никто не удерживает НДФЛ (доход без оформления,
 * без налогового агента). Такой доход декларируешь и платишь сам:
 *   — декларация 3-НДФЛ  — до 30 апреля следующего года;
 *   — сам налог          — до 15 июля следующего года.
 */
export const NDFL_SELF_DUES = {
  declaration: { month: 4, day: 30 },
  payment: { month: 7, day: 15 },
};

/* ───────────────  Применение свежего конфига поверх констант  ─────────────── */

/** Форма файла tax-config.json (все поля необязательны). */
export interface TaxConfig {
  year?: number;
  updatedAt?: string;
  source?: string;
  npd?: Partial<typeof NPD>;
  ipContributions?: Partial<typeof IP_CONTRIBUTIONS>;
  payroll?: Partial<typeof PAYROLL>;
  voluntarySfr?: Partial<typeof VOLUNTARY_SFR>;
  usn?: Partial<typeof USN>;
  psn?: Partial<typeof PSN>;
  ndflBrackets?: { upTo: number; rate: number }[];
  ndflNonResident?: number;
}

/**
 * Накладывает свежие ставки поверх вшитых.
 * Мутируем те же объекты, на которые уже ссылаются расчёты, — поэтому
 * пересчёт сразу подхватывает новые цифры, без перезапуска приложения.
 */
export function applyTaxConfig(cfg: TaxConfig): void {
  if (cfg.npd) Object.assign(NPD, cfg.npd);
  if (cfg.ipContributions) Object.assign(IP_CONTRIBUTIONS, cfg.ipContributions);
  if (cfg.payroll) Object.assign(PAYROLL, cfg.payroll);
  if (cfg.voluntarySfr) Object.assign(VOLUNTARY_SFR, cfg.voluntarySfr);
  if (cfg.usn) Object.assign(USN, cfg.usn);
  if (cfg.psn) Object.assign(PSN, cfg.psn);

  if (cfg.ndflBrackets?.length) {
    // upTo: null в JSON означает «до бесконечности»
    NDFL_BRACKETS.length = 0;
    NDFL_BRACKETS.push(
      ...cfg.ndflBrackets.map((b) => ({
        upTo: b.upTo == null ? Infinity : b.upTo,
        rate: b.rate,
      }))
    );
  }

  if (typeof cfg.ndflNonResident === 'number') NDFL.nonResident = cfg.ndflNonResident;

  TAX_META.fromRemote = true;
  if (cfg.year) TAX_META.year = cfg.year;
  if (cfg.updatedAt) TAX_META.updatedAt = cfg.updatedAt;
  if (cfg.source) TAX_META.source = cfg.source;
}

/* ───────────────  Специализация ИП: что она реально решает  ─────────────── */

/**
 * Вид деятельности влияет на две вещи:
 *   1. Доступен ли НПД (самозанятость). Перепродажа чужих товаров,
 *      подакцизные товары, работа по агентским договорам — НПД запрещён.
 *   2. Доступен ли патент (перечень видов — ст. 346.43 НК, плюс решение региона).
 *
 * На сами ставки УСН специализация не влияет — но регион может дать
 * пониженную ставку именно под твой ОКВЭД, это проверяется вручную.
 */
export interface Activity {
  id: string;
  name: string;
  icon: string;
  /** Можно ли на этом виде деятельности быть самозанятым. */
  npdAllowed: boolean;
  /** Есть ли этот вид в перечне для патента. */
  psnAllowed: boolean;
  /** Чем именно тут можно обжечься. */
  note?: string;
}

export const ACTIVITIES: Activity[] = [
  {
    id: 'it',
    name: 'IT и разработка',
    icon: 'code-slash',
    npdAllowed: true,
    psnAllowed: true,
    note: 'Частая связка: НПД до 2,4 млн ₽, дальше ИП на УСН 6%. Многие регионы дают ставку 1–3% для IT — проверь свой.',
  },
  {
    id: 'design',
    name: 'Дизайн и креатив',
    icon: 'color-palette',
    npdAllowed: true,
    psnAllowed: true,
  },
  {
    id: 'marketing',
    name: 'Маркетинг и реклама',
    icon: 'megaphone',
    npdAllowed: true,
    psnAllowed: false,
    note: 'Осторожно: работа по агентскому договору лишает права на НПД.',
  },
  {
    id: 'education',
    name: 'Обучение, репетиторство',
    icon: 'school',
    npdAllowed: true,
    psnAllowed: true,
  },
  {
    id: 'beauty',
    name: 'Красота, парикмахерская',
    icon: 'cut',
    npdAllowed: true,
    psnAllowed: true,
    note: 'Патент часто выгоднее УСН — посчитай на patent.nalog.ru.',
  },
  {
    id: 'repair',
    name: 'Ремонт и строительство',
    icon: 'hammer',
    npdAllowed: true,
    psnAllowed: true,
    note: 'Материалы заказчика — можно. Перепродажа своих материалов с наценкой — уже не НПД.',
  },
  {
    id: 'transport',
    name: 'Такси и грузоперевозки',
    icon: 'car',
    npdAllowed: true,
    psnAllowed: true,
  },
  {
    id: 'photo',
    name: 'Фото и видео',
    icon: 'camera',
    npdAllowed: true,
    psnAllowed: true,
  },
  {
    id: 'consulting',
    name: 'Консалтинг, юристы, бухгалтеры',
    icon: 'briefcase',
    npdAllowed: true,
    psnAllowed: false,
  },
  {
    id: 'handmade',
    name: 'Своё производство, хендмейд',
    icon: 'construct',
    npdAllowed: true,
    psnAllowed: true,
    note: 'Продавать можно только то, что сделал сам. Чужое перепродавать — нельзя.',
  },
  {
    id: 'retail',
    name: 'Розничная торговля',
    icon: 'storefront',
    npdAllowed: false,
    psnAllowed: true,
    note: '❌ Самозанятость невозможна: перепродажа чужих товаров под НПД запрещена. Нужен ИП. С 2026 патент на стационарную розницу остался только в сельской местности.',
  },
  {
    id: 'food',
    name: 'Общепит',
    icon: 'restaurant',
    npdAllowed: false,
    psnAllowed: true,
    note: '❌ Самозанятость невозможна. Плюс алкоголь — подакцизный товар.',
  },
  {
    id: 'rent',
    name: 'Аренда недвижимости',
    icon: 'home',
    npdAllowed: true,
    psnAllowed: true,
    note: 'НПД — только жилая недвижимость. Сдаёшь нежилое (офис, склад) — нужен ИП.',
  },
  {
    id: 'other',
    name: 'Другое',
    icon: 'ellipsis-horizontal',
    npdAllowed: true,
    psnAllowed: false,
  },
];

export function activityById(id?: string): Activity | undefined {
  return ACTIVITIES.find((a) => a.id === id);
}
