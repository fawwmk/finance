/**
 * Курсы валют. Два источника:
 *
 *   ЦБ РФ      — официальный, честный API, обновляется раз в сутки в будни.
 *                Это «книжный» курс: по нему нигде нельзя реально обменять.
 *   Айыл Банк  — курс, по которому ты РЕАЛЬНО меняешь. С покупкой, продажей
 *                и спредом. Для точного учёта нужен именно он.
 *
 * Если банк не ответил или сломался парсер — молча откатываемся на ЦБ.
 * Приложение никогда не остаётся без курсов.
 */

import { CashMode, CurrencyCode, ExchangeRates, RateSource } from '../types';
import { fetchAiylRates } from './aiyl';
import { fetchWithTimeout } from '../utils/http';

const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';

/** Валюты, которые показываем и умеем конвертировать. */
export const TRACKED: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'GBP', 'KGS', 'KZT'];

interface CbrValute {
  CharCode: string;
  Nominal: number;
  Value: number;
  Previous: number;
}

interface CbrResponse {
  Date: string;
  Valute: Record<string, CbrValute>;
}

/** Сколько рублей стоит 1 единица валюты (RUB = 1). */
function rubPerUnit(data: CbrResponse, code: CurrencyCode, prev = false): number {
  if (code === 'RUB') return 1;
  const v = data.Valute[code];
  if (!v) return 0;
  const value = prev ? v.Previous : v.Value;
  return value / v.Nominal;
}

/** Официальные курсы ЦБ РФ, пересчитанные в базовую валюту пользователя. */
export async function fetchCbrRates(base: CurrencyCode): Promise<ExchangeRates> {
  const res = await fetchWithTimeout(CBR_URL, {}, 10_000);
  if (!res.ok) throw new Error(`ЦБ РФ ответил ${res.status}`);
  const data: CbrResponse = await res.json();

  // Вместо JSON мог прийти HTML со страницей ошибки — тогда Valute нет.
  // Молча вернуть пустые курсы нельзя: без курсов суммы в валюте пропадут
  // из итогов, и человек не поймёт почему. Пусть лучше будет честная ошибка.
  if (!data?.Valute || typeof data.Valute !== 'object') {
    throw new Error('ЦБ РФ вернул неожиданный ответ');
  }

  const build = (prev: boolean) => {
    const rubPerBase = rubPerUnit(data, base, prev);
    const out: Partial<Record<CurrencyCode, number>> = {};
    for (const code of TRACKED) {
      const rub = rubPerUnit(data, code, prev);
      // 1 X = rub рублей; 1 base = rubPerBase рублей => 1 X = rub / rubPerBase базовых
      if (rub && rubPerBase) out[code] = rub / rubPerBase;
    }
    return out;
  };

  const rates = build(false);
  const previous = build(true);

  const delta: Partial<Record<CurrencyCode, number>> = {};
  for (const code of TRACKED) {
    const now = rates[code];
    const before = previous[code];
    if (now != null && before != null) delta[code] = now - before;
  }

  return { base, rates, delta, source: 'cbr', fetchedAt: Date.now() };
}

/**
 * Курсы из выбранного источника. Банк не ответил — берём ЦБ,
 * чтобы приложение продолжало работать.
 */
export async function fetchRates(
  base: CurrencyCode,
  source: RateSource = 'cbr',
  cashMode: CashMode = 'card'
): Promise<ExchangeRates> {
  if (source === 'aiyl') {
    try {
      return await fetchAiylRates(base, cashMode);
    } catch {
      // Сайт банка недоступен или переделали вёрстку — не оставаться же без курсов.
      // Помечаем, что просили банк: иначе приложение сочтёт эти курсы «чужими»
      // и будет ломиться в сеть при каждом открытии экрана.
      const cbr = await fetchCbrRates(base);
      return { ...cbr, requestedSource: 'aiyl', requestedCashMode: cashMode };
    }
  }
  return fetchCbrRates(base);
}

/** Курсы устарели, если им больше 6 часов или сменился источник/режим. */
export function isStale(
  r?: ExchangeRates | null,
  base?: CurrencyCode,
  source?: RateSource,
  cashMode?: CashMode
): boolean {
  if (!r) return true;
  if (base && r.base !== base) return true;

  // Сравниваем с тем, что ПРОСИЛИ, а не с тем, что в итоге получили.
  const asked = r.requestedSource ?? r.source;
  const askedCash = r.requestedCashMode ?? r.cashMode;
  if (source && asked !== source) return true;
  if (source === 'aiyl' && cashMode && askedCash !== cashMode) return true;

  return Date.now() - r.fetchedAt > 6 * 60 * 60 * 1000;
}
