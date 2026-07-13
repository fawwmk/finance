import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Txt, Touchable } from './ui';
import { palette, spacing, radius } from '../theme/theme';
import { useStore } from '../store/useStore';
import { CurrencyCode } from '../types';
import { formatRate, CURRENCY_SYMBOL } from '../utils/format';

/** Какие валюты показываем в строке курсов (кроме базовой). */
const SHOW: CurrencyCode[] = ['USD', 'EUR', 'KGS'];

/**
 * Строка курсов ЦБ РФ. Обновляется автоматически (не чаще раза в 6 часов),
 * по тапу — принудительно.
 */
export function RatesStrip() {
  const { rates, ratesLoading, refreshRates, settings } = useStore();
  const base = settings.baseCurrency;

  useEffect(() => {
    refreshRates();
  }, [base, settings.rateSource, settings.cashMode]);

  const list = SHOW.filter((c) => c !== base);

  return (
    <Touchable onPress={() => refreshRates(true)} style={styles.wrap}>
      {list.map((code) => {
        const isBank = rates?.source === 'aiyl';

        // У банка полезнее не «сколько стоит по справочнику», а «почём реально купить».
        const value = isBank ? rates?.buy?.[code] : rates?.rates?.[code];

        const delta = rates?.delta?.[code] ?? 0;
        const up = delta > 0;
        const flat = Math.abs(delta) < 0.005;

        return (
          <View key={code} style={styles.item}>
            <View style={styles.badge}>
              <Txt variant="caption" weight="bold" color={palette.textMuted}>
                {CURRENCY_SYMBOL[code]}
              </Txt>
            </View>
            <View>
              <Txt variant="body" weight="semibold">
                {value != null ? formatRate(value, base) : '—'}
              </Txt>

              {value != null &&
                (isBank ? (
                  <Txt variant="caption" color={palette.textFaint}>
                    купить
                  </Txt>
                ) : (
                  <View style={styles.deltaRow}>
                    {!flat && (
                      <Ionicons
                        name={up ? 'caret-up' : 'caret-down'}
                        size={10}
                        color={up ? palette.expense : palette.income}
                      />
                    )}
                    <Txt
                      variant="caption"
                      color={flat ? palette.textFaint : up ? palette.expense : palette.income}
                    >
                      {flat ? 'без изменений' : Math.abs(delta).toFixed(2).replace('.', ',')}
                    </Txt>
                  </View>
                ))}
            </View>
          </View>
        );
      })}

      <View style={styles.refresh}>
        {ratesLoading ? (
          <ActivityIndicator size="small" color={palette.textFaint} />
        ) : (
          <Ionicons name="refresh" size={14} color={palette.textFaint} />
        )}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  refresh: { marginLeft: 'auto' },
});
