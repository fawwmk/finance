/**
 * Распознавание чеков по фотографии.
 *
 * Два движка:
 *  1. 'claude'   — Anthropic API, зрение. Сразу отдаёт структуру: позиции,
 *                  цены, валюту, магазин, дату. Понимает русский/английский/
 *                  итальянский и рукописные ценники. Нужен ключ с
 *                  console.anthropic.com. Это основной вариант.
 *  2. 'ocrspace' — бесплатный OCR (ocr.space). Отдаёт просто текст, позиции
 *                  вытаскиваем эвристикой ниже. Работает хуже, но бесплатно.
 *
 * Ключ хранится локально на телефоне (в настройках) и никуда, кроме самого
 * сервиса распознавания, не уходит.
 */

import { CurrencyCode, ReceiptItem, Settings } from '../types';

/** Что удалось вытащить из чека. */
export interface ParsedReceipt {
  merchant?: string;
  /** ISO YYYY-MM-DD */
  date?: string;
  currency?: CurrencyCode;
  total?: number;
  items: ReceiptItem[];
  /** Сырой текст — показываем, если разбор не удался. */
  rawText?: string;
}

export class OcrError extends Error {}

/* ─────────────────────────────  Точка входа  ───────────────────────────── */

export async function recognizeReceipt(
  base64Jpeg: string,
  settings: Settings
): Promise<ParsedReceipt> {
  const provider = settings.ocrProvider ?? (settings.claudeApiKey ? 'claude' : 'ocrspace');

  if (provider === 'claude') {
    if (!settings.claudeApiKey) {
      throw new OcrError(
        'Не задан ключ Anthropic API. Настройки → Распознавание чеков.'
      );
    }
    return recognizeWithClaude(base64Jpeg, settings.claudeApiKey);
  }

  if (!settings.ocrSpaceApiKey) {
    throw new OcrError('Не задан ключ OCR.space. Настройки → Распознавание чеков.');
  }
  const text = await ocrSpaceText(base64Jpeg, settings.ocrSpaceApiKey);
  return { ...parseReceiptText(text), rawText: text };
}

/* ────────────────────────────  Движок 1: Claude  ───────────────────────── */

const CLAUDE_PROMPT = `Это фотография кассового чека. Извлеки данные и верни СТРОГО один JSON-объект без markdown, без пояснений, без \`\`\`.

Схема:
{
  "merchant": string|null,      // название магазина
  "date": string|null,          // дата чека в формате YYYY-MM-DD
  "currency": "RUB"|"USD"|"EUR"|"GBP"|"KGS"|"KZT"|null,  // определи по символу (₽ $ € £ ₸) или коду валюты; сом — KGS, тенге — KZT
  "total": number|null,         // итоговая сумма чека
  "items": [                    // ВСЕ позиции чека, по одной на товар
    { "name": string, "price": number, "qty": number|null }  // price — итоговая цена за позицию
  ]
}

Правила:
- Чек может быть на русском, английском или итальянском — читай на любом.
- price — сумма за строку целиком (цена × количество), а не цена за штуку.
- Не включай в items скидки, итоги, НДС, сдачу, «ИТОГО», «TOTAL», «TOTALE».
- Если цифра нечитаема — пропусти позицию, не выдумывай.
- Верни только JSON.`;

