import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TextInput, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Button, Touchable } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';
import { palette, spacing, radius, font } from '../theme/theme';
import { useStore } from '../store/useStore';
import { TxKind } from '../types';
import { nextMonthlyDate } from '../utils/format';

/** За сколько дней предупредить. */
const REMIND_OPTIONS = [
  { days: 0, label: 'В день события' },
  { days: 1, label: 'За день' },
  { days: 3, label: 'За 3 дня' },
  { days: 7, label: 'За неделю' },
];

export function AddRecurringScreen({ navigation }: any) {
  const { categories, addRecurring, settings } = useStore();
  const [kind, setKind] = useState<TxKind>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [day, setDay] = useState(1);
  const [isCredit, setIsCredit] = useState(false);
  const [remind, setRemind] = useState(true);
  const [remindDays, setRemindDays] = useState(1);

  const cats = categories.filter((c) => c.kind === kind);
  const numeric = parseFloat(amount.replace(',', '.')) || 0;
  const canSave = numeric > 0 && categoryId && name.trim();

  const save = () => {
    if (!canSave) return;
    addRecurring({
      name: name.trim(),
      kind,
      amount: numeric,
      currency: settings.baseCurrency,
      categoryId: categoryId!,
      recurrence: 'monthly',
      dayOfMonth: day,
      nextDate: nextMonthlyDate(day),
      isCredit: kind === 'expense' ? isCredit : false,
      remindDaysBefore: remind ? remindDays : undefined,
      active: true,
    });
    navigation.goBack();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Touchable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={28} color={palette.textMuted} />
        </Touchable>
        <Txt variant="subtitle" weight="semibold">
          Регулярное событие
        </Txt>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.segment}>
        {(['expense', 'income'] as TxKind[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => { setKind(k); setCategoryId(null); setIsCredit(false); }}
            style={[styles.segmentBtn, kind === k && styles.segmentActive]}
          >
            <Txt variant="body" weight="semibold" color={kind === k ? palette.white : palette.textMuted}>
              {k === 'expense' ? 'Платёж / расход' : 'Поступление'}
            </Txt>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={kind === 'income' ? 'Например: Зарплата' : 'Например: Netflix или Кредит'}
          placeholderTextColor={palette.textFaint}
          style={styles.input}
        />

        <View style={styles.amountRow}>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ''))}
            placeholder="0"
            placeholderTextColor={palette.textFaint}
            keyboardType="decimal-pad"
            style={[styles.input, { flex: 1, fontSize: font.size.title, fontWeight: '700' }]}
          />
          <Txt variant="title" weight="bold" color={palette.textMuted} style={{ marginLeft: 10 }}>
            ₽
          </Txt>
        </View>

        {/* День месяца */}
        <View style={styles.dayCard}>
          <Txt variant="body" weight="medium">
            Число месяца
          </Txt>
          <View style={styles.stepper}>
            <Touchable onPress={() => setDay((d) => Math.max(1, d - 1))} style={styles.stepBtn} hitSlop={8}>
              <Ionicons name="remove" size={20} color={palette.text} />
            </Touchable>
            <Txt variant="subtitle" weight="bold" style={{ minWidth: 32, textAlign: 'center' }}>
              {day}
            </Txt>
            <Touchable onPress={() => setDay((d) => Math.min(31, d + 1))} style={styles.stepBtn} hitSlop={8}>
              <Ionicons name="add" size={20} color={palette.text} />
            </Touchable>
          </View>
        </View>

        {kind === 'expense' && (
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Txt variant="body" weight="medium">Это платёж по кредиту</Txt>
              <Txt variant="caption" color={palette.textMuted}>Учтём отдельно в разделе долгов</Txt>
            </View>
            <Switch value={isCredit} onValueChange={setIsCredit} trackColor={{ true: palette.credit }} />
          </View>
        )}

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Txt variant="body" weight="medium">Напоминать</Txt>
            <Txt variant="caption" color={palette.textMuted}>
              {remind ? 'Уведомление придёт в 10:00' : 'Уведомлений не будет'}
            </Txt>
          </View>
          <Switch value={remind} onValueChange={setRemind} trackColor={{ true: palette.accent }} />
        </View>

        {remind && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: spacing.md }}
          >
            {REMIND_OPTIONS.map((o) => {
              const active = remindDays === o.days;
              return (
                <Touchable
                  key={o.days}
                  onPress={() => setRemindDays(o.days)}
                  style={[
                    styles.remindChip,
                    active && { backgroundColor: palette.accentSoft, borderColor: palette.accent },
                  ]}
                >
                  <Txt
                    variant="caption"
                    weight="semibold"
                    color={active ? palette.accent : palette.textMuted}
                  >
                    {o.label}
                  </Txt>
                </Touchable>
              );
            })}
          </ScrollView>
        )}

        <Txt variant="caption" color={palette.textMuted} style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>
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
                <Txt variant="caption" color={active ? palette.text : palette.textMuted} numberOfLines={1} style={{ marginTop: 6 }}>
                  {c.name}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Сохранить" onPress={save} disabled={!canSave} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  segment: {
    flexDirection: 'row', marginHorizontal: spacing.lg, backgroundColor: palette.surface,
    borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: palette.border,
  },
  segmentBtn: { flex: 1, height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: palette.accent },
  input: {
    backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: spacing.lg, height: 54, color: palette.text, fontSize: font.size.body,
    marginTop: spacing.md,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  dayCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.md,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 36, height: 36, borderRadius: radius.sm, backgroundColor: palette.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.md,
  },
  remindChip: {
    paddingHorizontal: spacing.lg, height: 38, justifyContent: 'center',
    borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface, marginRight: spacing.sm,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  catItem: {
    width: '31%', alignItems: 'center', paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent',
  },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
