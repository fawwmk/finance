import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Card, Txt, Touchable, Button } from '../components/ui';
import { palette, spacing, radius, font } from '../theme/theme';
import { useStore } from '../store/useStore';
import { bankById } from '../data/banks';
import { pickTextColor } from './LoansScreen';
import {
  buildSchedule,
  loanProgress,
  earlyRepaymentBenefit,
  cardStatus,
  formatTerm,
} from '../utils/loan';
import { formatMoney, formatDate, todayISO } from '../utils/format';

export function LoanDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { loans, deleteLoan, updateLoan } = useStore();
  const loan = loans.find((l) => l.id === id);

  const [extra, setExtra] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [payoff, setPayoff] = useState('');

  const extraNum = parseFloat(extra.replace(',', '.')) || 0;
  const today = todayISO();
  const isCard = loan?.product === 'card';

  const calc = useMemo(
    () =>
      loan && !isCard
        ? buildSchedule(
            loan.principal,
            loan.annualRate,
            loan.months,
            loan.type,
            loan.firstPaymentDate,
            loan.extraMonthly ?? 0
          )
        : null,
    [loan, isCard]
  );

  const card = useMemo(
    () => (loan && isCard ? cardStatus(loan, today) : null),
    [loan, isCard, today]
  );

  /** «Если платить на X больше — закроешь раньше и сэкономишь Y». */
  const benefit = useMemo(
    () =>
      loan && extraNum > 0
        ? earlyRepaymentBenefit(
            loan.principal,
            loan.annualRate,
            loan.months,
            loan.type,
            loan.firstPaymentDate,
            extraNum
          )
        : null,
    [loan, extraNum]
  );

  if (!loan) {
    return (
      <Screen>
        <Txt style={{ padding: spacing.lg }}>Не найдено</Txt>
      </Screen>
    );
  }

  const bank = bankById(loan.bankId);

  const confirmDelete = () =>
    Alert.alert(`Удалить «${loan.name}»?`, 'Платёж исчезнет и из «Планов».', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          deleteLoan(loan.id);
          navigation.goBack();
        },
      },
    ]);

  const Header = () => (
    <View style={styles.header}>
      <Touchable onPress={() => navigation.goBack()} style={styles.iconBtn}>
        <Ionicons name="chevron-back" size={22} color={palette.text} />
      </Touchable>
      <Txt
        variant="subtitle"
        weight="bold"
        numberOfLines={1}
        style={{ flex: 1, textAlign: 'center' }}
      >
        {loan.name}
      </Txt>
      <Touchable onPress={confirmDelete} style={styles.iconBtn}>
        <Ionicons name="trash-outline" size={20} color={palette.expense} />
      </Touchable>
    </View>
  );

  /* ─────────────────────  КРЕДИТНАЯ КАРТА  ───────────────────── */

  if (isCard && card) {
    const burned = card.daysLeft < 0 && card.debt > 0;
    const urgent = card.daysLeft >= 0 && card.daysLeft <= 7;
    const graceColor = burned ? palette.expense : urgent ? palette.warning : palette.income;
    const usedPercent = loan.creditLimit
      ? Math.min(100, Math.round((card.debt / loan.creditLimit) * 100))
      : 0;

    const applyPayoff = () => {
      const sum = parseFloat(payoff.replace(',', '.')) || 0;
      if (sum <= 0) return;
      updateLoan(loan.id, { cardDebt: Math.max(0, card.debt - sum) });
      setPayoff('');
    };

    return (
      <Screen>
        <Header />

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          <Card>
            <View style={styles.rowCenter}>
              <View style={[styles.bankDot, { backgroundColor: bank.color }]}>
                <Txt variant="body" weight="bold" color={pickTextColor(bank.color)}>
                  {bank.short}
                </Txt>
              </View>
              <View style={{ marginLeft: spacing.md }}>
                <Txt variant="body" weight="semibold">
                  {bank.name}
                </Txt>
                <Txt variant="caption" color={palette.textMuted}>
                  Грейс {loan.gracePeriodDays} дн. · после него {loan.annualRate}% годовых
                </Txt>
              </View>
            </View>

            <View style={styles.divider} />

            <Txt variant="caption" color={palette.textMuted}>
              Долг по карте
            </Txt>
            <Txt variant="display" weight="bold" style={{ marginTop: 2 }}>
              {formatMoney(card.debt, loan.currency)}
            </Txt>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${usedPercent}%`,
                    backgroundColor: usedPercent > 80 ? palette.expense : palette.credit,
                  },
                ]}
              />
            </View>
            <View style={[styles.between, { marginTop: spacing.sm }]}>
              <Txt variant="caption" color={palette.textMuted}>
                Использовано {usedPercent}% лимита
              </Txt>
              <Txt variant="caption" color={palette.textFaint}>
                свободно {formatMoney(card.available, loan.currency)}
              </Txt>
            </View>
          </Card>

          {/* Главное: беспроцентный период */}
          <Card style={{ marginTop: spacing.md, borderColor: graceColor + '55' }}>
            <View style={styles.rowCenter}>
              <Ionicons
                name={burned ? 'alert-circle' : urgent ? 'time' : 'checkmark-circle'}
                size={22}
                color={graceColor}
              />
              <Txt variant="subtitle" weight="bold" color={graceColor} style={{ marginLeft: 8 }}>
                {card.debt === 0
                  ? 'Долга нет'
                  : burned
                    ? 'Беспроцентный период сгорел'
                    : `Осталось ${card.daysLeft} дн.`}
              </Txt>
            </View>

            {card.debt === 0 ? (
              <Txt variant="body" color={palette.textMuted} style={{ marginTop: spacing.md }}>
                Пока ты ничего не должен — карта не стоит тебе ни рубля. Так и держи:
                гаси весь долг до конца грейса, и кредит остаётся бесплатным.
              </Txt>
            ) : burned ? (
              <>
                <Txt variant="body" style={{ marginTop: spacing.md }}>
                  Проценты уже начислены задним числом — за весь период, а не с даты
                  просрочки. Это{' '}
                  <Txt variant="body" weight="bold" color={palette.expense}>
                    {formatMoney(card.interestIfMissed, loan.currency)}
                  </Txt>
                  .
                </Txt>
                <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.md }}>
                  Гаси долг полностью как можно скорее: пока он висит, проценты капают
                  каждый день. Новый грейс начнётся только после полного погашения.
                </Txt>
              </>
            ) : (
              <>
                <Txt variant="body" style={{ marginTop: spacing.md }}>
                  Погаси{' '}
                  <Txt variant="body" weight="bold">
                    {formatMoney(card.debt, loan.currency)}
                  </Txt>{' '}
                  до{' '}
                  <Txt variant="body" weight="bold" color={graceColor}>
                    {formatDate(card.graceEndDate)}
                  </Txt>{' '}
                  — и не заплатишь банку ни рубля процентов.
                </Txt>

                <View style={[styles.warnBox, { marginTop: spacing.lg }]}>
                  <Txt variant="caption" color={palette.warning}>
                    ⚠️ Не успеешь — банк начислит{' '}
                    <Txt variant="caption" weight="bold" color={palette.expense}>
                      {formatMoney(card.interestIfMissed, loan.currency)}
                    </Txt>{' '}
                    задним числом, за весь льготный период.
                  </Txt>
                </View>

                <View style={[styles.warnBox, { marginTop: spacing.sm }]}>
                  <Txt variant="caption" color={palette.textMuted}>
                    Минимальный платёж{' '}
                    <Txt variant="caption" weight="bold">
                      {formatMoney(card.minPayment, loan.currency)}
                    </Txt>{' '}
                    спасает только от просрочки и штрафа. Грейс он не продлевает —
                    проценты всё равно начислят.
                  </Txt>
                </View>
              </>
            )}
          </Card>

          {/* Погашение */}
          {card.debt > 0 && (
            <>
              <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.xxl }}>
                Внести погашение
              </Txt>
              <Card style={{ marginTop: spacing.md }}>
                <TextInput
                  value={payoff}
                  onChangeText={setPayoff}
                  placeholder={`Например, ${Math.round(card.debt)}`}
                  placeholderTextColor={palette.textFaint}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Button
                  title="Уменьшить долг"
                  onPress={applyPayoff}
                  style={{ marginTop: spacing.md }}
                />
                <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.md }}>
                  Это просто обновит долг по карте. Саму трату вноси как обычную операцию.
                </Txt>
              </Card>
            </>
          )}
        </ScrollView>
      </Screen>
    );
  }

  /* ─────────────────────  ОБЫЧНЫЙ КРЕДИТ  ───────────────────── */

  if (!calc) {
    return (
      <Screen>
        <Txt style={{ padding: spacing.lg }}>Кредит не найден</Txt>
      </Screen>
    );
  }

  const prog = loanProgress(calc, today);
  const rows = showAll ? calc.schedule : calc.schedule.slice(0, 12);

  return (
    <Screen>
      <Header />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Шапка: банк и условия */}
        <Card>
          <View style={styles.rowCenter}>
            <View style={[styles.bankDot, { backgroundColor: bank.color }]}>
              <Txt variant="body" weight="bold" color={pickTextColor(bank.color)}>
                {bank.short}
              </Txt>
            </View>
            <View style={{ marginLeft: spacing.md }}>
              <Txt variant="body" weight="semibold">
                {bank.name}
              </Txt>
              <Txt variant="caption" color={palette.textMuted}>
                {loan.annualRate}% годовых · {formatTerm(loan.months)} ·{' '}
                {loan.type === 'annuity' ? 'аннуитет' : 'диффер.'}
              </Txt>
            </View>
          </View>

          <View style={styles.divider} />

          <Txt variant="caption" color={palette.textMuted}>
            {loan.type === 'annuity' ? 'Ежемесячный платёж' : 'Первый платёж'}
          </Txt>
          <Txt variant="display" weight="bold" color={palette.credit} style={{ marginTop: 2 }}>
            {formatMoney(calc.monthlyPayment, loan.currency)}
          </Txt>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(prog.progress * 100)}%`,
                  backgroundColor: prog.next ? palette.credit : palette.income,
                },
              ]}
            />
          </View>
          <Txt variant="caption" color={palette.textMuted} style={{ marginTop: spacing.sm }}>
            Выплачено {prog.paidCount} из {prog.totalCount} платежей
            {prog.next ? ` · следующий ${formatDate(prog.next.date)}` : ' · кредит закрыт 🎉'}
          </Txt>
        </Card>

        {/* Цифры */}
        <View style={styles.grid}>
          <Stat label="Взято" value={formatMoney(loan.principal, loan.currency)} />
          <Stat
            label="Переплата"
            value={formatMoney(calc.overpayment, loan.currency)}
            color={palette.expense}
          />
          <Stat label="Всего выплатишь" value={formatMoney(calc.totalPaid, loan.currency)} />
          <Stat
            label="Остаток долга"
            value={formatMoney(prog.remainingDebt, loan.currency)}
            color={palette.credit}
          />
        </View>

        {/* Досрочное погашение */}
        <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.xxl }}>
          Досрочное погашение
        </Txt>
        <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 4 }}>
          Сколько добавишь к платежу каждый месяц?
        </Txt>

        <Card style={{ marginTop: spacing.md }}>
          <TextInput
            value={extra}
            onChangeText={setExtra}
            placeholder="например, 5 000"
            placeholderTextColor={palette.textFaint}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          {benefit && benefit.monthsSaved > 0 ? (
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.benefitRow}>
                <Ionicons name="time-outline" size={18} color={palette.income} />
                <Txt variant="body">
                  Закроешь на{' '}
                  <Txt variant="body" weight="bold" color={palette.income}>
                    {formatTerm(benefit.monthsSaved)}
                  </Txt>{' '}
                  раньше
                </Txt>
              </View>
              <View style={[styles.benefitRow, { marginTop: spacing.sm }]}>
                <Ionicons name="wallet-outline" size={18} color={palette.income} />
                <Txt variant="body">
                  Сэкономишь{' '}
                  <Txt variant="body" weight="bold" color={palette.income}>
                    {formatMoney(benefit.moneySaved, loan.currency)}
                  </Txt>{' '}
                  на процентах
                </Txt>
              </View>
              <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.md }}>
                Новый срок — {formatTerm(benefit.newTermMonths)} вместо {formatTerm(loan.months)}.
                Банк обязан пересчитать: пиши заявление на сокращение срока, а не платежа —
                так выгоднее.
              </Txt>
            </View>
          ) : (
            <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.md }}>
              Введи сумму — покажу, на сколько раньше закроешь кредит и сколько
              сэкономишь на процентах.
            </Txt>
          )}
        </Card>

        {/* График платежей */}
        <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.xxl }}>
          График платежей
        </Txt>

        <Card style={{ marginTop: spacing.md, padding: 0, overflow: 'hidden' }}>
          <View style={[styles.tr, styles.thead]}>
            <Txt variant="caption" color={palette.textFaint} style={{ width: 28 }}>
              №
            </Txt>
            <Txt variant="caption" color={palette.textFaint} style={{ flex: 1.1 }}>
              Дата
            </Txt>
            <Txt variant="caption" color={palette.textFaint} style={styles.num}>
              Платёж
            </Txt>
            <Txt variant="caption" color={palette.textFaint} style={styles.num}>
              %банку
            </Txt>
            <Txt variant="caption" color={palette.textFaint} style={styles.num}>
              Остаток
            </Txt>
          </View>

          {rows.map((r) => {
            const paid = r.date <= today;
            return (
              <View key={r.n} style={[styles.tr, paid && { backgroundColor: palette.incomeSoft }]}>
                <Txt variant="caption" color={palette.textFaint} style={{ width: 28 }}>
                  {r.n}
                </Txt>
                <Txt variant="caption" style={{ flex: 1.1 }}>
                  {formatDate(r.date)}
                </Txt>
                <Txt variant="caption" weight="semibold" style={styles.num}>
                  {short(r.payment)}
                </Txt>
                <Txt variant="caption" color={palette.expense} style={styles.num}>
                  {short(r.interest)}
                </Txt>
                <Txt variant="caption" color={palette.textMuted} style={styles.num}>
                  {short(r.balance)}
                </Txt>
              </View>
            );
          })}

          {calc.schedule.length > 12 && (
            <Touchable onPress={() => setShowAll((v) => !v)} style={styles.moreBtn}>
              <Txt variant="caption" color={palette.accent} weight="semibold">
                {showAll
                  ? 'Свернуть'
                  : `Показать все ${calc.schedule.length} платежей`}
              </Txt>
            </Touchable>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

/** Компактные числа для таблицы: 12 345 -> "12,3к". */
function short(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}к`;
  return String(Math.round(n));
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card style={styles.stat}>
      <Txt variant="caption" color={palette.textMuted}>
        {label}
      </Txt>
      <Txt variant="body" weight="bold" color={color} style={{ marginTop: 4 }}>
        {value}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bankDot: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: spacing.lg },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.surfaceElevated,
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  stat: { width: '47.5%', paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  input: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    color: palette.text,
    fontSize: font.size.subtitle,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warnBox: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  thead: { backgroundColor: palette.surfaceElevated },
  num: { flex: 1, textAlign: 'right' },
  moreBtn: { alignItems: 'center', paddingVertical: spacing.md },
});
