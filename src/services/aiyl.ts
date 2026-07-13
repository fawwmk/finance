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
import { fetchWithTimeout } from '../utils/http';

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

/**
 * Достаёт из HTML две доски котировок: наличные и безнал.
 *
 * ОСТОРОЖНО. У банка нет API, мы разбираем вёрстку сайта. Разметка держится
 * на договорённости «первые четыре строки — наличные, следующие четыре —
 * безнал». Если банк добавит строку, уберёт валюту или просто вставит
 * неразрывный пробел в одну ячейку, окно съедет: курс безнала подставится
 * как наличный. Молча. А курсы отличаются на 9%.
 *
 * Поэтому проверяем строго: ровно 8 строк, и в каждой четвёрке — ровно те
 * четыре валюты, которые мы ждём, без повторов. Не сошлось — говорим «не
 * распарсили» и откатываемся на ЦБ. Честный курс ЦБ лучше выдуманного банковского.
 */
export function parseAiylHtml(html: string): { cash: Board; card: Board } {
  const rows: { code: Quoted; buy: number; sell: number }[] = [];

  ROW.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROW.exec(html)) !== null) {
    rows.push({ code: m[1] as Quoted, buy: parseFloat(m[2]), sell: parseFloat(m[3]) });
  }

  if (rows.length !== QUOTED.length * 2) {
    throw new Error(
      `Айыл Банк: ожидали ${QUOTED.length * 2} строк курсов, нашли ${rows.length}. ` +
        'Похоже, сайт переделали.'
    );
  }

  const toBoard = (slice: typeof rows, label: string): Board => {
    const b: Board = {};
    for (const r of slice) {
      if (!(r.buy > 0 && r.sell > 0)) {
        throw new Error(`Айыл Банк: нечитаемый курс ${r.code} (${label}).`);
      }
      if (b[r.code]) throw new Error(`Айыл Банк: ${r.code} встретился дважды (${label}).`);
      b[r.code] = { buy: r.buy, sell: r.sell };
    }
    // Все четыре валюты должны быть на месте — иначе окно строк съехало.
    const missing = QUOTED.filter((c) => !b[c]);
    if (missing.length) {
      throw new Error(`Айыл Банк: в блоке «${label}» нет ${missing.join(', ')}.`);
    }
    return b;
  };

  // Первые четыре строки — наличные, следующие четыре — безнал.
  return {
    cash: toBoard(rows.slice(0, 4), 'наличные'),
    card: toBoard(rows.slice(4, 8), 'безнал'),
  };
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
  // На эти два числа мы делим. Ноль превратил бы курс в бесконечность,
  // а бесконечность — в «Infinity ₽» на экране.
  if (!(baseQ.buy > 0) || !(baseQ.sell > 0)) {
    throw new Error(`Айыл Банк: нулевой курс ${base}`);
  }

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
  const res = await fetchWithTimeout(
    AIYL_URL,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ru' } },
    // Держим короткий таймаут: это сайт без гарантий, и если он «думает»,
    // нам важнее быстро откатиться на ЦБ, чем дождаться его ответа.
    8_000
  );
  if (!res.ok) throw new Error(`abank.kg ответил ${res.status}`);

  const html = await res.text();
  const { cash, card } = parseAiylHtml(html);
  const board = cashMode === 'cash' ? cash : card;

  if (!board.USD || !board.EUR) {
    throw new Error('Не удалось разобрать курсы на сайте банка — вёрстка изменилась.');
  }

  return boardToRates(board, base, cashMode);
}
