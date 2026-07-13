import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Card, Txt, Button, Touchable } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';
import { palette, spacing, radius, font } from '../theme/theme';
import { useStore } from '../store/useStore';
import { categoryById } from '../data/categories';
import { recognizeReceipt, guessCategory, OcrError, ParsedReceipt } from '../services/ocr';
import { CurrencyCode } from '../types';
import { formatMoney, todayISO, plural } from '../utils/format';

/** Позиция чека в состоянии редактирования. */
interface DraftItem {
  key: string;
  name: string;
  price: number;
  categoryId: string;
  /** Снятая галочка = не вносить эту позицию. */
  include: boolean;
}

type Stage = 'idle' | 'working' | 'review';

export function ScanReceiptScreen({ navigation }: any) {
  const { settings, categories, addTransactions, addReceipt } = useStore();

  const [stage, setStage] = useState<Stage>('idle');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [currency, setCurrency] = useState<CurrencyCode>(settings.baseCurrency);
  const [date, setDate] = useState<string>(todayISO());

  const expenseCats = categories.filter((c) => c.kind === 'expense');

  /**
   * Экран мог закрыться, пока чек распознавался (это до минуты).
   * Тогда обновлять его состояние нельзя, и алерт показывать тоже — он выскочит
   * поверх совсем другого экрана и напугает.
   */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Снять чек камерой или выбрать из галереи. */
  const pick = async (from: 'camera' | 'library') => {
    // Ни одна из этих операций не обёрнута системой: камера может быть занята,
    // в симуляторе её нет вовсе, доступ могут отозвать на ходу. Без try/catch
    // кнопка просто молча переставала работать.
    try {
      const perm =
        from === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!perm.granted) {
        Alert.alert(
          'Нет доступа',
          from === 'camera'
            ? 'Разреши приложению камеру в настройках iPhone.'
            : 'Разреши доступ к фото в настройках iPhone.'
        );
        return;
      }

      const res =
        from === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.8,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.8,
            });

      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Не получилось', 'Не удалось прочитать фото. Попробуй ещё раз.');
        return;
      }

      setImageUri(asset.uri);
      await recognize(asset.uri);
    } catch {
      Alert.alert(
        'Камера недоступна',
        'Не удалось открыть камеру или галерею. Попробуй ещё раз или выбери фото из галереи.'
      );
    }
  };

  /**
   * Сжимает фото перед отправкой.
   *
   * Снимок с iPhone — это 3–5 МБ, а в base64 он раздувается ещё на треть.
   * Такую строку тяжело держать в памяти, она надолго вешает интерфейс при
   * упаковке в запрос, а Anthropic картинки больше 5 МБ просто отклоняет —
   * то есть нормальный чек, снятый целиком, не распознавался вообще никогда.
   *
   * 1600 пикселей по длинной стороне — текст чека читается уверенно,
   * а размер падает примерно на порядок.
   */
  const toBase64 = async (uri: string): Promise<string> => {
    const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (!out.base64) throw new OcrError('Не удалось подготовить фото к отправке.');
    return out.base64;
  };

  const recognize = async (uri: string) => {
    setStage('working');
    try {
      const base64 = await toBase64(uri);
      const result = await recognizeReceipt(base64, settings);
      if (!alive.current) return;

      if (!result.items.length) {
        setStage('idle');
        Alert.alert(
          'Позиции не распознались',
          'Чек прочитан, но товары выделить не удалось. Сними чек ровнее, при хорошем свете, целиком в кадре.'
        );
        return;
      }

      setParsed(result);
      setCurrency(result.currency ?? settings.baseCurrency);
      setDate(result.date ?? todayISO());
      setItems(
        result.items.map((it, i) => ({
          key: `${i}`,
          name: it.name,
          price: it.price,
          categoryId: it.categoryId ?? guessCategory(it.name),
          include: true,
        }))
      );
      setStage('review');
    } catch (e) {
      if (!alive.current) return;
      setStage('idle');
      const msg =
        e instanceof OcrError
          ? e.message
          : 'Не удалось связаться с сервисом распознавания. Проверь интернет.';
      Alert.alert('Не получилось', msg);
    }
  };

  const included = items.filter((i) => i.include);
  const sum = included.reduce((s, i) => s + i.price, 0);

  const toggle = (key: string) =>
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, include: !i.include } : i))
    );

  const setCategory = (key: string, categoryId: string) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, categoryId } : i)));

  const save = () => {
    if (!included.length) return;

    const receiptId = addReceipt({
      imageUri: imageUri ?? '',
      date,
      currency,
      total: parsed?.total ?? sum,
      merchant: parsed?.merchant,
      items: included.map((i) => ({
        name: i.name,
        price: i.price,
        categoryId: i.categoryId,
      })),
    });

    addTransactions(
      included.map((i) => ({
        kind: 'expense' as const,
        amount: i.price,
        currency,
        categoryId: i.categoryId,
        date,
        note: parsed?.merchant ? `${i.name} · ${parsed.merchant}` : i.name,
        source: 'receipt' as const,
        receiptId,
      }))
    );

    navigation.goBack();
  };

  /* ─────────────────────────── Экран выбора фото ─────────────────────────── */

  if (stage !== 'review') {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Чек" onClose={() => navigation.goBack()} />

        <View style={styles.center}>
          {stage === 'working' ? (
            <>
              {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} />}
              <ActivityIndicator color={palette.accent} size="large" style={{ marginTop: spacing.xl }} />
              <Txt variant="subtitle" weight="semibold" style={{ marginTop: spacing.lg }}>
                Читаю чек…
              </Txt>
              <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 6 }}>
                Разбираю позиции, цены и валюту
              </Txt>
            </>
          ) : (
            <>
              <View style={styles.bigIcon}>
                <Ionicons name="receipt-outline" size={44} color={palette.accent} />
              </View>
              <Txt variant="title" weight="bold" style={{ marginTop: spacing.lg }}>
                Сфотографируй чек
              </Txt>
              <Txt
                variant="body"
                color={palette.textMuted}
                style={{ marginTop: 8, textAlign: 'center', paddingHorizontal: spacing.xl }}
              >
                Распознаю позиции, цены и валюту — и внесу каждую покупку отдельной
                операцией. Русский, английский, итальянский.
              </Txt>

              {/*
                Честное предупреждение. Распознавание идёт не на телефоне:
                фотография уходит в интернет. Человек имеет право знать это
                ДО того, как нажмёт кнопку, а не найти мелким шрифтом в настройках.
              */}
              <Txt
                variant="caption"
                color={palette.textFaint}
                style={{ marginTop: spacing.md, textAlign: 'center', paddingHorizontal: spacing.xl }}
              >
                Фото чека отправляется в сервис распознавания (
                {(settings.ocrProvider ?? 'claude') === 'claude' ? 'Anthropic' : 'OCR.space'}) — на
                телефоне такое не считается. Если на чеке есть лишнее, лучше обрежь кадр.
              </Txt>

              <View style={{ width: '100%', marginTop: spacing.xl, gap: spacing.md }}>
                <Button title="📸  Снять камерой" onPress={() => pick('camera')} />
                <Button
                  title="Выбрать из галереи"
                  variant="ghost"
                  onPress={() => pick('library')}
                />
              </View>
            </>
          )}
        </View>
      </Screen>
    );
  }

  /* ───────────────────── Экран проверки распознанного ───────────────────── */

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Проверь позиции" onClose={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.summary}>
          {imageUri && <Image source={{ uri: imageUri }} style={styles.thumb} />}
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Txt variant="body" weight="semibold" numberOfLines={1}>
              {parsed?.merchant ?? 'Чек'}
            </Txt>
            <Txt variant="caption" color={palette.textMuted} style={{ marginTop: 2 }}>
              {date} · {included.length} из {items.length} позиций
            </Txt>
            {parsed?.total != null && Math.abs(parsed.total - sum) > 1 && (
              <Txt variant="caption" color={palette.warning} style={{ marginTop: 4 }}>
                Итог в чеке: {formatMoney(parsed.total, currency)} — расходится с суммой
                позиций
              </Txt>
            )}
          </View>
        </Card>

        <Txt
          variant="caption"
          color={palette.textMuted}
          weight="semibold"
          style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}
        >
          ПОЗИЦИИ · нажми на иконку, чтобы сменить категорию
        </Txt>

        {items.map((item) => {
          const cat = categoryById(item.categoryId, categories);
          return (
            <Card key={item.key} style={[styles.itemCard, !item.include && { opacity: 0.4 }]}>
              <Touchable onPress={() => toggle(item.key)} style={styles.check}>
                <Ionicons
                  name={item.include ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={item.include ? palette.accent : palette.textFaint}
                />
              </Touchable>

              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Txt variant="body" weight="semibold" numberOfLines={2}>
                  {item.name}
                </Txt>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 8 }}
                >
                  {expenseCats.map((c) => (
                    <Touchable
                      key={c.id}
                      onPress={() => setCategory(item.key, c.id)}
                      style={[
                        styles.catChip,
                        item.categoryId === c.id && {
                          backgroundColor: c.color + '26',
                          borderColor: c.color,
                        },
                      ]}
                    >
                      <Ionicons
                        name={c.icon as any}
                        size={13}
                        color={item.categoryId === c.id ? c.color : palette.textFaint}
                      />
                      <Txt
                        variant="caption"
                        color={item.categoryId === c.id ? c.color : palette.textFaint}
                      >
                        {c.name}
                      </Txt>
                    </Touchable>
                  ))}
                </ScrollView>
              </View>

              <Txt variant="subtitle" weight="bold" style={{ marginLeft: spacing.sm }}>
                {formatMoney(item.price, currency)}
              </Txt>
            </Card>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Txt variant="caption" color={palette.textMuted}>
            Итого к внесению
          </Txt>
          <Txt variant="title" weight="bold">
            {formatMoney(sum, currency)}
          </Txt>
        </View>
        <Button
          title={`Внести ${included.length} ${plural(
            included.length,
            'операцию',
            'операции',
            'операций'
          )}`}
          onPress={save}
          disabled={!included.length}
        />
      </View>
    </Screen>
  );
}


function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Txt variant="title" weight="bold">
        {title}
      </Txt>
      <Touchable onPress={onClose} style={styles.closeBtn}>
        <Ionicons name="close" size={22} color={palette.textMuted} />
      </Touchable>
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
    paddingBottom: spacing.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  bigIcon: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { width: 140, height: 190, borderRadius: radius.md, resizeMode: 'cover' },
  summary: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 54, height: 72, borderRadius: radius.sm, resizeMode: 'cover' },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  check: { padding: 2 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    marginRight: 6,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    gap: spacing.md,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
