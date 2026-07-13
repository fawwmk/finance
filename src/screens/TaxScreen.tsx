import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { refreshTaxConfig, taxSource } from '../services/taxConfig';

import { Screen, Card, Txt, Button, Touchable } from '../components/ui';
import { palette, spacing, radius, font } from '../theme/theme';
import { useStore } from '../store/useStore';
import { activityById } from '../data/tax';
import {
  annualBurden,
  taxCalendar,
  salaryBreakdown,
  compareRegimes,
} from '../utils/tax';
import {
  taxYearIncome,
  taxYearExpenses,
  npdBonusUsed,
  monthTotals,
} from '../store/selectors';
import { formatMoney, formatDate, daysUntil } from '../utils/format';
import { TaxStatus } from '../types';

const STATUS_NAME: Record<TaxStatus, string> = {
  employee: 'Работаю по найму',
  unofficial: 'Работаю без оформления',
  npd: 'Самозанятый',
  ip_usn_income: 'ИП, УСН «Доходы»',
  ip_usn_profit: 'ИП, УСН «Доходы − расходы»',
  ip_psn: 'ИП на патенте',
  ip_osno: 'ИП на ОСНО',
};

export function TaxScreen({ navigation }: any) {
  const {
    taxProfile,
    taxSetAside,
    setTaxAside,
    resetTaxAside,
    transactions,
    settings,
    rates,
  } = useStore();

  const [topUp, setTopUp] = useState('');
  const [checking, setChecking] = useState(false);
  const [src, setSrc] = useState(taxSource());

  const base = settings.baseCurrency;
  const year = new Date().getFullYear();

  const checkRates = async () => {
    setChecking(true);
    const updated = await refreshTaxConfig(true);
    setSrc(taxSource());
    setChecking(false);
    Alert.alert(
      updated ? 'Ставки обновлены' : 'Уже актуальны',
      updated
        ? 'Подтянул свежие ставки — все расчёты пересчитаны.'
        : 'Новее ничего нет. Считаю по ставкам от ' + src.updatedAt + '.'
    );
  };

  const income = useMemo(
    () => taxYearIncome(transactions, base, rates, year),
    [transactions, base, rates, year]
  );
  const expenses = useMemo(
    () => taxYearExpenses(transactions, base, rates, year),
    [transactions, base, rates, year]
  );
  const bonusUsed = useMemo(() => npdBonusUsed(transactions), [transactions]);

  /* ── Профиль ещё не настроен ── */
  if (!taxProfile) {
    return (
      <Screen>
        <Header title="Налоги" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <View style={styles.bigIcon}>
            <Ionicons name="receipt-outline" size={40} color={palette.accent} />
          </View>
          <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.lg }}>
            Настрой налоги
          </Txt>
          <Txt
            variant="body"
            color={palette.textMuted}
            style={{ marginTop: 8, textAlign: 'center', paddingHorizontal: spacing.lg }}
          >
            Скажи, как ты оформлен — самозанятый, ИП или по найму. Дальше при каждом
            поступлении буду сразу говорить, сколько отложить на налоги.
          </Txt>
          <Button
            title="Настроить"
            onPress={() => navigation.navigate('TaxSetup')}
            style={{ marginTop: spacing.xl, paddingHorizontal: spacing.xxl }}
          />
        </View>
      </Screen>
    );
  }

  const profile = { ...taxProfile, npdBonusUsed: bonusUsed };

  /**
   * Взносы за работников платятся ежемесячно — поэтому «должен на сегодня»
   * считаем по прошедшим месяцам, а не за весь год вперёд.
   */
  const monthsElapsed = new Date().getMonth() + 1;
  const burden = annualBurden(profile, income, expenses, monthsElapsed);
  const yearBurden = annualBurden(profile, income, expenses, 12);

  const calendar = taxCalendar(profile, income, expenses, year);
  const activity = activityById(profile.activityId);

  const needed = burden.total;
  const gap = Math.max(0, needed - taxSetAside);
  const progress = needed > 0 ? Math.min(1, taxSetAside / needed) : 1;

  const isEmployee = profile.status === 'employee';

  const addToPot = () => {
    const sum = parseFloat(topUp.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    if (sum <= 0) return;
    setTaxAside(sum);
    setTopUp('');
  };

  const confirmPaid = () =>
    Alert.alert(
      'Налог уплачен?',
      'Обнулю копилку — начнём копить заново с нуля.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Уплачено', onPress: resetTaxAside },
      ]
    );

  /* ── Зарплата: откладывать нечего, показываем разбор ── */
  const monthIncome = monthTotals(transactions, base, rates).income;
  const salary = isEmployee ? salaryBreakdown(monthIncome, profile.resident) : null;

  const regimes =
    !isEmployee && income > 0
      ? compareRegimes(
          profile,
          income,
          expenses,
          activity?.npdAllowed ?? true,
          activity?.psnAllowed ?? false
        )
      : [];

  return (
    <Screen>
      <Header
        title="Налоги"
        onBack={() => navigation.goBack()}
        onEdit={() => navigation.navigate('TaxSetup')}
      />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Статус */}
        <Card style={styles.rowCenter}>
          <Ionicons name="shield-checkmark" size={20} color={palette.accent} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Txt variant="body" weight="semibold">
              {STATUS_NAME[profile.status]}
            </Txt>
            <Txt variant="caption" color={palette.textMuted}>
              {profile.resident ? 'Резидент РФ' : 'Нерезидент'}
              {activity ? ` · ${activity.name}` : ''}
            </Txt>
          </View>
        </Card>

        {/* Работа без оформления: честная картина, без нравоучений */}
        {profile.status === 'unofficial' && (
          <Card style={{ marginTop: spacing.md, borderColor: palette.warning + '55' }}>
            <Txt variant="body" weight="semibold">
              За тебя никто не платит налог
            </Txt>
            <Txt variant="body" color={palette.textMuted} style={{ marginTop: spacing.sm }}>
              Деньги приходят на карту как есть — налогового агента нет. Но доход остаётся
              облагаемым: по закону его декларируют сами, 3-НДФЛ до 30 апреля, налог до 15 июля.
            </Txt>

            <View style={styles.divider} />

            <Txt variant="caption" color={palette.textMuted} weight="semibold">
              ЧЕГО У ТЕБЯ ПРИ ЭТОМ НЕТ
            </Txt>
            <View style={{ marginTop: spacing.sm, gap: 6 }}>
              <Missing>Пенсионный стаж не идёт — эти годы в стаж не зачтутся</Missing>
              <Missing>Больничных и отпускных нет</Missing>
              <Missing>Справку о доходах не получить: ипотека, виза, кредит</Missing>
              <Missing>Не заплатят — доказать нечем, договора нет</Missing>
            </View>

            <View style={styles.divider} />

            <Txt variant="body" weight="semibold" color={palette.income}>
              Самозанятость — 4–6% вместо 13%
            </Txt>
            <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 4 }}>
              Оформляется за 10 минут в приложении «Мой налог», работать можно ровно как
              работаешь. Ниже — сравнение на твоих реальных цифрах.
            </Txt>
            <Touchable onPress={() => Linking.openURL('https://npd.nalog.ru')}>
              <Txt variant="caption" color={palette.accent} style={{ marginTop: spacing.md }}>
                Как стать самозанятым — npd.nalog.ru →
              </Txt>
            </Touchable>
          </Card>
        )}

        {isEmployee && salary ? (
          /* ─── НАЁМНЫЙ РАБОТНИК ─── */
          <>
            <Card style={{ marginTop: spacing.md }}>
              <Txt variant="body" weight="semibold">
                Откладывать не нужно
              </Txt>
              <Txt variant="body" color={palette.textMuted} style={{ marginTop: spacing.sm }}>
                НДФЛ с зарплаты удерживает работодатель — деньги приходят к тебе уже чистыми.
              </Txt>
            </Card>

            <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.xxl }}>
              Если {formatMoney(monthIncome, base)} — это «грязными»
            </Txt>
            <Card style={{ marginTop: spacing.md }}>
              <Row label="Начислено" value={formatMoney(salary.gross, base)} />
              <Row
                label={`НДФЛ (${profile.resident ? 'прогрессия 13–22%' : '30%, нерезидент'})`}
                value={`− ${formatMoney(salary.ndfl, base)}`}
                color={palette.expense}
              />
              <View style={styles.divider} />
              <Row
                label="На руки"
                value={formatMoney(salary.net, base)}
                color={palette.income}
                bold
              />
              <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
                Эффективная ставка {(salary.effectiveRate * 100).toFixed(1).replace('.', ',')}%.
                {profile.resident
                  ? ' Прогрессия бьёт только по части дохода сверх ступени, а не по всей сумме.'
                  : ''}
              </Txt>
            </Card>

            {!profile.resident && (
              <Card style={{ marginTop: spacing.md, borderColor: palette.warning + '55' }}>
                <Txt variant="caption" color={palette.warning}>
                  ⚠️ Как нерезидент ты платишь 30% и не имеешь права на вычеты — ни на детей, ни
                  на лечение, ни на ипотеку.
                </Txt>
              </Card>
            )}
          </>
        ) : (
          /* ─── САМОЗАНЯТЫЙ / ИП ─── */
          <>
            {/* Главная карточка: сколько отложить */}
            <Card
              style={{
                marginTop: spacing.md,
                borderColor: gap > 0 ? palette.warning + '55' : palette.income + '55',
              }}
            >
              <Txt variant="caption" color={palette.textMuted}>
                {gap > 0 ? 'Нужно ещё отложить' : 'Отложено достаточно'}
              </Txt>
              <Txt
                variant="hero"
                weight="bold"
                color={gap > 0 ? palette.warning : palette.income}
                style={{ marginTop: 2 }}
              >
                {formatMoney(gap, base)}
              </Txt>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor: gap > 0 ? palette.warning : palette.income,
                    },
                  ]}
                />
              </View>
              <View style={[styles.between, { marginTop: spacing.sm }]}>
                <Txt variant="caption" color={palette.textMuted}>
                  В копилке {formatMoney(taxSetAside, base)}
                </Txt>
                <Txt variant="caption" color={palette.textFaint}>
                  из {formatMoney(needed, base)}
                </Txt>
              </View>
            </Card>

            {/* Пополнить копилку */}
            <Card style={{ marginTop: spacing.md }}>
              <Txt variant="caption" color={palette.textMuted} weight="semibold">
                НАЛОГОВАЯ КОПИЛКА
              </Txt>
              <View style={[styles.rowCenter, { marginTop: spacing.md, gap: spacing.sm }]}>
                <TextInput
                  value={topUp}
                  onChangeText={setTopUp}
                  placeholder={gap > 0 ? String(Math.round(gap)) : '0'}
                  placeholderTextColor={palette.textFaint}
                  keyboardType="decimal-pad"
                  style={[styles.input, { flex: 1 }]}
                />
                <Touchable onPress={addToPot} style={styles.potBtn}>
                  <Ionicons name="add" size={22} color={palette.white} />
                </Touchable>
              </View>

              <View style={[styles.between, { marginTop: spacing.md }]}>
                <Touchable onPress={() => setTaxAside(-taxSetAside)}>
                  <Txt variant="caption" color={palette.textFaint}>
                    Сбросить
                  </Txt>
                </Touchable>
                <Touchable onPress={confirmPaid}>
                  <Txt variant="caption" color={palette.accent} weight="semibold">
                    Налог уплачен →
                  </Txt>
                </Touchable>
              </View>
            </Card>

            {/* Разбор */}
            <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.xxl }}>
              Из чего складывается
            </Txt>
            <Card style={{ marginTop: spacing.md }}>
              <Row label={`Доход с начала ${year} года`} value={formatMoney(income, base)} />
              {profile.status === 'ip_usn_profit' && (
                <Row label="Расходы (подтверждённые)" value={formatMoney(expenses, base)} />
              )}
              <View style={styles.divider} />

              <Row label="Налог начислен" value={formatMoney(burden.taxGross, base)} />
              {burden.reducedBy > 0 && (
                <Row
                  label="Уменьшен на взносы"
                  value={`− ${formatMoney(burden.reducedBy, base)}`}
                  color={palette.income}
                />
              )}
              <Row label="Налог к уплате" value={formatMoney(burden.taxPayable, base)} />

              {burden.contributions.total > 0 && (
                <>
                  <View style={styles.divider} />
                  <Row
                    label="Взносы «за себя» (фиксированные)"
                    value={formatMoney(burden.contributions.fixed, base)}
                  />
                  {burden.contributions.extra > 0 && (
                    <Row
                      label="Взносы 1% свыше 300 000 ₽"
                      value={formatMoney(burden.contributions.extra, base)}
                    />
                  )}
                  {burden.contributions.employees > 0 && (
                    <Row
                      label={`Взносы за работников (${monthsElapsed} мес.)`}
                      value={formatMoney(burden.contributions.employees, base)}
                    />
                  )}
                  {burden.contributions.injury > 0 && (
                    <Row
                      label="Взносы на травматизм"
                      value={formatMoney(burden.contributions.injury, base)}
                    />
                  )}
                  {burden.contributions.voluntary > 0 && (
                    <Row
                      label="Добровольные взносы в СФР"
                      value={formatMoney(burden.contributions.voluntary, base)}
                    />
                  )}
                </>
              )}

              <View style={styles.divider} />
              <Row label="Должен на сегодня" value={formatMoney(needed, base)} bold />
              {yearBurden.total > needed && (
                <Row
                  label="Прогноз до конца года"
                  value={formatMoney(yearBurden.total, base)}
                  color={palette.textMuted}
                />
              )}
              <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
                Эффективная ставка{' '}
                {(burden.effectiveRate * 100).toFixed(1).replace('.', ',')}% от дохода.
                {burden.contributions.employees > 0
                  ? ' Взносы за работников растут каждый месяц — поэтому «должен на сегодня» меньше годового прогноза.'
                  : ''}
              </Txt>
            </Card>

            {/* Бонус самозанятого */}
            {profile.status === 'npd' && bonusUsed < 10_000 && (
              <Card style={{ marginTop: spacing.md, borderColor: palette.income + '55' }}>
                <Txt variant="body" weight="semibold" color={palette.income}>
                  Налоговый бонус: осталось {formatMoney(10_000 - bonusUsed, base)}
                </Txt>
                <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 4 }}>
                  Пока он не кончился, ты платишь 3% вместо 4% и 4% вместо 6%. Даётся один раз
                  на всю жизнь.
                </Txt>
              </Card>
            )}

            {/* Предупреждения */}
            {burden.warnings.map((w, i) => (
              <Card key={i} style={{ marginTop: spacing.md, borderColor: palette.warning + '55' }}>
                <Txt variant="caption" color={palette.warning}>
                  ⚠️ {w}
                </Txt>
              </Card>
            ))}

            {/* Календарь */}
            {calendar.length > 0 && (
              <>
                <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.xxl }}>
                  Когда платить
                </Txt>
                {calendar.map((d, i) => {
                  const left = daysUntil(d.date);
                  const past = left < 0;
                  return (
                    <Card key={i} style={[styles.rowCenter, { marginTop: spacing.sm }]}>
                      <Ionicons
                        name={d.kind === 'contributions' ? 'shield-outline' : 'cash-outline'}
                        size={18}
                        color={past ? palette.textFaint : palette.accent}
                      />
                      <View style={{ flex: 1, marginLeft: spacing.md }}>
                        <Txt variant="body" color={past ? palette.textFaint : palette.text}>
                          {d.label}
                        </Txt>
                        <Txt variant="caption" color={palette.textMuted}>
                          {formatDate(d.date)}
                          {past ? ' · прошло' : left === 0 ? ' · сегодня' : ` · через ${left} дн.`}
                        </Txt>
                      </View>
                      {d.amount != null && (
                        <Txt variant="body" weight="semibold" color={past ? palette.textFaint : undefined}>
                          {formatMoney(d.amount, base)}
                        </Txt>
                      )}
                    </Card>
                  );
                })}
              </>
            )}

            {/* Источник ставок */}
            <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.xxl }}>
              Откуда цифры
            </Txt>
            <Card style={{ marginTop: spacing.md, borderColor: src.stale ? palette.warning + '55' : palette.border }}>
              <View style={styles.between}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Txt variant="body" weight="semibold">
                    Ставки {src.year} года
                  </Txt>
                  <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                    Обновлены {src.updatedAt}
                    {src.fromRemote ? ' · загружены из сети' : ' · встроенные в приложение'}
                  </Txt>
                </View>
                <Touchable onPress={checkRates} style={styles.refreshBtn}>
                  {checking ? (
                    <ActivityIndicator size="small" color={palette.accent} />
                  ) : (
                    <Ionicons name="refresh" size={18} color={palette.accent} />
                  )}
                </Touchable>
              </View>

              <View style={styles.divider} />

              <Txt variant="caption" color={palette.textFaint}>
                {src.source}
              </Txt>

              {src.stale && (
                <Txt variant="caption" color={palette.warning} style={{ marginTop: spacing.sm }}>
                  ⚠️ Ставкам больше полугода. Проверь актуальность — законы меняются.
                </Txt>
              )}

              <Touchable onPress={() => Linking.openURL('https://www.nalog.gov.ru')}>
                <Txt variant="caption" color={palette.accent} style={{ marginTop: spacing.md }}>
                  Сверить на nalog.gov.ru →
                </Txt>
              </Touchable>
            </Card>

            {/* Сравнение режимов */}
            {regimes.length > 1 && (
              <>
                <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.xxl }}>
                  А что выгоднее?
                </Txt>
                <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 4 }}>
                  При твоём доходе {formatMoney(income, base)} за год
                </Txt>

                {regimes.map((r) => {
                  const current = r.status === profile.status;
                  return (
                    <Card
                      key={r.status}
                      style={[
                        styles.rowCenter,
                        { marginTop: spacing.sm },
                        current && { borderColor: palette.accent },
                        !r.available && { opacity: 0.45 },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Txt variant="body" weight={current ? 'bold' : 'medium'}>
                          {r.name}
                          {current ? ' · сейчас' : ''}
                        </Txt>
                        <Txt variant="caption" color={palette.textMuted}>
                          {r.available
                            ? `${(r.effectiveRate * 100).toFixed(1).replace('.', ',')}% от дохода`
                            : r.reason}
                        </Txt>
                      </View>
                      <Txt
                        variant="body"
                        weight="semibold"
                        color={r.available ? undefined : palette.textFaint}
                      >
                        {formatMoney(r.total, base)}
                      </Txt>
                    </Card>
                  );
                })}

                <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.md }}>
                  Прикидка «в лоб», по одним только ставкам. Смена режима — это ещё и отчётность,
                  кассы, лимиты и сроки перехода. Прежде чем прыгать, посоветуйся с бухгалтером.
                </Txt>
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Header({
  title,
  onBack,
  onEdit,
}: {
  title: string;
  onBack: () => void;
  onEdit?: () => void;
}) {
  return (
    <View style={styles.header}>
      <Touchable onPress={onBack} style={styles.iconBtn}>
        <Ionicons name="chevron-back" size={22} color={palette.text} />
      </Touchable>
      <Txt variant="title" weight="bold">
        {title}
      </Txt>
      {onEdit ? (
        <Touchable onPress={onEdit} style={styles.iconBtn}>
          <Ionicons name="settings-outline" size={20} color={palette.text} />
        </Touchable>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Ionicons name="close" size={14} color={palette.expense} style={{ marginTop: 2 }} />
      <Txt variant="caption" color={palette.textMuted} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

function Row({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}) {
  return (
    <View style={[styles.between, { marginBottom: spacing.sm }]}>
      <Txt variant="body" color={palette.textMuted} style={{ flex: 1, paddingRight: spacing.md }}>
        {label}
      </Txt>
      <Txt variant={bold ? 'subtitle' : 'body'} weight={bold ? 'bold' : 'semibold'} color={color}>
        {value}
      </Txt>
    </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  bigIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: spacing.md },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.surfaceElevated,
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3 },
  input: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    color: palette.text,
    fontSize: font.size.subtitle,
  },
  potBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
