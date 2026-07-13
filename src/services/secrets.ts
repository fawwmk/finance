/**
 * Ключи API — в Keychain, а не в обычной памяти приложения.
 *
 * Почему это важно. Всё остальное приложение хранит данные через AsyncStorage —
 * это обычный незашифрованный файл внутри песочницы приложения. Для операций и
 * кредитов это нормально. Но ключ Anthropic — это доступ к платному счёту:
 * попадёт в чужие руки — его используют за твой счёт.
 *
 * AsyncStorage попадает в резервные копии iTunes/iCloud, и если копия не
 * зашифрована — ключ лежит в ней открытым текстом. Keychain (SecureStore) так
 * не утекает: он шифруется, привязан к устройству и не выгружается в бэкап
 * в читаемом виде.
 *
 * Поэтому ключи живут ЗДЕСЬ, а в общем состоянии приложения они существуют
 * только в оперативной памяти и намеренно вырезаются перед сохранением на диск
 * (см. partialize в useStore).
 */

import * as SecureStore from 'expo-secure-store';

const CLAUDE_KEY = 'claude_api_key';
const OCRSPACE_KEY = 'ocrspace_api_key';

export interface ApiKeys {
  claudeApiKey?: string;
  ocrSpaceApiKey?: string;
}

/** SecureStore недоступен в вебе — там молча работаем без ключей. */
async function get(name: string): Promise<string | undefined> {
  try {
    const v = await SecureStore.getItemAsync(name);
    return v ?? undefined;
  } catch {
    return undefined;
  }
}

async function set(name: string, value?: string): Promise<void> {
  try {
    if (value) await SecureStore.setItemAsync(name, value);
    else await SecureStore.deleteItemAsync(name);
  } catch {
    // Не смогли сохранить — не повод ронять приложение.
  }
}

/** Достаёт ключи при старте. */
export async function loadApiKeys(): Promise<ApiKeys> {
  const [claudeApiKey, ocrSpaceApiKey] = await Promise.all([get(CLAUDE_KEY), get(OCRSPACE_KEY)]);
  return { claudeApiKey, ocrSpaceApiKey };
}

/** Сохраняет только те ключи, что реально пришли в патче. */
export async function saveApiKeys(patch: ApiKeys): Promise<void> {
  const jobs: Promise<void>[] = [];
  if ('claudeApiKey' in patch) jobs.push(set(CLAUDE_KEY, patch.claudeApiKey));
  if ('ocrSpaceApiKey' in patch) jobs.push(set(OCRSPACE_KEY, patch.ocrSpaceApiKey));
  await Promise.all(jobs);
}
