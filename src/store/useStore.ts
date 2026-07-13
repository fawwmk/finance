import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Category,
  Exchange,
  ExchangeRates,
  Loan,
  Receipt,
  RecurringItem,
  SavingsGoal,
  Settings,
  TaxProfile,
  Transaction,
} from '../types';
import { DEFAULT_CATEGORIES } from '../data/categories';
import { fetchRates, isStale } from '../services/rates';
import { loadApiKeys, saveApiKeys } from '../services/secrets';
import { rollForward } from '../utils/recurrence';

/** Простой генератор id (достаточно для локального хранения). */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

interface AppState {
  transactions: Transaction[];
  categories: Category[];
  recurring: RecurringItem[];
  goals: SavingsGoal[];
  loans: Loan[];
  receipts: Receipt[];
  /** Реальные обмены валюты — по ним считается фактический курс. */
  exchanges: Exchange[];
  rates: ExchangeRates | null;
  ratesLoading: boolean;
  settings: Settings;
  /** Налоговый профиль. null — пользователь ещё не настраивал налоги. */
  taxProfile: TaxProfile | null;
  /** Налоговая копилка: сколько уже отложено на налоги и взносы. */
  taxSetAside: number;
  /**
   * Сколько уже УПЛАЧЕНО в бюджет с начала года (авансы, взносы).
   *
   * Отдельно от копилки, и это принципиально. Раньше кнопка «Уплачено» просто
   * обнуляла копилку — и приложение начинало заново требовать отложить налог
   * с дохода, который уже оплачен. Теперь деньги переезжают из копилки сюда,
   * и расчёт «сколько ещё должен» это видит.
   */
  taxPaid: number;
  /** Год, за который ведётся счёт. Сменился — оба счётчика обнуляются. */
  taxYear: number;
  /** Флаг завершения загрузки из хранилища. */
  hydrated: boolean;

  addTransaction: (t: Omit<Transaction, 'id' | 'createdAt'>) => void;
  /** Массовое добавление — используется при разборе чека. */
  addTransactions: (list: Omit<Transaction, 'id' | 'createdAt'>[]) => void;
  deleteTransaction: (id: string) => void;

  addRecurring: (r: Omit<RecurringItem, 'id'>) => void;
  updateRecurring: (id: string, patch: Partial<RecurringItem>) => void;
  deleteRecurring: (id: string) => void;
  /** Перематывает просроченные регулярные события на ближайшую будущую дату. */
  rollDueRecurring: () => void;

  addGoal: (g: Omit<SavingsGoal, 'id' | 'createdAt' | 'saved'>) => void;
  updateGoal: (id: string, patch: Partial<SavingsGoal>) => void;
  deleteGoal: (id: string) => void;

  addLoan: (l: Omit<Loan, 'id' | 'createdAt'>) => string;
  updateLoan: (id: string, patch: Partial<Loan>) => void;
  deleteLoan: (id: string) => void;

  addReceipt: (r: Omit<Receipt, 'id' | 'createdAt'>) => string;
  deleteReceipt: (id: string) => void;

  addExchange: (e: Omit<Exchange, 'id' | 'createdAt' | 'rate'>) => void;
  deleteExchange: (id: string) => void;

  addCategory: (c: Omit<Category, 'id'>) => void;

  setSettings: (patch: Partial<Settings>) => void;
  /** Поднять ключи API из Keychain. Вызывается один раз при старте. */
  loadSecrets: () => Promise<void>;

  setTaxProfile: (p: TaxProfile) => void;
  /** Убрать деньги в налоговую копилку (или вернуть, если сумма отрицательная). */
  setTaxAside: (delta: number) => void;
  /**
   * Налог уплачен в бюджет: деньги уходят из копилки и записываются
   * в «уплачено за год». Копилка при этом НЕ обнуляется целиком —
   * если платил только аванс, остальное остаётся лежать.
   */
  payTax: (amount: number) => void;
  /** Полный сброс налоговых счётчиков (новый год или начать заново). */
  resetTaxAside: () => void;

  /** Подтягивает курсы ЦБ РФ. force — игнорировать кэш. */
  refreshRates: (force?: boolean) => Promise<void>;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      transactions: [],
      categories: DEFAULT_CATEGORIES,
      recurring: [],
      goals: [],
      loans: [],
      receipts: [],
      exchanges: [],
      rates: null,
      ratesLoading: false,
      taxProfile: null,
      taxSetAside: 0,
      taxPaid: 0,
      taxYear: new Date().getFullYear(),
      settings: {
        baseCurrency: 'RUB',
        rateSource: 'cbr',
        cashMode: 'card',
        ocrLanguages: ['ru', 'en', 'it'],
        ocrProvider: 'claude',
        notificationsEnabled: true,
      },
      hydrated: false,

