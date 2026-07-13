/**
 * Курсы Айыл Банка (ОАО «Айыл Банк», Кыргызстан).
 *
 * У банка нет API — курсы лежат прямо в HTML главной страницы abank.kg.
 * Разбираем таблицу регуляркой. Структура там простая и стабильная:
 *
 *   <span class="course__name">USD</span></td><td>87.4000</td><td>87.8000</td>
 *
 * Первая таблица — наличные, вторая — безналичные. Курсы даны в СОМАХ
 * за единицу валюты.
 *
 * ⚠️ Это парсинг чужой вёрстки. Переделают сайт — парсер сломается. Поэтому
 * при любой неудаче молча откатываемся на курсы ЦБ, а не падаем.
 */

import { CashMode, CurrencyCode, ExchangeRates } from '../types';

const AIYL_URL = 'https://abank.kg/ky';

/** Валюты, которые котирует банк (кроме самого сома). */
const QUOTED = ['USD', 'EUR', 'RUB', 'KZT'] as const;
type Quoted = (typeof QUOTED)[number];

/** Пара курсов: почём банк ПОКУПАЕТ у тебя и почём ПРОДАЁТ тебе. Всё в сомах. */
interface Quote {
  buy: number;
  sell: number;
}

type Board = Partial<Record<Quoted, Quote>>;

const ROW =
  /course__name">(USD|EUR|RUB|KZT)<\/span>\s*<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+)<\/td>/g;

/** Достаёт из HTML две доски котировок: наличные и безнал. */
export function parseAiylHtml(html: string): { cash: Board; card: Board } {
  const rows: { code: Quoted; buy: number; sell: number }[] = [];

  ROW.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROW.exec(html)) !== null) {
    rows.push({ code: m[1] as Quoted, buy: parseFloat(m[2]), sell: parseFloat(m[3]) });
  }

  const toBoard = (slice: typeof rows): Board => {
    const b: Board = {};
    for (const r of slice) {
      if (r.buy > 0 && r.sell > 0) b[r.code] = { buy: r.buy, sell: r.sell };
    }
    return b;
  };

  // Первые четыре строки — наличные, следующие четыре — безнал.
  return { cash: toBoard(rows.slice(0, 4)), card: toBoard(rows.slice(4, 8)) };
}

/** Сом относительно самого себя — всегда 1. */
const SOM: Quote = { buy: 1, sell: 1 };

function quoteFor(board: Board, code: CurrencyCode): Quote | undefined {
  if (code === 'KGS') return SOM;
  return board[code as Quoted];
}

/**
 * Пересчитывает доску банка в курсы к базовой валюте пользователя.
 *
 * Тут вся суть. Прямого обмена «рубли → евро» у банка нет: сначала он
 * покупает у тебя рубли за сомы, потом продаёт тебе евро за сомы. Спред
 * платится ДВАЖДЫ. Поэтому кросс-курс считаем через сом честно:
 *
 *   купить 1 EUR за рубли  = (сколько сомов стоит евро при продаже)
 *                          / (сколько сомов дадут за рубль при покупке)
 *
 * Именно эта цифра — то, что ты реально заплатишь, а не красивый курс ЦБ.
 */
export function boardToRates(
  board: Board,
  base: CurrencyCode,
  cashMode: CashMode
): ExchangeRates {
  const baseQ = quoteFor(board, base);
  if (!baseQ) throw new Error(`Айыл Банк не котирует ${base}`);

  const rates: Partial<Record<CurrencyCode, number>> = {};
  const buy: Partial<Record<CurrencyCode, number>> = {};
  const sell: Partial<Record<CurrencyCode, number>> = {};

  const all: CurrencyCode[] = ['KGS', ...QUOTED];

  for (const code of all) {
    const q = quoteFor(board, code);
    if (!q) continue;

    if (code === base) {
      rates[code] = 1;
      buy[code] = 1;
      sell[code] = 1;
      continue;
    }

    // Купить 1 единицу code: банк продаёт её за q.sell сомов,
    // а сомы ты получаешь, сдавая базовую валюту по baseQ.buy.
    const costToBuy = q.sell / baseQ.buy;

    // Продать 1 единицу code: банк даёт q.buy сомов,
    // на них покупаешь базовую валюту по baseQ.sell.
    const getWhenSell = q.buy / baseQ.sell;

    buy[code] = costToBuy;
    sell[code] = getWhenSell;
    // Для оценки остатков берём середину — она не завышает и не занижает.
    rates[code] = (costToBuy + getWhenSell) / 2;
  }

  return { base, rates, buy, sell, source: 'aiyl', cashMode, fetchedAt: Date.now() };
}

/** Забирает свежие курсы Айыл Банка. Бросает исключение, если не вышло. */
export async function fetchAiylRates(
  base: CurrencyCode,
  cashMode: CashMode
): Promise<ExchangeRates> {
  const res = await fetch(AIYL_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ru' },
  });
  if (!res.ok) throw new Error(`abank.kg ответил ${res.status}`);

  const html = await res.text();
  const { cash, card } = parseAiylHtml(html);
  const board = cashMode === 'cash' ? cash : card;

  if (!board.USD || !board.EUR) {
    throw new Error('Не удалось разобрать курсы на сайте банка — вёрстка изменилась.');
  }

  return boardToRates(board, base, cashMode);
}
