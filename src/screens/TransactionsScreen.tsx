import React, { useMemo } from 'react';
import { View, SectionList, StyleSheet, Alert } from 'react-native';
import { Screen, Txt, Card } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';
import { palette, spacing } from '../theme/theme';
import { useStore } from '../store/useStore';
import { categoryById } from '../data/categories';
import { formatMoney, relativeDay } from '../utils/format';
import { groupByDay } from '../store/selectors';
import { Pressable } from 'react-native';

export function TransactionsScreen() {
  const { transactions, categories, deleteTransaction, settings } = useStore();

  const sections = useMemo(() => {
    return groupByDay(transactions).map((g) => ({
      title: relativeDay(g.date),
      data: g.items,
    }));
  }, [transactions]);

  const confirmDelete = (id: string) =>
    Alert.alert('Удалить операцию?', 'Действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteTransaction(id) },
    ]);

  if (transactions.length === 0) {
    return (
      <Screen>
        <View style={styles.empty}>
          <CategoryIcon icon="receipt-outline" color={palette.accent} size={64} />
          <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.lg }}>
            Операций пока нет
          </Txt>
          <Txt variant="body" color={palette.textMuted} style={{ marginTop: 6, textAlign: 'center' }}>
            Нажми «+» внизу, чтобы добавить{'\n'}первый расход или доход.
          </Txt>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Txt
            variant="caption"
            color={palette.textMuted}
            weight="semibold"
            style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}
          >
            {section.title.toUpperCase()}
          </Txt>
        )}
        renderItem={({ item }) => {
          const cat = categoryById(item.categoryId, categories);
          return (
            <Pressable onLongPress={() => confirmDelete(item.id)} delayLongPress={350}>
              <Card style={styles.itemCard}>
                <CategoryIcon icon={cat?.icon ?? 'pricetag'} color={cat?.color ?? palette.textMuted} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Txt variant="body" weight="semibold">
                    {cat?.name ?? 'Операция'}
                  </Txt>
                  {item.note ? (
                    <Txt variant="caption" color={palette.textMuted} numberOfLines={1}>
                      {item.note}
                    </Txt>
                  ) : null}
                </View>
                <Txt
                  variant="subtitle"
                  weight="bold"
                  color={item.kind === 'income' ? palette.income : palette.text}
                >
                  {item.kind === 'income' ? '+' : '−'}
                  {formatMoney(item.amount, item.currency)}
                </Txt>
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