async function recognizeWithClaude(base64: string, apiKey: string): Promise<ParsedReceipt> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // нужно, если приложение когда-нибудь запустится в вебе
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
            },
            { type: 'text', text: CLAUDE_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new OcrError('Неверный ключ Anthropic API.');
    if (res.status === 429) throw new OcrError('Слишком много запросов, попробуй через минуту.');
    throw new OcrError(`Anthropic API: ошибка ${res.status}. ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? '';
  const json = extractJson(text);
  if (!json) throw new OcrError('Не удалось разобрать ответ модели.');

  const items: ReceiptItem[] = Array.isArray(json.items)
    ? json.items
        .map((it: any) => ({
          name: String(it?.name ?? '').trim(),
          price: toNumber(it?.price),
          qty: it?.qty != null ? toNumber(it.qty) : undefined,
        }))
        .filter((it: ReceiptItem) => it.name && it.price > 0)
    : [];

  return {
    merchant: json.merchant ?? undefined,
    date: isoOrUndefined(json.date),
    currency: normalizeCurrency(json.currency),
    total: json.total != null ? toNumber(json.total) : undefined,
    items,
    rawText: text,
  };
}

/** Достаёт первый JSON-объект из ответа (на случай, если модель добавила текст). */
function extractJson(text: string): any | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/* ───────────────────────────  Движок 2: OCR.space  ──────────────────────── */

async function ocrSpaceText(base64: string, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('base64Image', `data:image/jpeg;base64,${base64}`);
  form.append('language', 'rus'); // движок 1 OCR.space; для лат. алфавита тоже читает цифры
  form.append('isOverlayRequired', 'false');
  form.append('scale', 'true');
  form.append('OCREngine', '2');

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: apiKey },
    body: form,
  });

  if (!res.ok) throw new OcrError(`OCR.space: ошибка ${res.status}`);
  const data = await res.json();
  if (data?.IsErroredOnProcessing) {
    throw new OcrError(String(data?.ErrorMessage?.[0] ?? 'OCR.space не смог обработать фото'));
  }
  const text = data?.ParsedResults?.[0]?.ParsedText;
  if (!text) throw new OcrError('Текст на фото не найден. Попробуй снять чек ровнее и ярче.');
  return text;
}

/* ────────────────────  Разбор сырого текста чека (эвристика)  ───────────── */

/** Слова, после которых идёт итог — и которые не являются товаром. */
const TOTAL_WORDS = /(итог|итого|к оплате|всего|сумма|total|totale|importo|summe)/i;
const SKIP_WORDS =
  /(ндс|скидк|sconto|discount|iva|vat|сдача|наличн|карт|card|contante|кассир|смена|чек|инн|тел|адрес|www|http|спасибо|grazie|thank)/i;

/** Ловит цену в конце строки: 1 234,56 / 1234.56 / 99,00 ₽ */
const PRICE_AT_END = /(-?\d[\d\s.,]*\d|\d)\s*(?:₽|руб|р\.|rub|\$|usd|€|eur|£|gbp)?\s*$/i;

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const currency = detectCurrency(text);
  let total: number | undefined;
  const items: ReceiptItem[] = [];

  for (const line of lines) {
    const m = line.match(PRICE_AT_END);
    if (!m) continue;

    const price = toNumber(m[1]);
    if (!price || price <= 0) continue;

    const name = line.slice(0, m.index).replace(/[.…_\-\s]+$/, '').trim();

    // Строка с итогом — забираем сумму, но товаром не считаем.
    if (TOTAL_WORDS.test(name)) {
      // берём самый большой из найденных «итогов» — обычно это ИТОГО, а не «сумма НДС»
      if (total == null || price > total) total = price;
      continue;
    }

    if (!name || name.length < 2) continue;
    if (SKIP_WORDS.test(name)) continue;
    // строки вида "2 x 55.00" — количество, не название
    if (/^[\d\s.,x×*]+$/i.test(name)) continue;

    items.push({ name, price, qty: extractQty(line) });
  }

  return { currency, total, items, date: detectDate(text) };
}

function extractQty(line: string): number | undefined {
  const m = line.match(/(\d+(?:[.,]\d+)?)\s*(?:x|×|\*|шт)/i);
  if (!m) return undefined;
  const q = toNumber(m[1]);
  return q > 0 && q < 1000 ? q : undefined;
}

function detectCurrency(text: string): CurrencyCode | undefined {
  if (/сом|kgs|сом\b/i.test(text)) return 'KGS';
  if (/₸|тенге|kzt/i.test(text)) return 'KZT';
  if (/[₽]|руб|rub/i.test(text)) return 'RUB';
  if (/€|eur\b|euro/i.test(text)) return 'EUR';
  if (/\$|usd\b/i.test(text)) return 'USD';
  if (/£|gbp\b/i.test(text)) return 'GBP';
  return undefined;
}

/** Ищет дату в форматах 06.07.2026 / 06/07/26 / 2026-07-06. */
function detectDate(text: string): string | undefined {
  const iso = text.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = text.match(/(\d{2})[./](\d{2})[./](\d{2,4})/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const mo = Number(m);
    const day = Number(d);
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return `${y}-${m}-${d}`;
  }
  return undefined;
}

/* ────────────────────────────  Утилиты  ─────────────────────────────────── */

/** "1 234,56" | "1,234.56" | 99 -> число. */
export function toNumber(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;

  let s = v.replace(/[^\d.,-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // разделитель дробной части — тот, что правее
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    s = s.split(thousandSep).join('');
    s = s.replace(decimalSep, '.');
  } else if (lastComma > -1) {
    // "1,50" — дробь; "1,500" — вероятнее тысячи
    s = s.length - lastComma - 1 === 3 ? s.split(',').join('') : s.replace(',', '.');
  }

  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function isoOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

const KNOWN_CURRENCIES: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'GBP', 'KGS', 'KZT'];

function normalizeCurrency(v: unknown): CurrencyCode | undefined {
  const s = String(v ?? '').toUpperCase();
  return KNOWN_CURRENCIES.includes(s as CurrencyCode) ? (s as CurrencyCode) : undefined;
}

/* ──────────────  Автоматическая категория для позиции чека  ─────────────── */

const CATEGORY_RULES: { id: string; re: RegExp }[] = [
  {
    id: 'fuel',
    re: /(аи-?9[025]|аи-?10|бензин|дизел|дт\b|топлив|азс|лукойл|роснефт|газпромнефт|shell|benzina|gasolio|fuel|petrol|diesel)/i,
  },
  {
    id: 'cafe',
    re: /(кофе|латте|капучин|americano|espresso|caffe|ресторан|кафе|бар\b|пицц|бургер|шаурм|суши|ristorante|coffee|pizza|burger)/i,
  },
  {
    id: 'health',
    re: /(аптек|таблет|лекарств|витамин|farmacia|pharmacy|аспирин|бинт|маск)/i,
  },
  {
    id: 'transport',
    re: /(метро|автобус|такси|такс|проезд|biglietto|ticket|uber|парковк|parking)/i,
  },
  {
    id: 'home',
    re: /(мыло|порошок|шампун|туалетн|салфет|чист|моющ|губк|detersivo|мешк для мусора)/i,
  },
  {
    id: 'groceries',
    re: /(хлеб|молок|сыр|мясо|курин|яйц|яблок|банан|овощ|фрукт|сахар|соль|мука|масло|йогурт|кефир|колбас|рыб|макарон|рис\b|греч|чай\b|вода|сок\b|pane|latte|formaggio|carne|uova|pasta|bread|milk|cheese|meat|eggs|water)/i,
  },
];

/** Угадывает категорию по названию товара. По умолчанию — «Продукты». */
export function guessCategory(name: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(name)) return rule.id;
  }
  return 'groceries';
}