      addTransaction: (t) =>
        set((s) => ({
          transactions: [
            { ...t, id: uid(), createdAt: Date.now() },
            ...s.transactions,
          ],
        })),

      addTransactions: (list) =>
        set((s) => ({
          transactions: [
            ...list.map((t) => ({ ...t, id: uid(), createdAt: Date.now() })),
            ...s.transactions,
          ],
        })),

      deleteTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((x) => x.id !== id) })),

      addRecurring: (r) =>
        set((s) => ({ recurring: [{ ...r, id: uid() }, ...s.recurring] })),

      updateRecurring: (id, patch) =>
        set((s) => ({
          recurring: s.recurring.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),

      deleteRecurring: (id) =>
        set((s) => ({ recurring: s.recurring.filter((x) => x.id !== id) })),

      rollDueRecurring: () =>
        set((s) => {
          let changed = false;
          const recurring = s.recurring.map((item) => {
            const next = rollForward(item);
            if (!next) return item;
            changed = true;
            return { ...item, nextDate: next };
          });
          // не трогаем состояние, если ничего не сдвинулось — иначе лишний ререндер
          return changed ? { recurring } : {};
        }),

      addGoal: (g) =>
        set((s) => ({
          goals: [{ ...g, id: uid(), saved: 0, createdAt: Date.now() }, ...s.goals],
        })),

      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),

      deleteGoal: (id) => set((s) => ({ goals: s.goals.filter((x) => x.id !== id) })),

      addLoan: (l) => {
        const id = uid();
        set((s) => ({ loans: [{ ...l, id, createdAt: Date.now() }, ...s.loans] }));
        return id;
      },

      updateLoan: (id, patch) =>
        set((s) => ({
          loans: s.loans.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),

      deleteLoan: (id) =>
        set((s) => ({
          loans: s.loans.filter((x) => x.id !== id),
          // заодно убираем связанный ежемесячный платёж из «Планов»
          recurring: s.recurring.filter((r) => r.loanId !== id),
        })),

      addReceipt: (r) => {
        const id = uid();
        set((s) => ({ receipts: [{ ...r, id, createdAt: Date.now() }, ...s.receipts] }));
        return id;
      },

      deleteReceipt: (id) =>
        set((s) => ({ receipts: s.receipts.filter((x) => x.id !== id) })),

      addExchange: (e) =>
        set((s) => ({
          exchanges: [
            {
              ...e,
              id: uid(),
              // Фактический курс: сколько отдал за одну единицу полученной валюты.
              rate: e.toAmount > 0 ? e.fromAmount / e.toAmount : 0,
              createdAt: Date.now(),
            },
            ...s.exchanges,
          ],
        })),

      deleteExchange: (id) =>
        set((s) => ({ exchanges: s.exchanges.filter((x) => x.id !== id) })),

      addCategory: (c) =>
        set((s) => ({ categories: [...s.categories, { ...c, id: uid() }] })),

      setSettings: (patch) => {
        // Ключи API уводим в Keychain, а не в обычное хранилище.
        if ('claudeApiKey' in patch || 'ocrSpaceApiKey' in patch) {
          saveApiKeys({
            ...('claudeApiKey' in patch ? { claudeApiKey: patch.claudeApiKey } : {}),
            ...('ocrSpaceApiKey' in patch ? { ocrSpaceApiKey: patch.ocrSpaceApiKey } : {}),
          });
        }
        set((s) => ({ settings: { ...s.settings, ...patch } }));
      },

      /** Поднимает ключи из Keychain в память при старте приложения. */
      loadSecrets: async () => {
        const keys = await loadApiKeys();
        set((s) => ({ settings: { ...s.settings, ...keys } }));
      },

      setTaxProfile: (p) => set({ taxProfile: p }),

      // NaN здесь смертелен: он сохранится в память телефона как null и
      // копилка сломается навсегда. Мусор просто не пускаем внутрь.
      setTaxAside: (delta) =>
        set((s) => {
          if (!isFinite(delta)) return {};
          const base = isFinite(s.taxSetAside) ? s.taxSetAside : 0;
          return { taxSetAside: Math.max(0, base + delta) };
        }),

      payTax: (amount) =>
        set((s) => {
          if (!isFinite(amount) || amount <= 0) return {};
          const aside = isFinite(s.taxSetAside) ? s.taxSetAside : 0;
          const paid = isFinite(s.taxPaid) ? s.taxPaid : 0;
          return {
            // Заплатить можно и больше, чем лежало в копилке (доложил из своих) —
            // копилка просто уходит в ноль, а не в минус.
            taxSetAside: Math.max(0, aside - amount),
            taxPaid: paid + amount,
            taxYear: new Date().getFullYear(),
          };
        }),

      resetTaxAside: () =>
        set({ taxSetAside: 0, taxPaid: 0, taxYear: new Date().getFullYear() }),

      refreshRates: async (force = false) => {
        const { rates, settings, ratesLoading } = get();
        if (ratesLoading) return;

        const source = settings.rateSource ?? 'cbr';
        const cashMode = settings.cashMode ?? 'card';
        if (!force && !isStale(rates, settings.baseCurrency, source, cashMode)) return;

        set({ ratesLoading: true });
        try {
          const fresh = await fetchRates(settings.baseCurrency, source, cashMode);
          set({ rates: fresh });
        } catch {
          // Нет сети — молча оставляем последние сохранённые курсы.
        } finally {
          set({ ratesLoading: false });
        }
      },
    }),
    {
      name: 'finance-store-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      /**
       * Что НЕ уезжает на диск.
       *
       * hydrated/ratesLoading — служебные флаги, им там не место.
       *
       * Ключи API — принципиально: AsyncStorage не шифруется и попадает
       * в резервные копии. Ключи живут в Keychain (см. services/secrets.ts),
       * а здесь их нужно явно вырезать, иначе они утекут на диск вторым путём.
       */
      partialize: ({ hydrated, ratesLoading, settings, ...rest }) => {
        const { claudeApiKey, ocrSpaceApiKey, ...safeSettings } = settings;
        return { ...rest, settings: safeSettings as Settings };
      },

      /**
       * Слияние сохранённого состояния с текущим.
       *
       * По умолчанию zustand делает поверхностное слияние, и вложенные объекты
       * заменяются целиком. Значит, у человека со старой версией приложения
       * `settings` перезатирался целиком, и новые настройки становились
       * undefined. Поэтому settings сливаем отдельно, полем к полю.
       */
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;

        // Налоги считаются за календарный год. Наступил новый — счётчики
        // «отложено» и «уплачено» начинаются с нуля, иначе в январе приложение
        // решит, что за новый год уже всё уплачено, и не попросит откладывать.
        const thisYear = new Date().getFullYear();
        const sameYear = p.taxYear === thisYear;

        return {
          ...current,
          ...p,
          taxYear: thisYear,
          taxSetAside: sameYear ? (p.taxSetAside ?? 0) : 0,
          taxPaid: sameYear ? (p.taxPaid ?? 0) : 0,
          settings: { ...current.settings, ...(p.settings ?? {}) },
          // Категории могли пополниться в новой версии — старый список не должен
          // затирать новые категории, иначе у операций пропадут иконки.
          categories: mergeCategories(p.categories),
        };
      },

      /**
       * Вызывается и при успехе, и при ошибке чтения хранилища.
       *
       * Раньше здесь стояло `if (state) state.hydrated = true`, и было две беды:
       *   1. Битое хранилище → state приходит undefined → флаг не ставился
       *      НИКОГДА → приложение навсегда зависало на кружке загрузки.
       *   2. Прямая мутация не уведомляет подписчиков — экран мог не
       *      перерисоваться и без всякой ошибки.
       *
       * Теперь: помечаем «загрузились» в любом случае и через setState, чтобы
       * подписчики узнали. Битое хранилище означает старт с чистого листа —
       * это плохо, но несравнимо лучше вечного кружка.
       */
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    }
  )
);

/**
 * Старый сохранённый список категорий + новые из свежей версии приложения.
 * Пользовательские правки (переименовал, поменял цвет) сохраняем.
 */
function mergeCategories(saved?: Category[]): Category[] {
  if (!saved?.length) return DEFAULT_CATEGORIES;
  const byId = new Map(saved.map((c) => [c.id, c]));
  const merged = DEFAULT_CATEGORIES.map((d) => byId.get(d.id) ?? d);
  // Категории, которых нет среди стандартных — созданные пользователем.
  const custom = saved.filter((c) => !DEFAULT_CATEGORIES.some((d) => d.id === c.id));
  return [...merged, ...custom];
}
