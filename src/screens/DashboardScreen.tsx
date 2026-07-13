import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Txt, Touchable } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';
import { RatesStrip } from '../components/RatesStrip';
import { palette, spacing, radius } from '../theme/theme';
import { useStore } from '../store/useStore';
import { categoryById } from '../data/categories';
import {
  currentBalance,
  monthTotals,
  dailyBudget,
  upcoming,
} from '../store/selectors';
import { formatMoney, relativeDay, daysUntil, formatDate } from '../utils/format';

export function DashboardScreen({ navigation }: any) {
  const { transactions, recurring, categories, settings, rates, taxSetAside, taxProfile } =
    useStore();
  const base = settings.baseCurrency;

  const balance = useMemo(
    () => currentBalance(transactions, base, rates),
    [transactions, base, rates]
  );
  const month = useMemo(
    () => monthTotals(transactions, base, rates),
    [transactions, base, rates]
  );

  /** Деньги в налоговой копилке не свои — тратить их нельзя. */
  const spendable = balance - taxSetAside;

  const budget = useMemo(
    () => dailyBudget(spendable, recurring, base, rates),
    [spendable, recurring, base, rates]
  );
  const soon = useMemo(() => upcoming(recurring, 45), [recurring]);
  const recent = transactions.slice(0, 5);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Курсы ЦБ РФ */}
        <RatesStrip />

        <Txt variant="caption" color={palette.textMuted} style={{ marginTop: spacing.xl }}>
          Общий баланс
        </Txt>
        <Txt variant="hero" weight="bold" style={{ marginTop: 2 }}>
          {formatMoney(balance, base)}
        </Txt>

        {taxSetAside > 0 && (
          <Txt variant="caption" color={palette.warning} style={{ marginTop: 4 }}>
            из них {formatMoney(taxSetAside, base)} отложено на налоги — свободно{' '}
            {formatMoney(spendable, base)}
          </Txt>
        )}

        {/* Быстрые действия */}
        <View style={styles.actions}>
          <Touchable
            onPress={() => navigation.navigate('ScanReceipt')}
            style={[styles.action, { backgroundColor: palette.accentSoft, borderColor: palette.accent + '55' }]}
          >
            <Ionicons name="scan-outline" size={20} color={palette.accent} />
            <Txt variant="caption" weight="semibold" color={palette.accent}>
              Чек
            </Txt>
          </Touchable>

          <Touchable
            onPress={() => navigation.navigate('Loans')}
            style={[styles.action, { backgroundColor: palette.creditSoft, borderColor: palette.credit + '55' }]}
          >
            <Ionicons name="card-outline" size={20} color={palette.credit} />
            <Txt variant="caption" weight="semibold" color={palette.credit}>
              Кредиты
            </Txt>
          </Touchable>

          <Touchable
            onPress={() => navigation.navigate('Tax')}
            style={[
              styles.action,
              { backgroundColor: palette.incomeSoft, borderColor: palette.income + '55' },
            ]}
          >
            <Ionicons name="receipt-outline" size={20} color={palette.income} />
            <Txt variant="caption" weight="semibold" color={palette.income}>
              {taxProfile ? 'Налоги' : 'Налоги'}
            </Txt>
          </Touchable>
        </View>

        {/* Доход / расход за месяц */}
        <View style={styles.row}>
          <Card style={styles.half}>
            <View style={styles.pillRow}>
              <View style={[styles.dot, { backgroundColor: palette.income }]} />
              <Txt variant="caption" color={palette.textMuted}>
                Доходы за месяц
              </Txt>
            </View>
            <Txt variant="title" weight="bold" color={palette.income}>
              {formatMoney(month.income, base)}
            </Txt>
          </Card>
          <Card style={styles.half}>
            <View style={styles.pillRow}>
              <View style={[styles.dot, { backgroundColor: palette.expense }]} />
              <Txt variant="caption" color={palette.textMuted}>
                Расходы за месяц
              </Txt>
            </View>
            <Txt variant="title" weight="bold" color={palette.expense}>
              {formatMoney(month.expense, base)}
            </Txt>
          </Card>
        </View>

        {/* Дневной бюджет */}
        <Card style={{ marginTop: spacing.md }}>
          <View style={styles.between}>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={palette.textMuted}>
                Можно тратить в день
              </Txt>
              <Txt variant="display" weight="bold" style={{ marginTop: 2 }}>
                {formatMoney(budget.perDay, base)}
              </Txt>
              <Txt variant="caption" color={palette.textFaint} style={{ marginTop: 4 }}>
                чтобы хватило на {budget.daysLeft} дн. до конца месяца
              </Txt>
            </View>
            <View style={styles.budgetIcon}>
              <Ionicons name="trending-up" size={26} color={palette.accent} />
            </View>
          </View>
        </Card>

        {/* Ближайшие платежи */}
        <View style={styles.sectionHead}>
          <Txt variant="subtitle" weight="semibold">
            Ближайшие платежи
          </Txt>
          <Touchable onPress={() => navigation.navigate('Планы')}>
            <Txt variant="caption" color={palette.accent}>
              Все
            </Txt>
          </Touchable>
        </View>

        {soon.length === 0 ? (
          <Card>
            <Txt variant="body" color={palette.textMuted}>
              Нет запланированных платежей. Добавь зарплату, подписки или платёж
              по кредиту во вкладке «Планы».
            </Txt>
          </Card>
        ) : (
          soon.slice(0, 3).map((r) => {
            const cat = categoryById(r.categoryId, categories);
            const d = daysUntil(r.nextDate);
            return (
              <Card key={r.id} style={styles.itemCard}>
                <CategoryIcon
                  icon={cat?.icon ?? 'calendar'}
                  color={r.isCredit ? palette.credit : cat?.color ?? palette.accent}
                />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Txt variant="body" weight="semibold">
                    {r.name}
                  </Txt>
                  <Txt variant="caption" color={palette.textMuted}>
                    {d === 0 ? 'сегодня' : `через ${d} дн.`} · {formatDate(r.nextDate)}
                  </Txt>
                </View>
                <Txt
                  variant="subtitle"
                  weight="bold"
                  color={r.kind === 'income' ? palette.income : palette.text}
                >
                  {r.kind === 'income' ? '+' : ''}
                  {formatMoney(r.amount, r.currency)}
                </Txt>
              </Card>
            );
          })
        )}

        {/* Последние операции */}
        <View style={styles.sectionHead}>
          <Txt variant="subtitle" weight="semibold">
            Последние операции
          </Txt>
          <Touchable onPress={() => navigation.navigate('Операции')}>
            <Txt variant="caption" color={palette.accent}>
              Все
            </Txt>
          </Touchable>
        </View>

        {recent.length === 0 ? (
          <Card>
            <Txt variant="body" color={palette.textMuted}>
              Пока пусто. Нажми «+», чтобы добавить первую операцию.
            </Txt>
          </Card>
        ) : (
          recent.map((t) => {
            const cat = categoryById(t.categoryId, categories);
            return (
              <Card key={t.id} style={styles.itemCard}>
                <CategoryIcon
                  icon={cat?.icon ?? 'pricetag'}
                  color={cat?.color ?? palette.textMuted}
                />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Txt variant="body" weight="semibold">
                    {cat?.name ?? 'Операция'}
                  </Txt>
                  <Txt variant="caption" color={palette.textMuted}>
                    {t.note ? t.note + ' · ' : ''}
                    {relativeDay(t.date)}
                  </Txt>
                </View>
                <Txt
                  variant="subtitle"
                  weight="bold"
                  color={t.kind === 'income' ? palette.income : palette.text}
                >
                  {t.kind === 'income' ? '+' : '−'}
                  {formatMoney(t.amount, t.currency)}
                </Txt>
              </Card>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  half: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  between: { flexDirection: 'row', alignItems: 'center' },
  budgetIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
  },
});
