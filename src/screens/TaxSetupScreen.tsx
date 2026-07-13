import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, TextInput, Switch, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Card, Txt, Button, Touchable } from '../components/ui';
import { palette, spacing, radius, font } from '../theme/theme';
import { useStore } from '../store/useStore';
import {
  ACTIVITIES,
  activityById,
  USN,
  IP_CONTRIBUTIONS,
  NPD,
  PAYROLL,
  voluntarySfrAmount,
} from '../data/tax';
import { employeeContributions } from '../utils/tax';
import { formatMoney } from '../utils/format';
import { TaxStatus } from '../types';

const STATUSES: { id: TaxStatus; name: string; hint: string; icon: string }[] = [
  { id: 'employee', name: 'Работаю по найму', hint: 'НДФЛ удерживает работодатель', icon: 'briefcase' },
  {
    id: 'unofficial',
    name: 'Работаю без оформления',
    hint: 'зарплата на карту, налог никто не платит',
    icon: 'eye-off',
  },
  { id: 'npd', name: 'Самозанятый', hint: '4% от физлиц, 6% от юрлиц', icon: 'person' },
  { id: 'ip_usn_income', name: 'ИП, УСН «Доходы»', hint: '6% с оборота', icon: 'trending-up' },
  { id: 'ip_usn_profit', name: 'ИП, УСН «Доходы − расходы»', hint: '15% с прибыли', icon: 'calculator' },
  { id: 'ip_psn', name: 'ИП на патенте', hint: 'фиксированная стоимость', icon: 'document-text' },
  { id: 'ip_osno', name: 'ИП на ОСНО', hint: 'НДФЛ + НДС', icon: 'business' },
];

