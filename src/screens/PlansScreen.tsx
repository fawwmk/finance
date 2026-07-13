import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Card, Touchable } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';
import { palette, spacing, radius } from '../theme/theme';
import { useStore } from '../store/useStore';
import { categoryById } from '../data/categories';
import { formatMoney, formatDate, daysUntil } from '../utils/format';

export function PlansScreen({ navigation }: any) {
  const { recurring, categories, deleteRecurring, settings } = useStore();

  const sorted = useMemo(
    () => [...recurring].sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1)),
    [recurring]
  );
  const income = sorted.filter((r) => r.kind === 'income');
  const credits = sorted.filter((r) => r.kind === 'expense' && r.isCredit);
  const expenses = sorted.filter((r) => r.kind === 'expense' && !r.isCredit);

  const confirmDelete = (id: string, name: string) =>
    Alert.alert(`Удалить «${name}»?`, '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteRecurring(id) },
    ]);

  const renderItem = (r: (typeof recurring)[number]) => {
    const cat = categoryById(r.categoryId, categories);
    const d = daysUntil(r.nextDate);
    const color = r.isCredit ? palette.credit : r.kind === 'income' ? palette.income : cat?.color ?? palette.accent;
    return (
      <Pressable key={r.id} onLongPress={() => confirmDelete(r.id, r.name)} delayLongPress={350}>
        <Card style={styles.itemCard}>
          <CategoryIcon icon={cat?.icon ?? 'calendar'} color={color} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Txt variant="body" weight="semibold">
              {r.name}
            </Txt>
            <Txt variant="caption" color={palette.textMuted}>
              {r.recurrence === 'monthly' ? 'Ежемесячно' : r.recurrence === 'weekly' ? 'Еженедельно' : r.recurrence === 'yearly' ? 'Ежегодно' : 'Разово'}
              {' · '}
              {d <= 0 ? 'сегодня' : `через ${d} дн.`} ({formatDate(r.nextDate)})
              {r.remindDaysBefore != null ? '  🔔' : ''}
            </Txt>
          </View>
          <Txt variant="subtitle" weight="bold" color={r.kind === 'income' ? palette.income : palette.text}>
            {r.kind === 'income' ? '+' : ''}
            {formatMoney(r.amount, r.currency)}
          </Txt>
        </Card>
      </Pressable>
    );
  };

  const Section = ({ title, items }: { title: string; items: typeof recurring }) =>
    items.length ? (
      <>
        <Txt variant="caption" color={palette.textMuted} weight="semibold" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </Txt>
        {items.map(renderItem)}
      </>
    ) : null;

  return (
    <Screen>
      <View style={styles.header}>
        <Txt variant="title" weight="bold">
          Планы
        </Txt>
        <Touchable onPress={() => navigation.navigate('AddRecurring')} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={palette.white} />
        </Touchable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {recurring.length === 0 ? (
          <Card style={{ marginTop: spacing.xl, alignItems: 'center', paddingVertical: spacing.xl }}>
            <CategoryIcon icon="calendar" color={palette.accent} size={60} />
            <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.md }}>
              Запланируй регулярные события
            </Txt>
            <Txt variant="body" color={palette.textMuted} style={{ marginTop: 6, textAlign: 'center' }}>
              Зарплата, подписки, платежи по кредиту —{'\n'}с датами и напоминаниями.
            </Txt>
          </Card>
        ) : (
          <>
            <Section title="Доходы" items={income} />
            <Section title="Кредиты" items={credits} />
            <Section title="Подписки и расходы" items={expenses} />
          </>
        )}
      </ScrollView>
    </Screen>
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
  },
});
