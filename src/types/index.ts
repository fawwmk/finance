/**
 * Модель данных приложения учёта финансов.
 * Всё хранится локально на телефоне (позже добавим облачную синхронизацию).
 */

/** Поддерживаемые валюты (расширяемо). Курс всегда пересчитываем к базовой. */
export type CurrencyCode = 'RUB' | 'USD' | 'EUR' | 'GBP' | 'KGS' | 'KZT';

/** Откуда берём курсы. */
export type RateSource = 'cbr' | 'aiyl';

/** У обменника курс наличных и безналичных отличается — и сильно. */
export type CashMode = 'cash' | 'card';

export type TxKind = 'income' | 'expense';

/** Категория трат или доходов. */
export interface Category {
  id: string;
  name: string;
  /** Имя иконки (набор Ionicons). */
  icon: string;
  /** HEX-цвет для визуального различия. */
  color: string;
  kind: TxKind;
  /** Встроенные категории нельзя удалить. */
  system?: boolean;
}

/** От кого пришли деньги. Важно для самозанятого: 4% от физлиц, 6% от юрлиц. */
export type PayerType = 'individual' | 'company';

/** Одна операция: трата или поступление. */
export interface Transaction {
  id: string;
  kind: TxKind;
  /** Сумма в валюте операции, всегда положительная. */
  amount: number;
  currency: CurrencyCode;
  categoryId: string;
  /** ISO-дата (YYYY-MM-DD) — когда произошла операция. */
  date: string;
  note?: string;
  /** Откуда появилась запись. */
  source: 'manual' | 'receipt' | 'recurring';
  /** Если операция создана из чека — ссылка на распознанный чек. */
  receiptId?: string;

  /** Доход: это выручка от бизнеса, с которой платится налог. */
  taxable?: boolean;
  /** Доход: от кого пришло (для НПД — определяет ставку 4% или 6%). */
  payerType?: PayerType;
  /** Расход: подтверждённый расход бизнеса (для УСН «доходы минус расходы»). */
  taxDeductible?: boolean;

  createdAt: number;
}

/** Периодичность регулярных событий (зарплата, подписки, платежи по кредиту). */
export type Recurrence = 'monthly' | 'weekly' | 'yearly' | 'once';

/**
 * Регулярное/запланированное событие:
 * — зарплата 5-го числа,
 * — подписка Netflix 20-го,
 * — платёж по кредиту 15-го.
 */
export interface RecurringItem {
  id: string;
  name: string;
  kind: TxKind;
  amount: number;
  currency: CurrencyCode;
  categoryId: string;
  recurrence: Recurrence;
  /** День месяца (1-31) для monthly; для weekly — день недели 0-6; для once/yearly — см. nextDate. */
  dayOfMonth?: number;
  /** Ближайшая дата события (ISO YYYY-MM-DD). */
  nextDate: string;
  /** Помечает платёж по кредиту (для отдельной аналитики долгов). */
  isCredit?: boolean;
  /** Если платёж создан вместе с кредитом — ссылка на него. */
  loanId?: string;
  /** Напоминать заранее (за сколько дней). 0 — в день события. undefined — не напоминать. */
  remindDaysBefore?: number;
  active: boolean;
}

/** Распознанный чек (результат OCR). */
export interface Receipt {
  id: string;
  imageUri: string;
  /** Распознанная дата чека. */
  date?: string;
  currency?: CurrencyCode;
  total?: number;
  merchant?: string;
  /** Позиции чека. */
  items: ReceiptItem[];
  /** Язык, на котором распознан чек. */
  language?: string;
  createdAt: number;
}

export interface ReceiptItem {
  name: string;
  price: number;
  qty?: number;
  categoryId?: string;
}

/** Цель накопления (например: накопить 300 000 на отпуск). */
export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  currency: CurrencyCode;
  saved: number;
  /** Желаемая дата достижения (опционально). */
  targetDate?: string;
  createdAt: number;
}

/** Курсы валют к базовой валюте пользователя. */
export interface ExchangeRates {
  base: CurrencyCode;
  /** rates[X] — сколько базовой валюты стоит 1 единица X (середина между покупкой и продажей). */
  rates: Partial<Record<CurrencyCode, number>>;
  /** Изменение курса за сутки, в базовой валюте (для стрелок ▲▼). Только у ЦБ. */
  delta?: Partial<Record<CurrencyCode, number>>;

  /** Откуда взяты. */
  source: RateSource;
  /** Для банка: наличные или безнал — курсы отличаются заметно. */
  cashMode?: CashMode;
  /** Сколько базовой валюты нужно ОТДАТЬ, чтобы купить 1 единицу X. */
  buy?: Partial<Record<CurrencyCode, number>>;
  /** Сколько базовой валюты ПОЛУЧИШЬ, продав 1 единицу X. */
  sell?: Partial<Record<CurrencyCode, number>>;

  fetchedAt: number;
}

/**
 * Реальный обмен валюты: отдал столько-то одного, получил столько-то другого.
 *
 * Это и есть точный учёт. Никакой опубликованный курс не скажет, сколько ты
 * получил на самом деле — там есть спред, комиссия, округление. А вот две
 * цифры «отдал» и «получил» врать не умеют: из них считается настоящий курс,
 * по которому ты обменял.
 */
