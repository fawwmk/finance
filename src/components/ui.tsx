import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
  Pressable,
  PressableProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, radius, spacing, font } from '../theme/theme';

/** Обёртка экрана: тёмный фон + безопасные зоны. */
export function Screen({
  children,
  edges = ['top'],
  style,
}: {
  children: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

/** Карточка-поверхность. */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Txt({
  children,
  variant = 'body',
  color,
  weight,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  variant?: 'caption' | 'body' | 'subtitle' | 'title' | 'display' | 'hero';
  color?: string;
  weight?: keyof typeof font.weight;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontSize: font.size[variant], color: color ?? palette.text },
        weight ? { fontWeight: font.weight[weight] as TextStyle['fontWeight'] } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Основная кнопка. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  style,
  disabled,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' ? styles.btnPrimary : styles.btnGhost,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        style,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          variant === 'ghost' && { color: palette.accent },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** Нажимаемая обёртка с лёгким эффектом. */
export function Touchable({
  children,
  style,
  ...rest
}: PressableProps & { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  btn: {
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnPrimary: { backgroundColor: palette.accent },
  btnGhost: { backgroundColor: 'transparent' },
  btnText: {
    color: palette.white,
    fontSize: font.size.subtitle,
    fontWeight: font.weight.semibold as TextStyle['fontWeight'],
  },
});
