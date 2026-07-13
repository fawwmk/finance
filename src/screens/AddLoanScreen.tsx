import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Card, Txt, Button, Touchable } from '../components/ui';
import { palette, spacing, radius, font } from '../theme/theme';
import { useStore } from '../store/useStore';
import { BANKS, GRACE_PRESETS } from '../data/banks';
import { pickTextColor } from './LoansScreen';
import { buildSchedule, cardStatus, formatTerm } from '../utils/loan';
import { LoanProduct, LoanType } from '../types';
import { formatMoney, formatDate, nextMonthlyDate, todayISO } from '../utils/format';

/** Готовые сроки в месяцах — чтобы не крутить степпер вручную. */
const TERMS = [6, 12, 24, 36, 48, 60, 84, 120];

export function AddLoanScreen({ navigation }: any) {
  const { addLoan, addRecurring, settings } = useStore();

  const [product, setProduct] = useState<LoanProduct>('loan');
  const [name, setName] = useState('');
  const [bankId, setBankId] = useState('tbank');
  const [remind, setRemind] = useState(true);

  // Обычный кредит
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('24');
  const [months, setMonths] = useState(24);
  const [type, setType] = useState<LoanType>('annuity');
  const [payDay, setPayDay] = useState(new Date().getDate());

  // Кредитная карта
  const [limit, setLimit] = useState('');
  const [debt, setDebt] = useState('');
  const [cardRate, setCardRate] = useState('30');
  const [graceDays, setGraceDays] = useState(55);
  const [graceStart, setGraceStart] = useState(todayISO());

  const bank = BANKS.find((b) => b.id === bankId)!;
  const isCard = product === 'card';

  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;

  const principalNum = num(principal);
  const rateNum = num(rate);
  const limitNum = num(limit);
  const debtNum = num(debt);
  const cardRateNum = num(cardRate);

  const firstPaymentDate = useMemo(() => nextMonthlyDate(payDay), [payDay]);

  /** Живой пересчёт кредита — та же формула, что в банке. */
  const calc = useMemo(
    () =>
      !isCard && principalNum > 0 && months > 0
        ? buildSchedule(principalNum, rateNum, months, type, firstPaymentDate)
        : null,
    [isCard, principalNum, rateNum, months, type, firstPaymentDate]
  );

  /** Живой пересчёт карты — когда сгорает грейс и во что это обойдётся. */
  const card = useMemo(
    () =>
      isCard && limitNum > 0
        ? cardStatus(
            {
              id: '',
              name: '',
              bankId,
              product: 'card',
              currency: settings.baseCurrency,
              annualRate: cardRateNum,
              principal: 0,
              months: 0,
              type: 'annuity',
              firstPaymentDate: todayISO(),
              creditLimit: limitNum,
              cardDebt: debtNum,
              gracePeriodDays: graceDays,
              graceStartDate: graceStart,
              minPaymentPercent: 5,
              createdAt: 0,
            },
            todayISO()
          )
        : null,
    [isCard, limitNum, debtNum, cardRateNum, graceDays, graceStart, bankId, settings.baseCurrency]
  );

  const valid = isCard ? limitNum > 0 : principalNum > 0 && rateNum >= 0 && months > 0;

  const selectBank = (id: string) => {
    setBankId(id);
    const b = BANKS.find((x) => x.id === id);
    if (!b) return;
    // Подставляем типичные значения банка — пользователь поправит на свои.
    setRate(String(b.typicalRate));
    setCardRate(String(b.typicalCardRate));
    setGraceDays(b.typicalGraceDays);
  };

  const save = () => {
    if (!valid) return;

    const loanName =
      name.trim() || (isCard ? `Карта ${bank.name}` : `Кредит ${bank.name}`);

    if (isCard) {
      const id = addLoan({
        name: loanName,
        bankId,
        product: 'card',
        currency: settings.baseCurrency,
        annualRate: cardRateNum,
        creditLimit: limitNum,
        cardDebt: debtNum,
        gracePeriodDays: graceDays,
        graceStartDate: graceStart,
        minPaymentPercent: 5,
        remindDaysBefore: remind ? 3 : undefined,
        // поля обычного кредита не используются
        principal: 0,
        months: 0,
        type: 'annuity',
        firstPaymentDate: graceStart,
      });

      // Напоминание — на дату, когда сгорает беспроцентный период.
      if (remind && card) {
        addRecurring({
          name: `${loanName} — закрыть до конца грейса`,
          kind: 'expense',
          amount: Math.round(debtNum),
          currency: settings.baseCurrency,
          categoryId: 'credit',
          recurrence: 'once',
          nextDate: card.graceEndDate,
          isCredit: true,
          loanId: id,
          remindDaysBefore: 3,
          active: true,
        });
      }

      navigation.goBack();
      return;
    }

    if (!calc) return;

    const id = addLoan({
      name: loanName,
      bankId,
      product: 'loan',
      principal: principalNum,
      currency: settings.baseCurrency,
      annualRate: rateNum,
      months,
      type,
      firstPaymentDate,
      remindDaysBefore: remind ? 2 : undefined,
    });

    // Платёж по кредиту попадает в «Планы» и в дневной бюджет как обязательный расход.
    addRecurring({
      name: `${loanName} — платёж`,
      kind: 'expense',
      amount: Math.round(calc.monthlyPayment),
      currency: settings.baseCurrency,
      categoryId: 'credit',
      recurrence: 'monthly',
      dayOfMonth: payDay,
      nextDate: firstPaymentDate,
      isCredit: true,
      loanId: id,
      remindDaysBefore: remind ? 2 : undefined,
      active: true,
    });

    navigation.goBack();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Txt variant="title" weight="bold">
          {isCard ? 'Кредитная карта' : 'Новый кредит'}
        </Txt>
        <Touchable onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={palette.textMuted} />
        </Touchable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Кредит или карта */}
          <View style={styles.segment}>
            <SegmentBtn
              active={!isCard}
              label="Кредит"
              hint="график платежей"
              onPress={() => setProduct('loan')}
            />
            <SegmentBtn
              active={isCard}
              label="Кредитная карта"
              hint="беспроцентный период"
              onPress={() => setProduct('card')}
            />
          </View>

          {/* Банк */}
          <Label>Банк</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {BANKS.map((b) => (
              <Touchable
                key={b.id}
                onPress={() => selectBank(b.id)}
                style={[styles.bankChip, bankId === b.id && { borderColor: b.color, borderWidth: 2 }]}
              >
                <View style={[styles.bankDot, { backgroundColor: b.color }]}>
                  <Txt variant="caption" weight="bold" color={pickTextColor(b.color)}>
                    {b.short}
                  </Txt>
                </View>
                <Txt
                  variant="caption"
                  color={bankId === b.id ? palette.text : palette.textMuted}
                  numberOfLines={1}
                >
                  {b.name}
                </Txt>
              </Touchable>
            ))}
          </ScrollView>

          {/* Название */}
          <Label>Название</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={isCard ? `Карта ${bank.name}` : `Кредит ${bank.name}`}
            placeholderTextColor={palette.textFaint}
            style={styles.input}
          />

          {isCard ? (
            <>
              {/* ── КРЕДИТНАЯ КАРТА ── */}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Label>Кредитный лимит</Label>
                  <TextInput
                    value={limit}
                    onChangeText={setLimit}
                    placeholder="200 000"
                    placeholderTextColor={palette.textFaint}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Label>Сейчас должен</Label>
                  <TextInput
                    value={debt}
                    onChangeText={setDebt}
                    placeholder="0"
                    placeholderTextColor={palette.textFaint}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
              </View>

              <Label>Беспроцентный период</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {GRACE_PRESETS.map((d) => (
                  <Touchable
                    key={d}
                    onPress={() => setGraceDays(d)}
                    style={[
                      styles.termChip,
                      graceDays === d && {
                        backgroundColor: palette.incomeSoft,
                        borderColor: palette.income,
                      },
                    ]}
                  >
                    <Txt
                      variant="body"
                      weight="semibold"
                      color={graceDays === d ? palette.income : palette.textMuted}
                    >
                      {d} дн.
                    </Txt>
                  </Touchable>
                ))}
              </ScrollView>
              <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
                У {bank.name} обычно {bank.typicalGraceDays} дней — но у каждой карты свой,
                проверь в приложении банка.
              </Txt>

              <Label>Ставка после грейса, % годовых</Label>
              <TextInput
                value={cardRate}
                onChangeText={setCardRate}
                keyboardType="decimal-pad"
                style={styles.input}
              />

              {/* Живой расчёт карты */}
              {card && debtNum > 0 && (
                <Card
                  style={{
                    marginTop: spacing.xl,
                    borderColor: card.daysLeft >= 0 ? palette.income + '55' : palette.expense + '55',
                  }}
                >
                  <Txt variant="caption" color={palette.textMuted}>
                    {card.daysLeft >= 0
                      ? 'Погаси без процентов до'
                      : 'Беспроцентный период истёк'}
                  </Txt>
                  <Txt
                    variant="title"
                    weight="bold"
                    color={card.daysLeft >= 0 ? palette.income : palette.expense}
                    style={{ marginTop: 2 }}
                  >
                    {formatDate(card.graceEndDate)}
                    {card.daysLeft >= 0 ? ` · осталось ${card.daysLeft} дн.` : ''}
                  </Txt>

                  <View style={styles.divider} />

                  <Row
                    label="Если не успеть — процентов"
                    value={formatMoney(card.interestIfMissed, settings.baseCurrency)}
                    color={palette.expense}
                  />
                  <Row
                    label="Минимальный платёж"
                    value={formatMoney(card.minPayment, settings.baseCurrency)}
                  />
                  <Row
                    label="Свободно из лимита"
                    value={formatMoney(card.available, settings.baseCurrency)}
                  />

                  <Txt variant="caption" color={palette.warning} style={{ marginTop: spacing.sm }}>
                    ⚠️ Минимальный платёж не спасает от процентов — он спасает только от
                    просрочки. Грейс сгорает всё равно.
                  </Txt>
                </Card>
              )}
            </>
          ) : (
            <>
              {/* ── ОБЫЧНЫЙ КРЕДИТ ── */}
              <View style={styles.row}>
                <View style={{ flex: 1.4 }}>
                  <Label>Сумма кредита</Label>
                  <TextInput
                    value={principal}
                    onChangeText={setPrincipal}
                    placeholder="500 000"
                    placeholderTextColor={palette.textFaint}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Label>Ставка, % годовых</Label>
                  <TextInput
                    value={rate}
                    onChangeText={setRate}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
              </View>

              <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
                Ставку возьми из своего договора — у каждого клиента она своя.
              </Txt>

              <Label>Срок</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {TERMS.map((m) => (
                  <Touchable
                    key={m}
                    onPress={() => setMonths(m)}
                    style={[
                      styles.termChip,
                      months === m && {
                        backgroundColor: palette.accentSoft,
                        borderColor: palette.accent,
                      },
                    ]}
                  >
                    <Txt
                      variant="body"
                      weight="semibold"
                      color={months === m ? palette.accent : palette.textMuted}
                    >
                      {m < 12 ? `${m} мес` : formatTerm(m)}
                    </Txt>
                  </Touchable>
                ))}
              </ScrollView>

              <Label>Тип платежа</Label>
              <View style={styles.segment}>
                <SegmentBtn
                  active={type === 'annuity'}
                  label="Аннуитетный"
                  hint="одинаковый платёж"
                  onPress={() => setType('annuity')}
                />
                <SegmentBtn
                  active={type === 'differentiated'}
                  label="Дифференцированный"
                  hint="платёж убывает"
                  onPress={() => setType('differentiated')}
                />
              </View>
              <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
                У Сбера, Т-Банка, Альфы и ВТБ по умолчанию аннуитет — если в договоре не
                написано иное, оставляй его.
              </Txt>

              <Label>Платёж каждое число</Label>
              <Card style={styles.stepper}>
                <Touchable
                  onPress={() => setPayDay((d) => Math.max(1, d - 1))}
                  style={styles.stepBtn}
                >
                  <Ionicons name="chevron-back" size={20} color={palette.text} />
                </Touchable>
                <View style={{ alignItems: 'center' }}>
                  <Txt variant="title" weight="bold">
                    {payDay}-е
                  </Txt>
                  <Txt variant="caption" color={palette.textMuted}>
                    первый платёж {formatDate(firstPaymentDate)}
                  </Txt>
                </View>
                <Touchable
                  onPress={() => setPayDay((d) => Math.min(31, d + 1))}
                  style={styles.stepBtn}
                >
                  <Ionicons name="chevron-forward" size={20} color={palette.text} />
                </Touchable>
              </Card>

              {calc && (
                <Card style={{ marginTop: spacing.xl, borderColor: palette.credit + '55' }}>
                  <Txt variant="caption" color={palette.textMuted}>
                    {type === 'annuity' ? 'Ежемесячный платёж' : 'Первый платёж (дальше меньше)'}
                  </Txt>
                  <Txt
                    variant="display"
                    weight="bold"
                    color={palette.credit}
                    style={{ marginTop: 2 }}
                  >
                    {formatMoney(calc.monthlyPayment, settings.baseCurrency)}
                  </Txt>

                  <View style={styles.divider} />

                  <Row
                    label="Переплата банку"
                    value={formatMoney(calc.overpayment, settings.baseCurrency)}
                    color={palette.expense}
                  />
                  <Row
                    label="Всего выплатишь"
                    value={formatMoney(calc.totalPaid, settings.baseCurrency)}
                  />
                  <Row label="Срок" value={formatTerm(months)} />
                </Card>
              )}
            </>
          )}

          {/* Напоминание */}
          <Card style={[styles.between, { marginTop: spacing.md }]}>
            <View style={{ flex: 1 }}>
              <Txt variant="body" weight="semibold">
                Напоминать
              </Txt>
              <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                {isCard
                  ? 'За 3 дня до конца беспроцентного периода'
                  : 'За 2 дня до списания платежа'}
              </Txt>
            </View>
            <Switch
              value={remind}
              onValueChange={setRemind}
              trackColor={{ true: palette.accent, false: palette.border }}
            />
          </Card>

          <Button
            title={isCard ? 'Добавить карту' : 'Добавить кредит'}
            onPress={save}
            disabled={!valid}
            style={{ marginTop: spacing.xl }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Txt
      variant="caption"
      color={palette.textMuted}
      weight="semibold"
      style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}
    >
      {String(children).toUpperCase()}
    </Txt>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={[styles.between, { marginBottom: spacing.sm }]}>
      <Txt variant="body" color={palette.textMuted}>
        {label}
      </Txt>
      <Txt variant="body" weight="semibold" color={color}>
        {value}
      </Txt>
    </View>
  );
}

function SegmentBtn({
  active,
  label,
  hint,
  onPress,
}: {
  active: boolean;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Touchable onPress={onPress} style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
      <Txt variant="caption" weight="semibold" color={active ? palette.text : palette.textMuted}>
        {label}
      </Txt>
      <Txt variant="caption" color={active ? palette.textMuted : palette.textFaint}>
        {hint}
      </Txt>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    color: palette.text,
    fontSize: font.size.subtitle,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  bankChip: {
    width: 92,
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    marginRight: spacing.sm,
  },
  bankDot: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termChip: {
    paddingHorizontal: spacing.lg,
    height: 44,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    marginRight: spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
  },
  segmentBtnActive: { backgroundColor: palette.surfaceElevated },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: spacing.md },
});
