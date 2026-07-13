/**
 * Локальные напоминания.
 *
 * Всё считается и планируется прямо на телефоне — сервер не нужен, интернет
 * тоже. iOS сам разбудит приложение в нужный момент.
 *
 * Что напоминаем:
 *   💰 «Завтра зарплата — 120 000 ₽»
 *   💳 «Через 2 дня платёж по кредиту Т-Банк — 26 494 ₽»
 *   🔔 «Сегодня списание Netflix — 799 ₽»
 *
 * iOS держит в очереди максимум 64 отложенных уведомления, поэтому planируем
 * несколько ближайших повторов каждого события, но не больше MAX_SCHEDULED.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { CurrencyCode, RecurringItem, Settings } from '../types';
import { occurrences } from '../utils/recurrence';
import { formatMoney, daysUntil } from '../utils/format';

/** Сколько будущих повторов планируем для каждого события. */
const REPEATS_PER_ITEM = 4;

/** Жёсткий предел iOS — оставляем запас. */
const MAX_SCHEDULED = 60;

/** Во сколько присылать напоминание (по местному времени). */
const REMIND_HOUR = 10;

/** Как показывать уведомление, если приложение открыто. */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Спрашивает разрешение (один раз) и возвращает, дали его или нет. */
export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Напоминания',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;

  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/* ──────────────────────────  Тексты уведомлений  ────────────────────────── */

function title(item: RecurringItem): string {
  if (item.kind === 'income') return '💰 Поступление';
  if (item.isCredit) return '💳 Платёж по кредиту';
  return '🔔 Списание';
}

/** «Завтра», «Через 2 дня», «Сегодня» — от даты напоминания до даты события. */
function whenWord(daysBefore: number): string {
  if (daysBefore <= 0) return 'Сегодня';
  if (daysBefore === 1) return 'Завтра';
  if (daysBefore >= 2 && daysBefore <= 4) return `Через ${daysBefore} дня`;
  return `Через ${daysBefore} дней`;
}

function body(item: RecurringItem, daysBefore: number, base: CurrencyCode): string {
  const money = formatMoney(item.amount, item.currency ?? base);
  const when = whenWord(daysBefore);

  if (item.kind === 'income') return `${when} придёт «${item.name}» — ${money}`;
  return `${when} нужно заплатить «${item.name}» — ${money}`;
}

/* ────────────────────────────  Планирование  ───────────────────────────── */

/** Момент, когда показать уведомление: за N дней до события, в 10:00. */
function fireDate(eventIso: string, daysBefore: number): Date {
  const d = new Date(eventIso + 'T00:00:00');
  d.setDate(d.getDate() - daysBefore);
  d.setHours(REMIND_HOUR, 0, 0, 0);
  return d;
}

/**
 * Пересобирает всю очередь напоминаний под текущие планы.
 * Вызывается при каждом изменении «Планов» — проще и надёжнее, чем
 * пытаться точечно править очередь.
 *
 * @returns сколько уведомлений поставлено в очередь
 */
export async function syncReminders(
  recurring: RecurringItem[],
  settings: Settings
): Promise<number> {
  // Полная пересборка: сначала чистим старую очередь.
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (settings.notificationsEnabled === false) return 0;

  const granted = await ensurePermission();
  if (!granted) return 0;

  const now = Date.now();

  // Собираем все будущие напоминания и сортируем — ближайшие важнее,
  // если упрёмся в лимит iOS.
  const planned: { date: Date; item: RecurringItem; daysBefore: number }[] = [];

  for (const item of recurring) {
    if (!item.active) continue;
    if (item.remindDaysBefore == null) continue;

    for (const eventIso of occurrences(item, REPEATS_PER_ITEM)) {
      const date = fireDate(eventIso, item.remindDaysBefore);
      if (date.getTime() <= now) continue; // момент уже прошёл
      planned.push({ date, item, daysBefore: item.remindDaysBefore });
    }
  }

  planned.sort((a, b) => a.date.getTime() - b.date.getTime());

  const queue = planned.slice(0, MAX_SCHEDULED);

  await Promise.all(
    queue.map(({ date, item, daysBefore }) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: title(item),
          body: body(item, daysBefore, settings.baseCurrency),
          data: { recurringId: item.id, loanId: item.loanId },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      })
    )
  );

  return queue.length;
}

/** Сколько напоминаний сейчас стоит в очереди (для экрана настроек). */
export async function scheduledCount(): Promise<number> {
  const list = await Notifications.getAllScheduledNotificationsAsync();
  return list.length;
}

/** Тестовое уведомление через 5 секунд — проверить, что всё работает. */
export async function sendTestNotification(): Promise<boolean> {
  const granted = await ensurePermission();
  if (!granted) return false;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 Проверка связи',
      body: 'Напоминания работают — так они и будут приходить.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
    },
  });
  return true;
}

/** Отменить все напоминания (когда выключают тумблер). */
export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Ближайшее событие, о котором напомним — для подписи в настройках. */
export function nextReminderLabel(recurring: RecurringItem[]): string | null {
  const upcoming = recurring
    .filter((r) => r.active && r.remindDaysBefore != null)
    .map((r) => ({ r, d: daysUntil(r.nextDate) - (r.remindDaysBefore ?? 0) }))
    .filter(({ d }) => d >= 0)
    .sort((a, b) => a.d - b.d)[0];

  if (!upcoming) return null;
  const { r, d } = upcoming;
  return `${r.name} — напомню ${d === 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} дн.`}`;
}
