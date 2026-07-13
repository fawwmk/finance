/**
 * Банки для быстрого выбора при добавлении кредита.
 *
 * ВАЖНО: ставку всегда берём из ТВОЕГО кредитного договора — она у каждого
 * клиента своя (зависит от страховки, зарплатного проекта, срока, скоринга).
 * `typicalRate` — это лишь ориентир, который подставляется в поле по умолчанию,
 * его нужно поправить на цифру из договора.
 *
 * Сама математика платежа у всех банков одинаковая (см. src/utils/loan.ts):
 * аннуитет по формуле ЦБ. Банк не может считать «по-своему».
 */

export interface Bank {
  id: string;
  name: string;
  /** Фирменный цвет — для кружка в списке. */
  color: string;
  /** Буквы для аватара. */
  short: string;
  /** Ориентировочная ставка по потребкредиту, % годовых. Правится вручную. */
  typicalRate: number;
  /**
   * Типичный беспроцентный период по кредитке банка, дней.
   * ⚠️ У каждой карты он свой и постоянно меняется в рекламных акциях —
   * это только значение по умолчанию, обязательно сверь со своей картой.
   */
  typicalGraceDays: number;
  /** Ориентировочная ставка по кредитке — она обычно выше, чем по кредиту. */
  typicalCardRate: number;
}

export const BANKS: Bank[] = [
  { id: 'tbank', name: 'Т-Банк', color: '#FFDD2D', short: 'Т', typicalRate: 24, typicalGraceDays: 55, typicalCardRate: 30 },
  { id: 'sber', name: 'Сбербанк', color: '#21A038', short: 'С', typicalRate: 22, typicalGraceDays: 120, typicalCardRate: 28 },
  { id: 'alfa', name: 'Альфа-Банк', color: '#EF3124', short: 'А', typicalRate: 23, typicalGraceDays: 60, typicalCardRate: 30 },
  { id: 'vtb', name: 'ВТБ', color: '#0A2896', short: 'В', typicalRate: 22, typicalGraceDays: 110, typicalCardRate: 29 },
  { id: 'gazprom', name: 'Газпромбанк', color: '#2E5BFF', short: 'Г', typicalRate: 21, typicalGraceDays: 180, typicalCardRate: 28 },
  { id: 'raif', name: 'Райффайзен', color: '#FEE600', short: 'Р', typicalRate: 20, typicalGraceDays: 55, typicalCardRate: 29 },
  { id: 'ozon', name: 'Озон Банк', color: '#005BFF', short: 'О', typicalRate: 25, typicalGraceDays: 120, typicalCardRate: 32 },
  { id: 'yandex', name: 'Яндекс Пэй', color: '#FC3F1D', short: 'Я', typicalRate: 25, typicalGraceDays: 120, typicalCardRate: 32 },
  { id: 'sovcom', name: 'Совкомбанк', color: '#1B3A6B', short: 'СК', typicalRate: 25, typicalGraceDays: 120, typicalCardRate: 30 },
  { id: 'other', name: 'Другой банк', color: '#6D8BFF', short: '?', typicalRate: 20, typicalGraceDays: 55, typicalCardRate: 30 },
];

/** Частые варианты грейс-периода — для быстрого выбора. */
export const GRACE_PRESETS = [55, 60, 100, 120, 180, 365];

export function bankById(id: string): Bank {
  return BANKS.find((b) => b.id === id) ?? BANKS[BANKS.length - 1];
}
