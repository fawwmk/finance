import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Card, Txt, Button, Touchable } from '../components/ui';
import { palette, spacing, radius, font } from '../theme/theme';
import { useStore } from '../store/useStore';
import { walletBalances } from '../store/selectors';
import { CurrencyCode } from '../types';
import {
  CURRENCY_SYMBOL,
  ALL_CURRENCIES,
  formatMoney,
  formatDate,
  todayISO,
} from '../utils/format';

/**
 * Обмен валюты.
 *
 * Здесь и есть точный учёт. Ни один опубликованный курс — ни ЦБ, ни банковский —
 * не скажет, сколько ты получил НА САМОМ ДЕЛЕ: там спред, комиссия, округление,
 * курс «до 1000 долларов». А две цифры — «отдал» и «получил» — врать не умеют.
 * Из них считается настоящий курс сделки.
 */
export function ExchangeScreen({ navigation }: any) {
  const { exchanges, addExchange, deleteExchange, transactions, settings, rates } = useStore();

  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>(settings.baseCurrency);
  const [toCurrency, setToCurrency] = useState<CurrencyCode>('EUR');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [place, setPlace] = useState('');

  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;
  const from = num(fromAmount);
  const to = num(toAmount);

  /**
   * Что лежит в кошельках сейчас — и что там окажется после обмена.
   * Обмен не создаёт денег: он перекладывает их из одной валюты в другую.
   */
  const wallets = useMemo(
    () => walletBalances(transactions, exchanges),
    [transactions, exchanges]
  );
  const haveFrom = wallets[fromCurrency] ?? 0;
  const haveTo = wallets[toCurrency] ?? 0;

  /** Не хватает того, что собираешься менять. Не запрещаем — предупреждаем. */
  const notEnough = from > 0 && from > haveFrom;

  /** Фактический курс сделки: сколько отдал за одну единицу полученной валюты. */
  const actualRate = to > 0 ? from / to : 0;

  /** Что говорил справочный курс — чтобы увидеть, сколько съел спред. */
  const marketRate = useMemo(() => {
    const f = rates?.rates?.[fromCurrency];
    const t = rates?.rates?.[toCurrency];
    if (!f || !t) return 0;
    return t / f; // сколько единиц from за 1 единицу to
  }, [rates, fromCurrency, toCurrency]);

  /** Насколько сделка вышла хуже (или лучше) справочного курса. */
  const spread = marketRate > 0 && actualRate > 0 ? (actualRate / marketRate - 1) * 100 : 0;

  /** Переплата в валюте, которую отдавал. */
  const overpaid = marketRate > 0 && to > 0 ? from - marketRate * to : 0;

  const valid = from > 0 && to > 0 && fromCurrency !== toCurrency;

  const swap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  const save = () => {
    if (!valid) return;
    addExchange({
      date: todayISO(),
      fromCurrency,
      fromAmount: from,
      toCurrency,
      toAmount: to,
      place: place.trim() || undefined,
    });
    setFromAmount('');
    setToAmount('');
    setPlace('');
  };

  const confirmDelete = (id: string) =>
    Alert.alert('Удалить запись об обмене?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteExchange(id) },
    ]);

  return (
    <Screen>
      <View style={styles.header}>
        <Touchable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={palette.text} />
        </Touchable>
        <Txt variant="title" weight="bold">
          Обмен валюты
        </Txt>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Txt variant="body" color={palette.textMuted}>
            Впиши, сколько отдал и сколько получил на руки. Настоящий курс сделки посчитаю
            сам — со всеми спредами и комиссиями, которые в опубликованный курс не входят.
            Деньги переедут из одного кошелька в другой.
          </Txt>

          {/*
            Что станет с кошельками. Обмен — это перекладывание: из одной валюты
            ушло, в другой прибавилось. Показываем обе стороны сразу, чтобы было
            видно, хватает ли того, что меняешь, и сколько получится в итоге.
          */}
          {(from > 0 || to > 0) && (
            <Card style={{ marginTop: spacing.lg }}>
              <Txt variant="caption" color={palette.textMuted} weight="semibold">
                СТАНЕТ В КОШЕЛЬКАХ
              </Txt>

              <View style={[styles.between, { marginTop: spacing.md }]}>
                <Txt variant="body" color={palette.textMuted}>
                  {fromCurrency}
                </Txt>
                <Txt variant="body">
                  <Txt variant="body" color={palette.textFaint}>
                    {formatMoney(haveFrom, fromCurrency)} →{' '}
                  </Txt>
                  <Txt
                    variant="body"
                    weight="semibold"
                    color={haveFrom - from < 0 ? palette.expense : palette.text}
                  >
                    {formatMoney(haveFrom - from, fromCurrency)}
                  </Txt>
                </Txt>
              </View>

              <View style={[styles.between, { marginTop: 6 }]}>
                <Txt variant="body" color={palette.textMuted}>
                  {toCurrency}
                </Txt>
                <Txt variant="body">
                  <Txt variant="body" color={palette.textFaint}>
                    {formatMoney(haveTo, toCurrency)} →{' '}
                  </Txt>
                  <Txt variant="body" weight="semibold" color={palette.income}>
                    {formatMoney(haveTo + to, toCurrency)}
                  </Txt>
                </Txt>
              </View>

              {notEnough && (
                <Txt variant="caption" color={palette.expense} style={{ marginTop: spacing.sm }}>
                  В кошельке {fromCurrency} лежит только {formatMoney(haveFrom, fromCurrency)}.
                  Запись сохраню, но кошелёк уйдёт в минус — проверь, всё ли внесено.
                </Txt>
              )}
            </Card>
          )}

          {/* Отдал */}
          <Label>Отдал</Label>
          <Card>
            <View style={styles.amountRow}>
              <TextInput
                value={fromAmount}
                onChangeText={(t) => setFromAmount(t.replace(/[^0-9.,]/g, ''))}
                placeholder="0"
                placeholderTextColor={palette.textFaint}
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
              <Txt variant="title" weight="bold" color={palette.textMuted}>
                {CURRENCY_SYMBOL[fromCurrency]}
              </Txt>
            </View>
            <CurrencyRow selected={fromCurrency} onSelect={setFromCurrency} />
          </Card>

          {/* Поменять местами */}
          <Touchable onPress={swap} style={styles.swapBtn}>
            <Ionicons name="swap-vertical" size={20} color={palette.accent} />
          </Touchable>

          {/* Получил */}
          <Label>Получил на руки</Label>
          <Card>
            <View style={styles.amountRow}>
              <TextInput
                value={toAmount}
                onChangeText={(t) => setToAmount(t.replace(/[^0-9.,]/g, ''))}
                placeholder="0"
                placeholderTextColor={palette.textFaint}
                keyboardType="decimal-pad"
                style={[styles.amountInput, { color: palette.income }]}
              />
              <Txt variant="title" weight="bold" color={palette.textMuted}>
                {CURRENCY_SYMBOL[toCurrency]}
              </Txt>
            </View>
            <CurrencyRow selected={toCurrency} onSelect={setToCurrency} />
          </Card>

          <TextInput
            value={place}
            onChangeText={setPlace}
            placeholder="Где менял (например, Айыл Банк)"
            placeholderTextColor={palette.textFaint}
            style={styles.input}
          />

          {/* Настоящий курс сделки */}
          {valid && (
            <Card style={{ marginTop: spacing.lg, borderColor: palette.accent + '55' }}>
              <Txt variant="caption" color={palette.textMuted}>
                Твой настоящий курс
              </Txt>
              <Txt variant="title" weight="bold" style={{ marginTop: 2 }}>
                1 {toCurrency} = {actualRate.toFixed(2).replace('.', ',')}{' '}
                {CURRENCY_SYMBOL[fromCurrency]}
              </Txt>

              {marketRate > 0 && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.between}>
                    <Txt variant="body" color={palette.textMuted}>
                      Справочный ({rates?.source === 'aiyl' ? 'Айыл Банк' : 'ЦБ РФ'})
                    </Txt>
                    <Txt variant="body" weight="semibold">
                      {marketRate.toFixed(2).replace('.', ',')} {CURRENCY_SYMBOL[fromCurrency]}
                    </Txt>
                  </View>

                  <View style={[styles.between, { marginTop: spacing.sm }]}>
                    <Txt variant="body" color={palette.textMuted}>
                      {spread >= 0 ? 'Потерял на спреде' : 'Выгадал'}
                    </Txt>
                    <Txt
                      variant="body"
                      weight="bold"
                      color={spread >= 0 ? palette.expense : palette.income}
                    >
                      {spread >= 0 ? '−' : '+'}
                      {formatMoney(Math.abs(overpaid), fromCurrency)} (
                      {Math.abs(spread).toFixed(1).replace('.', ',')}%)
                    </Txt>
                  </View>
                </>
              )}
            </Card>
          )}

          <Button
            title="Записать обмен"
            onPress={save}
            disabled={!valid}
            style={{ marginTop: spacing.lg }}
          />

          {/* История */}
          {exchanges.length > 0 && (
            <>
              <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.xxl }}>
                История обменов
              </Txt>
              {exchanges.map((e) => (
                <Pressable key={e.id} onLongPress={() => confirmDelete(e.id)} delayLongPress={350}>
                  <Card style={{ marginTop: spacing.sm }}>
                    <View style={styles.between}>
                      <Txt variant="body" weight="semibold">
                        {formatMoney(e.fromAmount, e.fromCurrency)} →{' '}
                        {formatMoney(e.toAmount, e.toCurrency)}
                      </Txt>
                      <Txt variant="caption" color={palette.textFaint}>
                        {formatDate(e.date)}
                      </Txt>
                    </View>
                    <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 4 }}>
                      Курс {e.rate.toFixed(2).replace('.', ',')} {CURRENCY_SYMBOL[e.fromCurrency]}{' '}
                      за 1 {e.toCurrency}
                      {e.place ? ` · ${e.place}` : ''}
                    </Txt>
                  </Card>
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function CurrencyRow({
  selected,
  onSelect,
}: {
  selected: CurrencyCode;
  onSelect: (c: CurrencyCode) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm }}
      style={{ marginTop: spacing.md }}
    >
      {ALL_CURRENCIES.map((c) => {
        const active = selected === c;
        return (
          <Touchable
            key={c}
            onPress={() => onSelect(c)}
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
              {c}
            </Txt>
          </Touchable>
        );
      })}
    </ScrollView>
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
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  amountInput: {
    flex: 1,
    fontSize: font.size.display,
    fontWeight: font.weight.bold as any,
    color: palette.text,
    padding: 0,
  },
  swapBtn: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: -spacing.sm,
    zIndex: 1,
  },
  curChip: {
    paddingHorizontal: spacing.md,
    height: 34,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceElevated,
  },
  input: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    marginTop: spacing.lg,
    color: palette.text,
    fontSize: font.size.body,
  },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: spacing.md },
});
