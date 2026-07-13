/**
 * Автообновление налоговых ставок.
 *
 * Почему так, а не «взять из API налоговой»: у ФНС нет публичного API со
 * ставками и лимитами. Ставки живут в законах, а не в базе данных. Единственный
 * надёжный способ — держать их в файле, который можно быстро поправить.
 *
 * Как работает:
 *   1. Ставки лежат в tax-config.json в корне репозитория на GitHub.
 *   2. Приложение раз в сутки скачивает его и накладывает поверх вшитых значений.
 *   3. Нет сети — работаем на последних сохранённых, а если и их нет — на вшитых.
 *      Приложение НИКОГДА не остаётся без ставок.
 *
 * Чтобы обновить ставки: правишь tax-config.json → Sync в VS Code. Всё.
 * Пересобирать и переустанавливать приложение не нужно.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTaxConfig, TaxConfig, TAX_META } from '../data/tax';
import { fetchWithTimeout } from '../utils/http';

/** Файл берём с ветки main репозитория. */
const CONFIG_URL =
  'https://raw.githubusercontent.com/fawwmk/finance/main/tax-config.json';

const CACHE_KEY = 'tax-config-cache-v1';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // раз в сутки

interface Cached {
  config: TaxConfig;
  fetchedAt: number;
}

/**
 * Проверка вменяемости конфига.
 *
 * Раньше здесь проверялись три поля из сорока — и мусор спокойно проезжал:
 * налог мог стать 999%, а экран «Налоги» — упасть. Причём испорченный конфиг
 * сохранялся в память телефона и переживал перезапуск.
 *
 * Теперь правило простое: каждое поле, которое мы согласны принять, должно
 * быть числом в осмысленном диапазоне. Что не прошло — не берём совсем.
 * Лучше считать по вчерашним ставкам, чем по выдуманным.
 */

/**
 * Налоговая ставка: доля от 0 до 0,5.
 *
 * Потолок в 50% не случаен: самая высокая ставка в стране — 30% (взносы
 * за работников и НДФЛ для нерезидентов). Всё, что выше, — заведомо мусор,
 * и лучше отвергнуть конфиг, чем показать человеку налог в 999%.
 */
const rate = (v: unknown) => typeof v === 'number' && isFinite(v) && v >= 0 && v <= 0.5;

/** Сумма в рублях: положительная и не за гранью разумного. */
const money = (max: number) => (v: unknown) =>
  typeof v === 'number' && isFinite(v) && v > 0 && v <= max;

/** Множитель (коэффициент-дефлятор и т.п.). */
const factor = (min: number, max: number) => (v: unknown) =>
  typeof v === 'number' && isFinite(v) && v >= min && v <= max;

/**
 * Что мы согласны принять из интернета: поле → проверка.
 * Поля, которых здесь нет (сроки уплаты, лимиты по годам), обновлять
 * удалённо нельзя вообще — они меняют структуру расчёта, а не цифру.
 */
const SHAPE: Record<string, Record<string, (v: unknown) => boolean>> = {
  npd: {
    rateIndividual: rate,
    rateCompany: rate,
    bonusTotal: money(1_000_000),
    bonusRateIndividual: rate,
    bonusRateCompany: rate,
    incomeLimit: money(100_000_000),
    payByDay: factor(1, 31),
    voluntarySickMin: money(100_000),
    voluntarySickMax: money(100_000),
  },
  ipContributions: {
    fixed: money(1_000_000),
    extraThreshold: money(10_000_000),
    extraRate: rate,
    extraCap: money(10_000_000),
  },
  payroll: {
    baseRate: rate,
    aboveLimitRate: rate,
    limitBase: money(100_000_000),
    msmeRate: rate,
    msmeThresholdMrots: factor(0.1, 10),
    mrot: money(1_000_000),
    injuryMin: rate,
    injuryMax: rate,
    payByDay: factor(1, 31),
  },
  usn: {
    incomeRate: rate,
    profitRate: rate,
    minTaxRate: rate,
    incomeLimit: money(10_000_000_000),
    deflator: factor(1, 5),
    vatThreshold: money(10_000_000_000),
    vatRateBase: rate,
    vatRateLow: rate,
    vatRateMid: rate,
    vatLowLimit: money(10_000_000_000),
    vatMidLimit: money(10_000_000_000),
  },
  psn: {
    rate,
    incomeLimit: money(10_000_000_000),
    employeeLimit: factor(1, 1000),
  },
  voluntarySfr: { rate },
};

