import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Linking,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Card, Touchable } from '../components/ui';
import { palette, spacing, radius, font } from '../theme/theme';
import { useStore } from '../store/useStore';
import { CurrencyCode, TaxStatus } from '../types';
import { CURRENCY_SYMBOL, ALL_CURRENCIES } from '../utils/format';

const TAX_STATUS_SHORT: Record<TaxStatus, string> = {
  employee: 'По найму',
  unofficial: 'Без оформления',
  npd: 'Самозанятый',
  ip_usn_income: 'ИП, УСН 6%',
  ip_usn_profit: 'ИП, УСН 15%',
  ip_psn: 'ИП, патент',
  ip_osno: 'ИП, ОСНО',
};
import {
  scheduledCount,
  sendTestNotification,
  nextReminderLabel,
} from '../services/notifications';

const CURRENCIES: CurrencyCode[] = ALL_CURRENCIES;

export function SettingsScreen({ navigation }: any) {
  const { settings, setSettings, transactions, loans, rates, recurring, taxProfile } = useStore();
  const [showKey, setShowKey] = useState(false);
  const [queued, setQueued] = useState(0);

  const provider = settings.ocrProvider ?? 'claude';
  const notifyOn = settings.notificationsEnabled !== false;
  const source = settings.rateSource ?? 'cbr';
  const cashMode = settings.cashMode ?? 'card';

  // Сколько напоминаний реально стоит в очереди у iOS.
  useEffect(() => {
    let alive = true;
    // небольшая задержка: App.tsx как раз пересобирает очередь после изменений
    const t = setTimeout(() => {
      scheduledCount().then((n) => alive && setQueued(n));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [recurring, settings.notificationsEnabled]);

  const nextLabel = nextReminderLabel(recurring);

  const test = async () => {
    const ok = await sendTestNotification();
    Alert.alert(
      ok ? 'Отправлено' : 'Нет разрешения',
      ok
        ? 'Через 5 секунд придёт уведомление. Можешь свернуть приложение.'
        : 'Разреши уведомления в Настройках iPhone → Финансы.'
    );
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <Txt variant="title" weight="bold" style={{ marginBottom: spacing.lg }}>
          Настройки
        </Txt>

        {/* Валюта */}
        <Txt variant="caption" color={palette.textMuted} weight="semibold" style={styles.label}>
          ОСНОВНАЯ ВАЛЮТА
        </Txt>
        <Card style={{ padding: spacing.sm }}>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => {
              const active = settings.baseCurrency === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setSettings({ baseCurrency: c })}
                  style={[styles.currencyBtn, active && styles.currencyActive]}
                >
                  <Txt variant="subtitle" weight="bold" color={active ? palette.white : palette.textMuted}>
                    {CURRENCY_SYMBOL[c]}
                  </Txt>
                  <Txt variant="caption" color={active ? palette.white : palette.textMuted}>
                    {c}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </Card>
        {/* Источник курса */}
        <Txt variant="caption" color={palette.textMuted} weight="semibold" style={styles.label}>
          ИСТОЧНИК КУРСА
        </Txt>
        <Card style={{ padding: spacing.sm }}>
          <View style={styles.currencyRow}>
            <Pressable
              onPress={() => setSettings({ rateSource: 'cbr' })}
              style={[styles.currencyBtn, source === 'cbr' && styles.currencyActive]}
            >
              <Txt
                variant="caption"
                weight="bold"
                color={source === 'cbr' ? palette.white : palette.textMuted}
              >
                ЦБ РФ
              </Txt>
              <Txt
                variant="caption"
                color={source === 'cbr' ? palette.white : palette.textFaint}
              >
                официальный
              </Txt>
            </Pressable>
            <Pressable
              onPress={() => setSettings({ rateSource: 'aiyl' })}
              style={[styles.currencyBtn, source === 'aiyl' && styles.currencyActive]}
            >
              <Txt
                variant="caption"
                weight="bold"
                color={source === 'aiyl' ? palette.white : palette.textMuted}
              >
                Айыл Банк
              </Txt>
              <Txt
                variant="caption"
                color={source === 'aiyl' ? palette.white : palette.textFaint}
              >
                реальный
              </Txt>
            </Pressable>
          </View>
        </Card>

        {source === 'aiyl' && (
          <>
            <Card style={{ padding: spacing.sm, marginTop: spacing.sm }}>
              <View style={styles.currencyRow}>
                <Pressable
                  onPress={() => setSettings({ cashMode: 'card' })}
                  style={[styles.currencyBtn, cashMode === 'card' && styles.currencyActive]}
                >
                  <Txt
                    variant="caption"
                    weight="bold"
                    color={cashMode === 'card' ? palette.white : palette.textMuted}
                  >
                    Безнал
                  </Txt>
                </Pressable>
                <Pressable
                  onPress={() => setSettings({ cashMode: 'cash' })}
                  style={[styles.currencyBtn, cashMode === 'cash' && styles.currencyActive]}
                >
                  <Txt
                    variant="caption"
                    weight="bold"
                    color={cashMode === 'cash' ? palette.white : palette.textMuted}
                  >
                    Наличные
                  </Txt>
                </Pressable>
              </View>
            </Card>
            <Txt variant="caption" color={palette.warning} style={{ marginTop: spacing.sm }}>
              У Айыл Банка прямого обмена рубль→евро нет: сначала рубли в сомы, потом сомы в
              евро — спред платится дважды. Безналом заметно выгоднее, чем наличными.
            </Txt>
          </>
        )}

        <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
          {source === 'aiyl'
            ? 'Курсы с сайта abank.kg. Не ответит — автоматически возьму ЦБ.'
            : 'Официальный курс ЦБ. По нему нигде нельзя реально обменять — для точного учёта переключись на банк.'}
          {rates ? ` Обновлены ${new Date(rates.fetchedAt).toLocaleString('ru-RU')}.` : ''}
        </Txt>

        {/* Обмен валюты */}
        <Touchable onPress={() => navigation.navigate('Exchange')}>
          <Card style={[styles.infoCard, { marginTop: spacing.md }]}>
            <Ionicons name="swap-horizontal" size={22} color={palette.accent} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Txt variant="body" weight="medium">
                Обмен валюты
              </Txt>
              <Txt variant="caption" color={palette.textMuted}>
                Записать реальный курс сделки — со спредом и комиссией
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
          </Card>
        </Touchable>

        {/* Напоминания */}
        <Txt variant="caption" color={palette.textMuted} weight="semibold" style={styles.label}>
          НАПОМИНАНИЯ
        </Txt>
        <Card>
          <View style={styles.between}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Txt variant="body" weight="medium">
                Присылать уведомления
              </Txt>
              <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
                О зарплате, подписках и платежах по кредиту — в 10:00
              </Txt>
            </View>
            <Switch
              value={notifyOn}
              onValueChange={(v) => setSettings({ notificationsEnabled: v })}
              trackColor={{ true: palette.accent, false: palette.border }}
            />
          </View>

          {notifyOn && (
            <>
              <View style={styles.divider} />
              <View style={styles.between}>
                <Ionicons name="notifications-outline" size={20} color={palette.accent} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Txt variant="body" weight="medium">
                    {queued ? `В очереди: ${queued}` : 'Очередь пуста'}
                  </Txt>
                  <Txt variant="caption" color={palette.textMuted} numberOfLines={1}>
                    {nextLabel ?? 'Включи «Напоминать» у события во вкладке «Планы»'}
                  </Txt>
                </View>
              </View>

              <Touchable onPress={test}>
                <Txt variant="caption" color={palette.accent} style={{ marginTop: spacing.md }}>
                  Отправить тестовое уведомление →
                </Txt>
              </Touchable>
            </>
          )}
        </Card>

        {/* Деньги */}
        <Txt variant="caption" color={palette.textMuted} weight="semibold" style={styles.label}>
          КРЕДИТЫ И НАЛОГИ
        </Txt>
        <Touchable onPress={() => navigation.navigate('Loans')}>
          <Card style={styles.infoCard}>
            <Ionicons name="card" size={22} color={palette.credit} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Txt variant="body" weight="medium">
                Кредиты и карты
              </Txt>
              <Txt variant="caption" color={palette.textMuted}>
                {loans.length
                  ? `${loans.length} шт. · график, грейс-период, досрочка`
                  : 'Пока не добавлены'}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
          </Card>
        </Touchable>

        <Touchable onPress={() => navigation.navigate('Tax')}>
          <Card style={[styles.infoCard, { marginTop: spacing.sm }]}>
            <Ionicons name="receipt" size={22} color={palette.income} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Txt variant="body" weight="medium">
                Налоги
              </Txt>
              <Txt variant="caption" color={palette.textMuted}>
                {taxProfile
                  ? `${TAX_STATUS_SHORT[taxProfile.status]} · ${
                      taxProfile.resident ? 'резидент' : 'нерезидент'
                    }`
                  : 'ИП, самозанятый или найм — не настроено'}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
          </Card>
        </Touchable>

        {/* OCR */}
        <Txt variant="caption" color={palette.textMuted} weight="semibold" style={styles.label}>
          РАСПОЗНАВАНИЕ ЧЕКОВ
        </Txt>

        <Card style={{ padding: spacing.sm }}>
          <View style={styles.currencyRow}>
            <Pressable
              onPress={() => setSettings({ ocrProvider: 'claude' })}
              style={[styles.currencyBtn, provider === 'claude' && styles.currencyActive]}
            >
              <Txt variant="caption" weight="bold" color={provider === 'claude' ? palette.white : palette.textMuted}>
                Claude
              </Txt>
              <Txt variant="caption" color={provider === 'claude' ? palette.white : palette.textFaint}>
                точнее
              </Txt>
            </Pressable>
            <Pressable
              onPress={() => setSettings({ ocrProvider: 'ocrspace' })}
              style={[styles.currencyBtn, provider === 'ocrspace' && styles.currencyActive]}
            >
              <Txt variant="caption" weight="bold" color={provider === 'ocrspace' ? palette.white : palette.textMuted}>
                OCR.space
              </Txt>
              <Txt variant="caption" color={provider === 'ocrspace' ? palette.white : palette.textFaint}>
                бесплатно
              </Txt>
            </Pressable>
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <View style={styles.between}>
            <Txt variant="body" weight="medium">
              {provider === 'claude' ? 'Ключ Anthropic API' : 'Ключ OCR.space'}
            </Txt>
            <Touchable onPress={() => setShowKey((v) => !v)}>
              <Ionicons
                name={showKey ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={palette.textMuted}
              />
            </Touchable>
          </View>

          <TextInput
            value={provider === 'claude' ? settings.claudeApiKey ?? '' : settings.ocrSpaceApiKey ?? ''}
            onChangeText={(v) =>
              setSettings(provider === 'claude' ? { claudeApiKey: v.trim() } : { ocrSpaceApiKey: v.trim() })
            }
            placeholder={provider === 'claude' ? 'sk-ant-…' : 'K812…'}
            placeholderTextColor={palette.textFaint}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <Touchable
            onPress={() =>
              Linking.openURL(
                provider === 'claude'
                  ? 'https://console.anthropic.com/settings/keys'
                  : 'https://ocr.space/ocrapi/freekey'
              )
            }
          >
            <Txt variant="caption" color={palette.accent} style={{ marginTop: spacing.md }}>
              {provider === 'claude'
                ? 'Получить ключ на console.anthropic.com →'
                : 'Получить бесплатный ключ на ocr.space →'}
            </Txt>
          </Touchable>

          <Txt variant="caption" color={palette.textFaint} style={{ marginTop: spacing.sm }}>
            Ключ хранится только на этом телефоне. Чек уходит напрямую в сервис
            распознавания и больше никуда.
          </Txt>
        </Card>

        <Card style={[styles.infoCard, { marginTop: spacing.md }]}>
          <Ionicons name="language" size={22} color={palette.accent} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Txt variant="body" weight="medium">
              Языки чеков
            </Txt>
            <Txt variant="caption" color={palette.textMuted}>
              русский, английский, итальянский
            </Txt>
          </View>
        </Card>

        {/* О приложении */}
        <Txt variant="caption" color={palette.textMuted} weight="semibold" style={styles.label}>
          О ПРИЛОЖЕНИИ
        </Txt>
        <Card style={styles.infoCard}>
          <Ionicons name="stats-chart" size={22} color={palette.income} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Txt variant="body" weight="medium">
              Всего операций
            </Txt>
            <Txt variant="caption" color={palette.textMuted}>
              {transactions.length}
            </Txt>
          </View>
        </Card>
        {/*
          Раньше здесь было написано «данные хранятся только на этом телефоне».
          Это неправда: фото чеков уходят в сервис распознавания. Обещание
          приватности, которое приложение не выполняет, — хуже, чем его отсутствие.
        */}
        <Txt
          variant="caption"
          color={palette.textFaint}
          style={{ textAlign: 'center', marginTop: spacing.xl }}
        >
          Финансы · версия 0.2
        </Txt>
        <Txt
          variant="caption"
          color={palette.textFaint}
          style={{ textAlign: 'center', marginTop: 4, paddingHorizontal: spacing.lg }}
        >
          Операции, кредиты и налоги хранятся только на этом телефоне и никуда не отправляются.
          Исключение — фото чеков: они уходят в сервис распознавания, иначе распознать их нельзя.
        </Txt>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: spacing.xl, marginBottom: spacing.sm },
  currencyRow: { flexDirection: 'row', gap: spacing.sm },
  currencyBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
  },
  currencyActive: { backgroundColor: palette.accent },
  infoCard: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: spacing.md },
  input: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    marginTop: spacing.md,
    color: palette.text,
    fontSize: font.size.body,
  },
});
