import React, { useMemo } from 'react';
import { View, SectionList, StyleSheet, Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Txt, Card } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';
import { palette, spacing, radius } from '../theme/theme';
import { useStore } from '../store/useStore';
import { categoryById } from '../data/categories';
import { formatMoney, relativeDay } from '../utils/format';
import { feedByDay, FeedEntry } from '../store/selectors';
import { Exchange, Transaction } from '../types';

export function TransactionsScreen() {
  const { transactions, exchanges, categories, deleteTransaction, deleteExchange } = useStore();

  /**
   * В ленте и операции, и обмены. Обмен — не доход и не расход, но без него
   * история врёт: рубли уменьшились, евро появились, а причины не видно.
   */
  const sections = useMemo(
    () =>
      feedByDay(transactions, exchanges).map((g) => ({
        title: relativeDay(g.date),
        data: g.items,
      })),
    [transactions, exchanges]
  );

  const confirmDeleteTx = (id: string) =>
    Alert.alert('Удалить операцию?', 'Действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteTransaction(id) },
    ]);

  const confirmDeleteEx = (id: string) =>
    Alert.alert('Удалить обмен?', 'Деньги вернутся в исходный кошелёк.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteExchange(id) },
    ]);

  const empty = transactions.length === 0 && exchanges.length === 0;

  if (empty) {
    return (
      <Screen>
        <View style={styles.empty}>
          <CategoryIcon icon="receipt-outline" color={palette.accent} size={64} />
          <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.lg }}>
            Операций пока нет
          </Txt>
          <Txt
            variant="body"
            color={palette.textMuted}
            style={{ marginTop: 6, textAlign: 'center' }}
          >
            Нажми «+» внизу, чтобы добавить{'\n'}первый расход или доход.
          </Txt>
        </View>
      </Screen>
    );
  }

  /** Обычная операция: доход или расход. */
  const TxRow = ({ tx }: { tx: Transaction }) => {
    const cat = categoryById(tx.categoryId, categories);
    return (
      <Pressable onLongPress={() => confirmDeleteTx(tx.id)} delayLongPress={350}>
        <Card style={styles.itemCard}>
          <CategoryIcon icon={cat?.icon ?? 'pricetag'} color={cat?.color ?? palette.textMuted} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Txt variant="body" weight="semibold">
              {cat?.name ?? 'Операция'}
            </Txt>
            {tx.note ? (
              <Txt variant="caption" color={palette.textMuted} numberOfLines={1}>
                {tx.note}
              </Txt>
            ) : null}
          </View>
          <Txt
            variant="subtitle"
            weight="bold"
            color={tx.kind === 'income' ? palette.income : palette.text}
          >
            {tx.kind === 'income' ? '+' : '−'}
            {formatMoney(tx.amount, tx.currency)}
          </Txt>
        </Card>
      </Pressable>
    );
  };

  /**
   * Обмен валюты. Показываем обе стороны сразу — сколько ушло и сколько
   * пришло, — и настоящий курс сделки. Так по ленте видно, где что лежит
   * и почему.
   */
  const ExchangeRow = ({ ex }: { ex: Exchange }) => (
    <Pressable onLongPress={() => confirmDeleteEx(ex.id)} delayLongPress={350}>
      <Card style={[styles.itemCard, styles.exchangeCard]}>
        <View style={styles.exchangeIcon}>
          <Ionicons name="swap-horizontal" size={18} color={palette.accent} />
        </View>

        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Txt variant="body" weight="semibold">
            Обмен {ex.fromCurrency} → {ex.toCurrency}
          </Txt>
          <Txt variant="caption" color={palette.textMuted} numberOfLines={1}>
            по {formatMoney(ex.rate, ex.fromCurrency)} за 1 {ex.toCurrency}
            {ex.place ? ` · ${ex.place}` : ''}
          </Txt>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Txt variant="body" weight="semibold" color={palette.expense}>
            −{formatMoney(ex.fromAmount, ex.fromCurrency)}
          </Txt>
          <Txt variant="body" weight="semibold" color={palette.income}>
            +{formatMoney(ex.toAmount, ex.toCurrency)}
          </Txt>
        </View>
      </Card>
    </Pressable>
  );

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(item: FeedEntry) => `${item.kind}-${item.id}`}
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
        renderItem={({ item }) =>
          item.kind === 'tx' ? <TxRow tx={item.tx} /> : <ExchangeRow ex={item.ex} />
        }
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
  exchangeCard: {
    borderColor: palette.accent + '44',
  },
  exchangeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