/** Шкала НДФЛ: возрастающая, все ставки разумные, последняя ступень — «и выше». */
function bracketsOk(brackets: unknown): boolean {
  if (!Array.isArray(brackets) || brackets.length === 0) return false;

  let prev = 0;
  for (let i = 0; i < brackets.length; i++) {
    const b: any = brackets[i];
    if (!b || typeof b !== 'object') return false;
    if (!rate(b.rate) || b.rate === 0) return false;

    const isLast = i === brackets.length - 1;
    if (isLast) {
      // Верхняя ступень обязана быть открытой (upTo: null), иначе доход выше
      // неё обложится нулём — приложение молча занизит налог.
      if (b.upTo != null) return false;
    } else {
      if (typeof b.upTo !== 'number' || !isFinite(b.upTo) || b.upTo <= prev) return false;
      prev = b.upTo;
    }
  }
  return true;
}

export function looksSane(cfg: any): cfg is TaxConfig {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;

  for (const [group, fields] of Object.entries(SHAPE)) {
    const got = cfg[group];
    if (got == null) continue; // поле не прислали — останемся на вшитом
    if (typeof got !== 'object' || Array.isArray(got)) return false;

    for (const [key, value] of Object.entries(got)) {
      const check = fields[key];
      // Незнакомое поле — признак того, что конфиг не тот, что мы ждём.
      if (!check) return false;
      if (!check(value)) return false;
    }
  }

  if (cfg.ndflBrackets != null && !bracketsOk(cfg.ndflBrackets)) return false;
  if (cfg.ndflNonResident != null && !rate(cfg.ndflNonResident)) return false;

  return true;
}

/** Применяет последний сохранённый конфиг. Вызывать при старте, до расчётов. */
export async function loadCachedTaxConfig(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cached: Cached = JSON.parse(raw);

    if (looksSane(cached.config)) {
      applyTaxConfig(cached.config);
      return;
    }
    // Кэш не прошёл проверку — выбрасываем. Иначе он будет отравлять
    // каждый запуск, а суточный интервал не даст скачать исправленный файл.
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // Битый кэш — молча остаёмся на вшитых ставках.
    await AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
  }
}

/**
 * Проверяет, не появились ли свежие ставки.
 * @param force игнорировать суточный интервал (кнопка «Обновить» в настройках)
 * @returns true — ставки обновились
 */
export async function refreshTaxConfig(force = false): Promise<boolean> {
  try {
    if (!force) {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached: Cached = JSON.parse(raw);
        if (Date.now() - cached.fetchedAt < CHECK_INTERVAL_MS) return false;
      }
    }

    const res = await fetchWithTimeout(CONFIG_URL, { cache: 'no-store' } as any, 10_000);
    if (!res.ok) return false;

    const cfg = await res.json();
    if (!looksSane(cfg)) return false;

    applyTaxConfig(cfg);
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ config: cfg, fetchedAt: Date.now() } satisfies Cached)
    );
    return true;
  } catch {
    // Нет сети — не беда, считаем по тому, что есть.
    return false;
  }
}

/** Что сейчас показывать в интерфейсе про источник ставок. */
export function taxSource() {
  return {
    year: TAX_META.year,
    updatedAt: TAX_META.updatedAt,
    source: TAX_META.source,
    fromRemote: TAX_META.fromRemote,
    /** Ставки не обновлялись больше полугода — стоит проверить руками. */
    stale: monthsSince(TAX_META.updatedAt) > 6,
  };
}

function monthsSince(iso: string): number {
  const then = new Date(iso + 'T00:00:00').getTime();
  if (isNaN(then)) return 0;
  return (Date.now() - then) / (30 * 24 * 60 * 60 * 1000);
}
