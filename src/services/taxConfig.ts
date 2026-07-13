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
 * Грубая проверка вменяемости: если в конфиг заедет мусор или пустой объект,
 * лучше остаться на вшитых ставках, чем считать налоги по нулям.
 */
function looksSane(cfg: any): cfg is TaxConfig {
  if (!cfg || typeof cfg !== 'object') return false;

  const fixed = cfg.ipContributions?.fixed;
  if (fixed != null && (typeof fixed !== 'number' || fixed <= 0 || fixed > 1_000_000)) {
    return false;
  }

  const npdRate = cfg.npd?.rateCompany;
  if (npdRate != null && (typeof npdRate !== 'number' || npdRate <= 0 || npdRate > 1)) {
    return false;
  }

  const brackets = cfg.ndflBrackets;
  if (brackets != null && (!Array.isArray(brackets) || brackets.length === 0)) return false;

  return true;
}

/** Применяет последний сохранённый конфиг. Вызывать при старте, до расчётов. */
export async function loadCachedTaxConfig(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cached: Cached = JSON.parse(raw);
    if (looksSane(cached.config)) applyTaxConfig(cached.config);
  } catch {
    // Битый кэш — молча остаёмся на вшитых ставках.
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

    const res = await fetch(CONFIG_URL, { cache: 'no-store' } as any);
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
