import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Txt, Button, Touchable } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';
import { palette, spacing, radius, font } from '../theme/theme';
import { useStore } from '../store/useStore';
import { CurrencyCode, PayerType, TxKind } from '../types';
import {
  todayISO,
  toISODate,
  relativeDay,
  formatMoney,
  CURRENCY_SYMBOL,
  ALL_CURRENCIES,
} from '../utils/format';
import { convertToBase } from '../store/selectors';
import { reserveForIncome } from '../utils/tax';
import { taxYearIncome, taxYearExpenses, npdBonusUsed } from '../store/selectors';

export function AddTransactionScreen({ navigation }: any) {
  const {
    categories,
    addTransaction,
    settings,
    transactions,
    taxProfile,
    taxSetAside,
    setTaxAside,
    rates,
  } = useStore();

  const [kind, setKind] = useState<TxKind>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(settings.baseCurrency);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());

  // Налоговое
  const [taxable, setTaxable] = useState(false);
  const [payerType, setPayerType] = useState<PayerType>('company');
  const [deductible, setDeductible] = useState(false);
  const [reserveNow, setReserveNow] = useState(true);

  const base = settings.baseCurrency;
  const cats = categories.filter((c) => c.kind === kind);
  const numeric = parseFloat(amount.replace(',', '.')) || 0;
  const canSave = numeric > 0 && categoryId;

  /** Показываем налоговый блок, только если человек настроил налоги и это не найм. */
  const taxRelevant = !!taxProfile && taxProfile.status !== 'employee';

  const ytdIncome = useMemo(
    () => taxYearIncome(transactions, base, rates),
    [transactions, base, rates]
  );
  const ytdExpenses = useMemo(
    () => taxYearExpenses(transactions, base, rates),
    [transactions, base, rates]
  );
  const bonusUsed = useMemo(() => npdBonusUsed(transactions), [transactions]);

  /** Сумма в базовой валюте — налоги считаются только в ней. */
  const inBase = useMemo(
    () => convertToBase(numeric, currency, base, rates),
    [numeric, currency, base, rates]
  );

  /** Сколько отложить с этого поступления — считаем на лету, пока вводишь сумму. */
  const reserve = useMemo(() => {
    if (!taxProfile || kind !== 'income' || !taxable || inBase <= 0) return null;
    return reserveForIncome(
      inBase,
      payerType,
      { ...taxProfile, npdBonusUsed: bonusUsed },
      ytdIncome,
      ytdExpenses,
      taxSetAside
    );
  }, [taxProfile, kind, taxable, inBase, payerType, bonusUsed, ytdIncome, ytdExpenses, taxSetAside]);

  const shiftDay = (delta: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    if (toISODate(d) <= todayISO()) setDate(toISODate(d));
  };

  const save = () => {
    if (!canSave) return;

    addTransaction({
      kind,
      amount: numeric,
      currency,
      categoryId: categoryId!,
      date,
      note: note.trim() || undefined,
      source: 'manual',
      taxable: kind === 'income' && taxable ? true : undefined,
      payerType: kind === 'income' && taxable ? payerType : undefined,
      taxDeductible: kind === 'expense' && deductible ? true : undefined,
    });

    // Сразу убираем налог в копилку, чтобы деньги не «растворились».
    if (reserve && reserve.amount > 0 && reserveNow) {
      setTaxAside(reserve.amount);
    }

    navigation.goBack();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      {/* Заголовок с закрытием */}
      <View style={styles.header}>
        <Touchable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={28} color={palette.textMuted} />
        </Touchable>
        <Txt variant="subtitle" weight="semibold">
          Новая операция
        </Txt>
        <View style={{ width: 28 }} />
      </View>

      {/* Переключатель доход/расход */}
      <View style={styles.segment}>
        {(['expense', 'income'] as TxKind[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              setKind(k);
              setCategoryId(null);
            }}
            style={[styles.segmentBtn, kind === k && styles.segmentActive]}
          >
            <Txt
              variant="body"
              weight="semibold"
              color={kind === k ? palette.white : palette.textMuted}
            >
              {k === 'expense' ? 'Расход' : 'Доход'}
            </Txt>
          </Pressable>
        ))}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Ввод суммы */}
          <View style={styles.amountWrap}>
            <TextInput
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ''))}
              placeholder="0"
              placeholderTextColor={palette.textFaint}
              keyboardType="decimal-pad"
              style={[
                styles.amountInput,
                { color: kind === 'income' ? palette.income : palette.text },
              ]}
              autoFocus
            />
            <Txt variant="display" weight="bold" color={palette.textMuted}>
              {CURRENCY_SYMBOL[currency]}
            </Txt>
          </View>

          {/* Валюта операции */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: 2 }}
            style={{ marginBottom: spacing.lg }}
          >
            {ALL_CURRENCIES.map((c) => {
              const active = currency === c;
              return (
                <Touchable
                  key={c}
                  onPress={() => setCurrency(c)}
                  style={[
                    styles.curChip,
                    active && { backgroundColor: palette.accentSoft, borderColor: palette.accent },
                  ]}
                >
                  <Txt
                    variant="caption"
                    weight="semibold"
                    color={active ? palette.accent : palette.textMuted}
                  >
                    {CURRENCY_SYMBOL[c]} {c}
                  </Txt>
                </Touchable>
              );
            })}
          </ScrollView>

          {/* Пересчёт в базовую валюту — видно сразу, не отходя от ввода */}
          {currency !== base && numeric > 0 && (
            <Txt
              variant="caption"
              color={palette.textMuted}
              style={{ textAlign: 'center', marginTop: -spacing.md, marginBottom: spacing.lg }}
            >
              ≈ {formatMoney(inBase, base)} по курсу{' '}
              {rates?.source === 'aiyl' ? 'Айыл Банка' : 'ЦБ РФ'}
            </Txt>
          )}

          {/* Дата */}
          <View style={styles.dateRow}>
            <Touchable onPress={() => shiftDay(-1)} style={styles.dateArrow} hitSlop={10}>
              <Ionicons name="chevron-back" size={20} color={palette.textMuted} />
            </Touchable>
            <View style={styles.datePill}>
              <Ionicons name="calendar-outline" size={16} color={palette.textMuted} />
              <Txt variant="body" weight="medium" style={{ marginLeft: 6 }}>
                {relativeDay(date)}
              </Txt>
            </View>
            <Touchable
              onPress={() => shiftDay(1)}
              style={[styles.dateArrow, date >= todayISO() && { opacity: 0.3 }]}
              hitSlop={10}
            >
              <Ionicons name="chevron-forward" size={20} color={palette.textMuted} />
            </Touchable>
          </View>

          {/* Категории */}
          <Txt variant="caption" color={palette.textMuted} style={{ marginBottom: spacing.md }}>
            Категория
          </Txt>
          <View style={styles.catGrid}>
            {cats.map((c) => {
              const active = categoryId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  style={[styles.catItem, active && { borderColor: c.color }]}
                >
                  <CategoryIcon icon={c.icon} color={c.color} size={46} />
                  <Txt
                    variant="caption"
                    color={active ? palette.text : palette.textMuted}
                    numberOfLines={1}
                    style={{ marginTop: 6, textAlign: 'center' }}
                  >
                    {c.name}
                  </Txt>
                </Pressable>
              );
            })}
          </View>

          {/* Заметка */}
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Заметка (необязательно)"
            placeholderTextColor={palette.textFaint}
            style={styles.note}
          />

          {/* ─── НАЛОГИ ─── */}
          {taxRelevant && kind === 'income' && (
            <>
              <Card style={[styles.between, { marginTop: spacing.lg }]}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Txt variant="body" weight="semibold">
                    {taxProfile?.status === 'unofficial'
                      ? 'Неофициальный доход'
                      : 'Доход от бизнеса'}
                  </Txt>
                  <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                    {taxProfile?.status === 'unofficial'
                      ? 'Налог с него никто не удержал'
                      : 'С него платится налог'}
                  </Txt>
                </View>
                <Switch
                  value={taxable}
                  onValueChange={setTaxable}
                  trackColor={{ true: palette.accent, false: palette.border }}
                />
              </Card>

              {taxable && taxProfile?.status === 'npd' && (
                <View style={[styles.segment, { marginTop: spacing.md, marginHorizontal: 0 }]}>
                  {(['individual', 'company'] as PayerType[]).map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => setPayerType(p)}
                      style={[styles.segmentBtn, payerType === p && styles.segmentActive]}
                    >
                      <Txt
                        variant="caption"
                        weight="semibold"
                        color={payerType === p ? palette.white : palette.textMuted}
                      >
                        {p === 'individual' ? 'От физлица · 4%' : 'От юрлица или ИП · 6%'}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              )}

              {reserve && reserve.amount > 0 && (
                <Card style={{ marginTop: spacing.md, borderColor: palette.warning + '55' }}>
                  <View style={styles.between}>
                    <View style={{ flex: 1, paddingRight: spacing.md }}>
                      <Txt variant="caption" color={palette.textMuted}>
                        Отложить на налоги
                      </Txt>
                      <Txt
                        variant="title"
                        weight="bold"
                        color={palette.warning}
                        style={{ marginTop: 2 }}
                      >
                        {formatMoney(reserve.amount, base)}
                      </Txt>
                    </View>
                    <Switch
                      value={reserveNow}
                      onValueChange={setReserveNow}
                      trackColor={{ true: palette.warning, false: palette.border }}
                    />
                  </View>

                  <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.md }}>
                    {reserve.explanation}
                  </Txt>

                  {reserveNow && (
                    <Txt variant="caption" color={palette.textMuted} style={{ marginTop: spacing.sm }}>
                      Сразу уйдёт в налоговую копилку — свободными останется{' '}
                      <Txt variant="caption" weight="bold" color={palette.income}>
                        {formatMoney(numeric - reserve.amount, base)}
                      </Txt>
                      .
                    </Txt>
                  )}
                </Card>
              )}
            </>
          )}

          {/* Расход, который уменьшает налог (только УСН «доходы минус расходы») */}
          {taxProfile?.status === 'ip_usn_profit' && kind === 'expense' && (
            <Card style={[styles.between, { marginTop: spacing.lg }]}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Txt variant="body" weight="semibold">
                  Расход бизнеса
                </Txt>
                <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                  Есть чек или накладная — уменьшит налог
                </Txt>
              </View>
              <Switch
                value={deductible}
                onValueChange={setDeductible}
                trackColor={{ true: palette.income, false: palette.border }}
              />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <Button
          title={kind === 'income' ? 'Добавить доход' : 'Добавить расход'}
          onPress={save}
          disabled={!canSave}
        />
      </View>
    </Screen>
  );
}

const CAT_W = '31%';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segmentBtn: {
    flex: 1,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: palette.accent },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.xl,
  },
  amountInput: {
    fontSize: 56,
    fontWeight: font.weight.bold as any,
    minWidth: 80,
    textAlign: 'center',
    padding: 0,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  dateArrow: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.lg,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  catItem: {
    width: CAT_W,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  note: {
    marginTop: spacing.xl,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.lg,
    height: 52,
    color: palette.text,
    fontSize: font.size.body,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  curChip: {
    paddingHorizontal: spacing.md,
    height: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
});