export interface Exchange {
  id: string;
  date: string;
  fromCurrency: CurrencyCode;
  fromAmount: number;
  toCurrency: CurrencyCode;
  toAmount: number;
  /** Фактический курс = fromAmount / toAmount (сколько отдал за единицу). */
  rate: number;
  /** Где менял — для памяти. */
  place?: string;
  note?: string;
  createdAt: number;
}

/* ────────────────────────────  КРЕДИТЫ  ──────────────────────────── */

/**
 * Тип платежа. Все банки РФ (Сбер, Т-Банк, Альфа, ВТБ…) считают по одной
 * и той же формуле, регламентированной ЦБ и 353-ФЗ. Различаются только
 * ставкой, сроком и страховкой — сама математика одинаковая.
 */
export type LoanType = 'annuity' | 'differentiated';

/** Обычный кредит с графиком — или кредитная карта с беспроцентным периодом. */
export type LoanProduct = 'loan' | 'card';

/** Кредит / ипотека / рассрочка / кредитная карта. */
export interface Loan {
  id: string;
  /** Название: «Ипотека», «Автокредит» и т.п. */
  name: string;
  /** id банка из BANKS (см. src/data/banks.ts) либо 'other'. */
  bankId: string;
  product: LoanProduct;
  currency: CurrencyCode;
  /** Ставка, % годовых. У карты — та, что начнёт капать, если проспать льготный период. */
  annualRate: number;
  /** Создавать напоминание о платеже за N дней. */
  remindDaysBefore?: number;
  createdAt: number;

  /* ── Только для обычного кредита (product: 'loan') ── */
  /** Сумма кредита (тело долга при выдаче). */
  principal: number;
  /** Срок в месяцах. */
  months: number;
  type: LoanType;
  /** Дата первого платежа (ISO YYYY-MM-DD). */
  firstPaymentDate: string;
  /** Досрочное погашение: сколько добавляешь сверх платежа каждый месяц. */
  extraMonthly?: number;

  /* ── Только для кредитной карты (product: 'card') ── */
  /** Кредитный лимит. */
  creditLimit?: number;
  /** Сколько сейчас должен банку. */
  cardDebt?: number;
  /** Длина беспроцентного периода в днях: 55, 60, 100, 120, 365… */
  gracePeriodDays?: number;
  /** Когда начался текущий льготный период (ISO) — обычно дата выписки/первой покупки. */
  graceStartDate?: string;
  /** Минимальный платёж, % от долга (обычно 3–8%). */
  minPaymentPercent?: number;
}

/* ────────────────────────────  НАЛОГИ  ──────────────────────────── */

/**
 * Налоговый статус.
 * ВАЖНО: резидентство влияет только на НДФЛ (зарплата и ИП на ОСНО).
 * На НПД, УСН и патент оно не влияет никак — ставки там одинаковые.
 */
export type TaxStatus =
  | 'employee' // работаю по найму, НДФЛ удерживает работодатель
  | 'unofficial' // работаю без оформления, зарплата приходит на карту как есть
  | 'npd' // самозанятый
  | 'ip_usn_income' // ИП, УСН «Доходы»
  | 'ip_usn_profit' // ИП, УСН «Доходы минус расходы»
  | 'ip_psn' // ИП на патенте
  | 'ip_osno'; // ИП на общей системе

export interface TaxProfile {
  status: TaxStatus;
  /** Налоговый резидент РФ — провёл в стране 183+ дня за 12 месяцев. */
  resident: boolean;
  /** Вид деятельности (см. ACTIVITIES в src/data/tax.ts). */
  activityId?: string;
  /** Есть ли наёмные работники — меняет правила уменьшения налога на взносы. */
  hasEmployees?: boolean;
  /** Сколько работников. */
  employeeCount?: number;
  /** Фонд оплаты труда в месяц — вся зарплата «грязными», на всех вместе. */
  payrollMonthly?: number;
  /** Применяю льготный тариф МСП (15% с выплат сверх 1,5 МРОТ). */
  msmeTariff?: boolean;
  /** Тариф взносов на травматизм, % (0,2 — офис, до 8,5 — опасное производство). */
  injuryRatePercent?: number;
  /** Плачу добровольные взносы в СФР — ради права на больничные и декрет. */
  voluntarySfr?: boolean;
  /** Ставка УСН в процентах, если регион снизил (иначе 6 или 15). */
  usnRatePercent?: number;
  /** Годовая стоимость патента — её задаёт регион (patent.nalog.ru). */
  patentCost?: number;
  /** Сколько из бонуса самозанятого (10 000 ₽) уже израсходовано. */
  npdBonusUsed?: number;
}

/** Пользовательские настройки. */
export interface Settings {
  baseCurrency: CurrencyCode;
  /** Откуда брать курсы: официальные ЦБ или реальные банковские. */
  rateSource?: RateSource;
  /** Для банка: считать по наличному курсу или по безналичному. */
  cashMode?: CashMode;
  /** Языки для распознавания чеков. */
  ocrLanguages: string[];
  /** Каким сервисом распознавать чеки. */
  ocrProvider?: 'claude' | 'ocrspace';
  /** Ключ Anthropic API (console.anthropic.com) — лучшее качество разбора чеков. */
  claudeApiKey?: string;
  /** Ключ OCR.space (бесплатный на ocr.space/ocrapi) — запасной вариант. */
  ocrSpaceApiKey?: string;
  /** Присылать напоминания о платежах и зарплате. */
  notificationsEnabled?: boolean;
}
