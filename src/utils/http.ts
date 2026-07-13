/**
 * fetch с таймаутом.
 *
 * Обычный fetch ждёт ответа сколько угодно. На плохой сети (кафе, роуминг,
 * «капризный» Wi-Fi, который принял соединение и замолчал) это означает
 * вечный кружок загрузки без единого способа его прервать.
 *
 * Здесь запрос сам обрывается через заданное время и превращается в
 * нормальную ошибку, которую вызывающий код уже умеет показать человеку.
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Сервер не ответил за ${Math.round(ms / 1000)} с. Проверь интернет.`);
    this.name = 'TimeoutError';
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    // AbortError — это наш таймаут, а не «пользователь отменил».
    if (e?.name === 'AbortError') throw new TimeoutError(timeoutMs);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
