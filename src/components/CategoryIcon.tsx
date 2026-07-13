import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme/theme';

export function CategoryIcon({
  icon,
  color,
  size = 44,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius.md,
          backgroundColor: color + '26', // ~15% прозрачности
        },
      ]}
    >
      <Ionicons name={icon as any} size={size * 0.5} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
