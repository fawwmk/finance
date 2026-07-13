import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Card, Txt, Touchable, Button } from '../components/ui';
import { palette, spacing, radius } from '../theme/theme';
import { useStore } from '../store/useStore';
import { bankById } from '../data/banks';
import { buildSchedule, loanProgress, cardStatus, formatTerm } from '../utils/loan';
import { convertToBase } from '../store/selectors';
import { formatMoney, formatDate, todayISO, plural } from '../utils/format';
import { Loan } from '../types';

export function LoansScreen({ navigation }: any) {
  const { loans, settings, rates } = useStore();
  const base = settings.baseCurrency;
  const today = todayISO();

  const cards = loans.filter((l) => l.product === 'card');
  const credits = loans.filter((l) => l.product !== 'card');

  /** Считаем каждый кредит по формуле банка + сводку по всем. */
  const creditView = useMemo(
    () =>
      credits.map((l) => {
        const calc = buildSchedule(
          l.principal,
          l.annualRate,
          l.months,
          l.type,
          l.firstPaymentDate,
          l.extraMonthly ?? 0
        );
        return { loan: l, calc, prog: loanProgress(calc, today) };
      }),
    [credits, today]
  );

  const cardView = useMemo(
    () => cards.map((l) => ({ loan: l, status: cardStatus(l, today) })),
    [cards, today]
  );

  const totals = useMemo(() => {
    let debt = 0;
    let monthly = 0;
    // Кредит в валюте без курса в общий итог не суммируем — иначе доллары
    // сложатся с рублями как один к одному. Считаем такие отдельно.
    let skipped = 0;

    for (const { loan, calc, prog } of creditView) {
      const d = convertToBase(prog.remainingDebt, loan.currency, base, rates);
      const m = convertToBase(calc.monthlyPayment, loan.currency, base, rates);
      if (d == null || (prog.next && m == null)) {
        skipped += 1;
        continue;
      }
      debt += d;
      if (prog.next && m != null) monthly += m;
    }
    for (const { loan, status } of cardView) {
      const d = convertToBase(status.debt, loan.currency, base, rates);
      if (d == null) {
        skipped += 1;
        continue;
      }
      debt += d;
    }
    return { debt, monthly, skipped };
  }, [creditView, cardView, base, rates]);

  const empty = loans.length === 0;

  return (
    <Screen>
      <View style={styles.header}>
        <Touchable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={palette.text} />
        </Touchable>
        <Txt variant="title" weight="bold">
          Кредиты
        </Txt>
        <Touchable onPress={() => navigation.navigate('AddLoan')} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={palette.white} />
        </Touchable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {empty ? (
          <Card style={{ marginTop: spacing.xl, alignItems: 'center', paddingVertical: spacing.xxl }}>
            <View style={styles.bigIcon}>
              <Ionicons name="card-outline" size={40} color={palette.credit} />
            </View>
            <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.lg }}>
              Добавь кредит или карту
            </Txt>
            <Txt
              variant="body"
              color={palette.textMuted}
              style={{ marginTop: 8, textAlign: 'center' }}
            >
              По кредиту посчитаю платёж, переплату и весь график.{'\n'}
              По карте — когда сгорает беспроцентный период.
            </Txt>
            <Button
              title="Добавить"
              onPress={() => navigation.navigate('AddLoan')}
              style={{ marginTop: spacing.xl, paddingHorizontal: spacing.xxl }}
            />
          </Card>
        ) : (
          <>
            {/* Сводка */}
            <Card style={{ borderColor: palette.credit + '55' }}>
              <Txt variant="caption" color={palette.textMuted}>
                Всего должен банкам
              </Txt>
              <Txt variant="display" weight="bold" color={palette.credit} style={{ marginTop: 2 }}>
                {formatMoney(totals.debt, base)}
              </Txt>
              {totals.monthly > 0 && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.between}>
                    <Txt variant="body" color={palette.textMuted}>
                      Платежей в месяц
                    </Txt>
                    <Txt variant="subtitle" weight="bold">
                      {formatMoney(totals.monthly, base)}
                    </Txt>
                  </View>
                </>
              )}
              {totals.skipped > 0 && (
                <Txt variant="caption" color={palette.expense} style={{ marginTop: spacing.sm }}>
                  {plural(totals.skipped, 'кредит', 'кредита', 'кредитов')} в валюте без курса — в
                  сумму не вошли.
                </Txt>
              )}
            </Card>

            {/* ── Кредитные карты ── */}
            {cardView.length > 0 && (
              <Txt
                variant="caption"
                color={palette.textMuted}
                weight="semibold"
                style={styles.sectionTitle}
              >
                КРЕДИТНЫЕ КАРТЫ
              </Txt>
            )}

            {cardView.map(({ loan, status }) => {
              const bank = bankById(loan.bankId);
              const urgent = status.daysLeft >= 0 && status.daysLeft <= 7;
              const burned = status.daysLeft < 0 && status.debt > 0;
              const graceColor = burned
                ? palette.expense
                : urgent
                  ? palette.warning
                  : palette.income;

              return (
                <Touchable
                  key={loan.id}
                  onPress={() => navigation.navigate('LoanDetail', { id: loan.id })}
                >
                  <Card style={{ marginTop: spacing.md }}>
                    <View style={styles.between}>
                      <View style={[styles.bankDot, { backgroundColor: bank.color }]}>
                        <Txt variant="caption" weight="bold" color={pickTextColor(bank.color)}>
                          {bank.short}
                        </Txt>
                      </View>
                      <View style={{ flex: 1, marginLeft: spacing.md }}>
                        <Txt variant="body" weight="semibold">
                          {loan.name}
                        </Txt>
                        <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                          Лимит {formatMoney(loan.creditLimit ?? 0, loan.currency)} ·{' '}
                          {loan.gracePeriodDays} дн. грейс
                        </Txt>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
                    </View>

                    <View style={styles.divider} />

                    {status.debt === 0 ? (
                      <Txt variant="body" weight="semibold" color={palette.income}>
                        ✅ Долга нет — карта бесплатна
                      </Txt>
                    ) : (
                      <>
                        <View style={styles.between}>
                          <View>
                            <Txt variant="caption" color={palette.textFaint}>
                              Долг
                            </Txt>
                            <Txt variant="subtitle" weight="bold" style={{ marginTop: 2 }}>
                              {formatMoney(status.debt, loan.currency)}
                            </Txt>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Txt variant="caption" color={palette.textFaint}>
                              {burned ? 'Грейс сгорел' : 'Без процентов до'}
                            </Txt>
                            <Txt
                              variant="subtitle"
                              weight="bold"
                              color={graceColor}
                              style={{ marginTop: 2 }}
                            >
                              {formatDate(status.graceEndDate)}
                            </Txt>
                          </View>
                        </View>

                        <View style={[styles.graceBadge, { backgroundColor: graceColor + '1F' }]}>
                          <Ionicons
                            name={burned ? 'alert-circle' : urgent ? 'time' : 'checkmark-circle'}
                            size={16}
                            color={graceColor}
                          />
                          <Txt variant="caption" weight="semibold" color={graceColor}>
                            {burned
                              ? `Проценты уже капают — ${formatMoney(status.interestIfMissed, loan.currency)}`
                              : `Осталось ${status.daysLeft} дн., чтобы не платить проценты`}
                          </Txt>
                        </View>
                      </>
                    )}
                  </Card>
                </Touchable>
              );
            })}

            {/* ── Кредиты ── */}
            {creditView.length > 0 && (
              <Txt
                variant="caption"
                color={palette.textMuted}
                weight="semibold"
                style={styles.sectionTitle}
              >
                КРЕДИТЫ
              </Txt>
            )}

            {creditView.map(({ loan, calc, prog }) => {
              const bank = bankById(loan.bankId);
              const done = !prog.next;
              return (
                <Touchable
                  key={loan.id}
                  onPress={() => navigation.navigate('LoanDetail', { id: loan.id })}
                >
                  <Card style={{ marginTop: spacing.md }}>
                    <View style={styles.between}>
                      <View style={[styles.bankDot, { backgroundColor: bank.color }]}>
                        <Txt variant="caption" weight="bold" color={pickTextColor(bank.color)}>
                          {bank.short}
                        </Txt>
                      </View>
                      <View style={{ flex: 1, marginLeft: spacing.md }}>
                        <Txt variant="body" weight="semibold">
                          {loan.name}
                        </Txt>
                        <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                          {bank.name} · {loan.annualRate}% · {formatTerm(loan.months)}
                        </Txt>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
                    </View>

                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.round(prog.progress * 100)}%`,
                            backgroundColor: done ? palette.income : palette.credit,
                          },
                        ]}
                      />
                    </View>
                    <View style={[styles.between, { marginTop: spacing.sm }]}>
                      <Txt variant="caption" color={palette.textMuted}>
                        {done
                          ? '✅ Кредит закрыт'
                          : `Платёж ${formatDate(prog.next!.date)} · ${formatMoney(
                              prog.next!.payment,
                              loan.currency
                            )}`}
                      </Txt>
                      <Txt variant="caption" color={palette.textFaint}>
                        {prog.paidCount}/{prog.totalCount}
                      </Txt>
                    </View>

                    <View style={styles.divider} />
                    <View style={styles.between}>
                      <View>
                        <Txt variant="caption" color={palette.textFaint}>
                          Осталось выплатить
                        </Txt>
                        <Txt variant="body" weight="semibold" style={{ marginTop: 2 }}>
                          {formatMoney(prog.remainingDebt, loan.currency)}
                        </Txt>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Txt variant="caption" color={palette.textFaint}>
                          Переплата
                        </Txt>
                        <Txt
                          variant="body"
                          weight="semibold"
                          color={palette.expense}
                          style={{ marginTop: 2 }}
                        >
                          {formatMoney(calc.overpayment, loan.currency)}
                        </Txt>
                      </View>
                    </View>
                  </Card>
                </Touchable>
              );
            })}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Чёрный текст на светлом логотипе банка (жёлтый Т-Банк), белый — на тёмном. */
export function pickTextColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: palette.creditSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bankDot: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: spacing.md },
  sectionTitle: { marginTop: spacing.xl },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.surfaceElevated,
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3 },
  graceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
});
