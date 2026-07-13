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

  setTaxProfile: (p: TaxProfile) => void;
  /** Убрать деньги в налоговую копилку (или вернуть, если сумма отрицательная). */
  setTaxAside: (delta: number) => void;
  /** Обнулить копилку — после того как налог реально уплачен. */
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

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      setTaxProfile: (p) => set({ taxProfile: p }),

      setTaxAside: (delta) =>
        set((s) => ({ taxSetAside: Math.max(0, s.taxSetAside + delta) })),

      resetTaxAside: () => set({ taxSetAside: 0 }),

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
      storage: createJSONStorage(() => AsyncStorage),
      // Не сохраняем служебные флаги
      partialize: ({ hydrated, ratesLoading, ...rest }) => rest,
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);