export function TaxSetupScreen({ navigation }: any) {
  const { taxProfile, setTaxProfile } = useStore();

  const [status, setStatus] = useState<TaxStatus>(taxProfile?.status ?? 'npd');
  const [resident, setResident] = useState(taxProfile?.resident ?? true);
  const [activityId, setActivityId] = useState(taxProfile?.activityId ?? 'it');
  const [hasEmployees, setHasEmployees] = useState(taxProfile?.hasEmployees ?? false);
  const [usnRate, setUsnRate] = useState(
    taxProfile?.usnRatePercent != null ? String(taxProfile.usnRatePercent) : ''
  );
  const [patentCost, setPatentCost] = useState(
    taxProfile?.patentCost != null ? String(taxProfile.patentCost) : ''
  );
  const [employeeCount, setEmployeeCount] = useState(
    taxProfile?.employeeCount != null ? String(taxProfile.employeeCount) : ''
  );
  const [payroll, setPayroll] = useState(
    taxProfile?.payrollMonthly != null ? String(taxProfile.payrollMonthly) : ''
  );
  const [msme, setMsme] = useState(taxProfile?.msmeTariff ?? true);
  const [injury, setInjury] = useState(
    taxProfile?.injuryRatePercent != null ? String(taxProfile.injuryRatePercent) : '0.2'
  );
  const [voluntary, setVoluntary] = useState(taxProfile?.voluntarySfr ?? false);

  const activity = activityById(activityId);

  const num = (s: string) => parseFloat(s.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

  /** Живой расчёт взносов за работников — сколько это в год. */
  const empCost = useMemo(() => {
    if (!hasEmployees || !num(employeeCount) || !num(payroll)) return null;
    return employeeContributions(
      {
        status,
        resident,
        employeeCount: num(employeeCount),
        payrollMonthly: num(payroll),
        msmeTariff: msme,
        injuryRatePercent: num(injury),
      },
      12
    );
  }, [hasEmployees, employeeCount, payroll, msme, injury, status, resident]);
  const isIp = status.startsWith('ip_');
  const isUsn = status === 'ip_usn_income' || status === 'ip_usn_profit';
  const defaultRate = status === 'ip_usn_profit' ? USN.profitRate * 100 : USN.incomeRate * 100;

  /** Резидентство влияет только на НДФЛ — то есть на зарплату и ОСНО. */
  const residencyMatters =
    status === 'employee' || status === 'ip_osno' || status === 'unofficial';

  const npdBlocked = status === 'npd' && activity && !activity.npdAllowed;

  const save = () => {
    setTaxProfile({
      status,
      resident,
      activityId: status === 'employee' ? undefined : activityId,
      hasEmployees: isIp ? hasEmployees : undefined,
      employeeCount: isIp && hasEmployees ? num(employeeCount) : undefined,
      payrollMonthly: isIp && hasEmployees ? num(payroll) : undefined,
      msmeTariff: isIp && hasEmployees ? msme : undefined,
      injuryRatePercent: isIp && hasEmployees ? num(injury) : undefined,
      voluntarySfr: isIp ? voluntary : undefined,
      usnRatePercent: isUsn && usnRate ? num(usnRate) : undefined,
      patentCost: status === 'ip_psn' && patentCost ? num(patentCost) : undefined,
    });
    navigation.goBack();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Txt variant="title" weight="bold">
          Налоги
        </Txt>
        <Touchable onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={palette.textMuted} />
        </Touchable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Статус */}
        <Label>Как ты оформлен</Label>
        {STATUSES.map((s) => {
          const active = status === s.id;
          return (
            <Touchable key={s.id} onPress={() => setStatus(s.id)}>
              <Card
                style={[
                  styles.statusCard,
                  active && { borderColor: palette.accent, backgroundColor: palette.accentSoft },
                ]}
              >
                <Ionicons
                  name={s.icon as any}
                  size={20}
                  color={active ? palette.accent : palette.textMuted}
                />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Txt variant="body" weight="semibold">
                    {s.name}
                  </Txt>
                  <Txt variant="caption" color={palette.textMuted}>
                    {s.hint}
                  </Txt>
                </View>
                {active && <Ionicons name="checkmark-circle" size={20} color={palette.accent} />}
              </Card>
            </Touchable>
          );
        })}

        {/* Резидентство */}
        <Label>Налоговое резидентство</Label>
        <Card>
          <View style={styles.between}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Txt variant="body" weight="semibold">
                {resident ? 'Резидент РФ' : 'Нерезидент'}
              </Txt>
              <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                Резидент — провёл в России 183+ дня за последние 12 месяцев
              </Txt>
            </View>
            <Switch
              value={resident}
              onValueChange={setResident}
              trackColor={{ true: palette.accent, false: palette.border }}
            />
          </View>

          <View style={styles.divider} />

          {residencyMatters ? (
            <Txt variant="caption" color={resident ? palette.textMuted : palette.warning}>
              {resident
                ? 'НДФЛ по прогрессивной шкале: 13% до 2,4 млн ₽, дальше 15–22%. Вычеты доступны.'
                : '⚠️ Нерезидент платит НДФЛ 30% плоской ставкой. Вычеты (на детей, лечение, ипотеку) НЕ положены.'}
            </Txt>
          ) : (
            <Txt variant="caption" color={palette.textFaint}>
              На {status === 'npd' ? 'самозанятости' : 'этом режиме'} резидентство не влияет ни на
              что: ставки одинаковые и для резидентов, и для нерезидентов. Оно важно только для
              НДФЛ — то есть для зарплаты и ОСНО.
            </Txt>
          )}
        </Card>

        {/* Вид деятельности */}
        {status !== 'employee' && (
          <>
            <Label>Вид деятельности</Label>
            <View style={styles.chipGrid}>
              {ACTIVITIES.map((a) => {
                const active = activityId === a.id;
                return (
                  <Touchable
                    key={a.id}
                    onPress={() => setActivityId(a.id)}
                    style={[
                      styles.actChip,
                      active && { borderColor: palette.accent, backgroundColor: palette.accentSoft },
                    ]}
                  >
                    <Ionicons
                      name={a.icon as any}
                      size={14}
                      color={active ? palette.accent : palette.textFaint}
                    />
                    <Txt variant="caption" color={active ? palette.accent : palette.textMuted}>
                      {a.name}
                    </Txt>
                  </Touchable>
                );
              })}
            </View>

            {activity?.note && (
              <Card style={{ marginTop: spacing.md }}>
                <Txt
                  variant="caption"
                  color={activity.npdAllowed ? palette.textMuted : palette.expense}
                >
                  {activity.note}
                </Txt>
              </Card>
            )}

            {npdBlocked && (
              <Card style={{ marginTop: spacing.md, borderColor: palette.expense }}>
                <Txt variant="body" weight="semibold" color={palette.expense}>
                  Самозанятость тут не подойдёт
                </Txt>
                <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 4 }}>
                  «{activity!.name}» несовместим с НПД по закону. Выбери ИП — например, УСН
                  «Доходы» 6%.
                </Txt>
              </Card>
            )}
          </>
        )}

        {/* Настройки ИП */}
        {isIp && (
          <>
            <Label>Наёмные работники</Label>
            <Card style={styles.between}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Txt variant="body" weight="semibold">
                  {hasEmployees ? 'Есть работники' : 'Работаю один'}
                </Txt>
                <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                  {hasEmployees
                    ? 'Налог можно уменьшить на взносы максимум наполовину'
                    : 'Налог уменьшается на взносы полностью, вплоть до нуля'}
                </Txt>
              </View>
              <Switch
                value={hasEmployees}
                onValueChange={setHasEmployees}
                trackColor={{ true: palette.accent, false: palette.border }}
              />
            </Card>

            {hasEmployees && (
              <>
                <View style={[styles.row, { marginTop: spacing.md }]}>
                  <View style={{ flex: 1 }}>
                    <Label>Сколько человек</Label>
                    <TextInput
                      value={employeeCount}
                      onChangeText={setEmployeeCount}
                      placeholder="2"
                      placeholderTextColor={palette.textFaint}
                      keyboardType="number-pad"
                      style={styles.input}
                    />
                  </View>
                  <View style={{ flex: 1.6 }}>
                    <Label>Зарплата всем в месяц</Label>
                    <TextInput
                      value={payroll}
                      onChangeText={setPayroll}
                      placeholder="120 000"
                      placeholderTextColor={palette.textFaint}
                      keyboardType="decimal-pad"
                      style={styles.input}
                    />
                  </View>
                </View>
                <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
                  Фонд оплаты труда «грязными» — до удержания НДФЛ, на всех вместе.
                </Txt>

                <Label>Тариф взносов</Label>
                <Card style={styles.between}>
                  <View style={{ flex: 1, paddingRight: spacing.md }}>
                    <Txt variant="body" weight="semibold">
                      {msme ? 'Льготный тариф МСП' : 'Общий тариф 30%'}
                    </Txt>
                    <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                      {msme
                        ? `С выплат сверх ${PAYROLL.msmeThresholdMrots} МРОТ — 15% вместо 30%`
                        : '30% со всех выплат, сверх предельной базы — 15,1%'}
                    </Txt>
                  </View>
                  <Switch
                    value={msme}
                    onValueChange={setMsme}
                    trackColor={{ true: palette.accent, false: palette.border }}
                  />
                </Card>
                <Txt variant="caption" color={palette.warning} style={{ marginTop: spacing.sm }}>
                  ⚠️ Льготу МСП сужали по отраслям — проверь, попадаешь ли ты под неё.
                </Txt>

                <Label>Взносы на травматизм, %</Label>
                <TextInput
                  value={injury}
                  onChangeText={setInjury}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
                  От 0,2% (офис, IT) до 8,5% (опасное производство). Класс профриска
                  присваивает СФР по твоему основному ОКВЭД.
                </Txt>

                {empCost && (
                  <Card style={{ marginTop: spacing.md, borderColor: palette.credit + '55' }}>
                    <Txt variant="caption" color={palette.textMuted}>
                      Взносы за работников в год
                    </Txt>
                    <Txt
                      variant="title"
                      weight="bold"
                      color={palette.credit}
                      style={{ marginTop: 2 }}
                    >
                      {formatMoney(empCost.total, 'RUB')}
                    </Txt>
                    <View style={styles.divider} />
                    <Txt variant="caption" color={palette.textMuted}>
                      Единый тариф: {formatMoney(empCost.unified, 'RUB')} · травматизм:{' '}
                      {formatMoney(empCost.injury, 'RUB')}
                    </Txt>
                    <Txt variant="caption" color={palette.textFaint} style={{ marginTop: 6 }}>
                      Плюс НДФЛ 13% с их зарплат — его удерживаешь из зарплаты работника, но
                      перечисляешь в бюджет ты. Отдельно я его не считаю.
                    </Txt>
                  </Card>
                )}
              </>
            )}

            {/* Добровольные взносы */}
            <Label>Больничные и декрет</Label>
            <Card style={styles.between}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Txt variant="body" weight="semibold">
                  Добровольные взносы в СФР
                </Txt>
                <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                  {voluntarySfrAmount().toLocaleString('ru-RU')} ₽ в год · платить не обязательно
                </Txt>
              </View>
              <Switch
                value={voluntary}
                onValueChange={setVoluntary}
                trackColor={{ true: palette.accent, false: palette.border }}
              />
            </Card>
            <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
              Заплатишь в этом году — получишь право на больничные и декретные в следующем. Налог
              эти взносы НЕ уменьшают.
            </Txt>
          </>
        )}

        {isUsn && (
          <>
            <Label>Ставка УСН, %</Label>
            <TextInput
              value={usnRate}
              onChangeText={setUsnRate}
              placeholder={`${defaultRate} (стандартная)`}
              placeholderTextColor={palette.textFaint}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
              Регионы часто снижают ставку под конкретные ОКВЭД — например, до 1% для IT.
              Проверь свою на сайте ФНС по своему региону. Пусто — возьму стандартные{' '}
              {defaultRate}%.
            </Txt>
          </>
        )}

        {status === 'ip_psn' && (
          <>
            <Label>Стоимость патента за год, ₽</Label>
            <TextInput
              value={patentCost}
              onChangeText={setPatentCost}
              placeholder="например, 60 000"
              placeholderTextColor={palette.textFaint}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Touchable onPress={() => Linking.openURL('https://patent.nalog.ru')}>
              <Txt variant="caption" color={palette.accent} style={{ marginTop: spacing.sm }}>
                Посчитать точную стоимость на patent.nalog.ru →
              </Txt>
            </Touchable>
            <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
              Стоимость патента задаёт твой регион под конкретный вид деятельности — универсальной
              формулы нет, её невозможно посчитать в приложении.
            </Txt>
          </>
        )}

        {/* Что это будет стоить */}
        <Card style={{ marginTop: spacing.xxl }}>
          <Txt variant="body" weight="semibold">
            Что тебя ждёт
          </Txt>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {status === 'npd' && (
              <>
                <Fact>Налог: 4% с доходов от физлиц, 6% — от юрлиц и ИП.</Fact>
                <Fact>
                  Бонус {NPD.bonusTotal.toLocaleString('ru-RU')} ₽ один раз на всю жизнь — снижает
                  ставку до 3% и 4%, пока не кончится.
                </Fact>
                <Fact>Страховых взносов нет вообще.</Fact>
                <Fact>
                  Лимит {(NPD.incomeLimit / 1_000_000).toString().replace('.', ',')} млн ₽ в год —
                  превысил, слетаешь с режима.
                </Fact>
                <Fact>Платить до 28-го числа следующего месяца.</Fact>
              </>
            )}
            {isIp && (
              <>
                <Fact>
                  Страховые взносы «за себя»: {IP_CONTRIBUTIONS.fixed.toLocaleString('ru-RU')} ₽ до
                  28 декабря — платятся, даже если дохода не было вообще.
                </Fact>
                <Fact>
                  Плюс 1% с дохода свыше {IP_CONTRIBUTIONS.extraThreshold.toLocaleString('ru-RU')} ₽
                  — до 1 июля следующего года.
                </Fact>
                {(status === 'ip_usn_income' || status === 'ip_psn') && (
                  <Fact>
                    Важно: взносы не прибавляются к налогу, а вычитаются из него. Без работников —
                    полностью. При небольшом доходе налог может обнулиться, и ты платишь только
                    взносы.
                  </Fact>
                )}
                {status === 'ip_usn_profit' && (
                  <Fact>
                    Минимальный налог: даже если расходы съели всю прибыль, платишь 1% с оборота.
                  </Fact>
                )}
              </>
            )}
            {status === 'employee' && (
              <Fact>
                НДФЛ удерживает работодатель — тебе откладывать ничего не нужно. Покажу, сколько
                удержали и что можно вернуть вычетами.
              </Fact>
            )}
            {status === 'unofficial' && (
              <>
                <Fact>
                  Налогового агента нет: работодатель за тебя ничего не удерживает и никуда не
                  перечисляет. Деньги приходят на карту как есть.
                </Fact>
                <Fact>
                  Но доход остаётся облагаемым. По закону его декларируют сами — 3-НДФЛ до 30
                  апреля, налог до 15 июля. Ставка та же: 13% и выше по прогрессии.
                </Fact>
                <Fact>
                  Чего у тебя при этом нет: пенсионного стажа, больничных, отпускных, справки о
                  доходах для ипотеки или визы. При конфликте с работодателем доказать что-либо
                  тоже нечем.
                </Fact>
                <Fact>
                  Самозанятость — это 4–6% вместо 13%, оформляется за 10 минут в «Мой налог» и не
                  мешает работать как работал. На экране «Налоги» покажу разницу в деньгах на твоих
                  цифрах.
                </Fact>
              </>
            )}
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md, borderColor: palette.warning + '55' }}>
          <Txt variant="caption" color={palette.warning}>
            ⚠️ Приложение считает, а не консультирует. Ставки и лимиты меняются законом каждый год.
            Перед оплатой сверяйся с личным кабинетом ФНС.
          </Txt>
        </Card>

        <Button title="Сохранить" onPress={save} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

function Fact({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Txt variant="caption" color={palette.textFaint}>
        •
      </Txt>
      <Txt variant="caption" color={palette.textMuted} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: spacing.md },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: spacing.md },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  input: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    color: palette.text,
    fontSize: font.size.subtitle,
  },
});
