import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Pressable, StyleSheet, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { palette, radius } from './src/theme/theme';
import { useStore } from './src/store/useStore';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { PlansScreen } from './src/screens/PlansScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AddTransactionScreen } from './src/screens/AddTransactionScreen';
import { AddRecurringScreen } from './src/screens/AddRecurringScreen';
import { ScanReceiptScreen } from './src/screens/ScanReceiptScreen';
import { LoansScreen } from './src/screens/LoansScreen';
import { AddLoanScreen } from './src/screens/AddLoanScreen';
import { LoanDetailScreen } from './src/screens/LoanDetailScreen';
import { TaxScreen } from './src/screens/TaxScreen';
import { TaxSetupScreen } from './src/screens/TaxSetupScreen';
import { ExchangeScreen } from './src/screens/ExchangeScreen';
import { configureNotifications, syncReminders } from './src/services/notifications';
import { loadCachedTaxConfig, refreshTaxConfig } from './src/services/taxConfig';

// Как показывать уведомление, если приложение открыто. Настраиваем один раз.
configureNotifications();

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: palette.bg,
    card: palette.surface,
    border: palette.border,
    primary: palette.accent,
    text: palette.text,
  },
};

const ICONS: Record<string, string> = {
  Главная: 'home',
  Операции: 'swap-horizontal',
  Планы: 'calendar',
  Настройки: 'settings',
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textFaint,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          height: 88,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={(ICONS[route.name] ?? 'ellipse') as any} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Главная" component={DashboardScreen} />
      <Tab.Screen name="Операции" component={TransactionsScreen} />
      <Tab.Screen
        name="Добавить"
        component={DashboardScreen}
        options={{
          tabBarButton: (props) => <AddButton {...props} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('AddTransaction');
          },
        })}
      />
      <Tab.Screen name="Планы" component={PlansScreen} />
      <Tab.Screen name="Настройки" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function AddButton({ onPress }: any) {
  return (
    <View style={styles.addWrap}>
      <Pressable onPress={onPress} style={styles.addBtn}>
        <Ionicons name="add" size={30} color={palette.white} />
      </Pressable>
    </View>
  );
}

/**
 * Держит напоминания и планы в актуальном состоянии:
 *  — просроченные события («зарплата 5-го», а сегодня 12-е) перематываем вперёд;
 *  — очередь уведомлений пересобираем при любом изменении планов;
 *  — то же самое при возврате в приложение (мог смениться день).
 */
function useReminders(hydrated: boolean) {
  const recurring = useStore((s) => s.recurring);
  const settings = useStore((s) => s.settings);
  const rollDueRecurring = useStore((s) => s.rollDueRecurring);
  const refreshRates = useStore((s) => s.refreshRates);

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!hydrated) return;
    rollDueRecurring();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    // Пересборка очереди уведомлений — сетевая по своей природе операция:
    // упасть она может, но ронять из-за этого приложение незачем.
    syncReminders(recurring, settings).catch(() => {});
  }, [hydrated, recurring, settings.notificationsEnabled, settings.baseCurrency]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        rollDueRecurring();
        refreshRates();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);
}

/**
 * Налоговые ставки: сначала мгновенно поднимаем последние сохранённые,
 * потом в фоне проверяем, не вышли ли свежие. Без сети работаем на вшитых —
 * приложение никогда не остаётся без ставок.
 */
function useTaxRates() {
  const [ready, setReady] = React.useState(false);

  useEffect(() => {
    loadCachedTaxConfig().finally(() => {
      setReady(true);
      // Обновление ставок — в фоне: оно не должно задерживать запуск.
      refreshTaxConfig().catch(() => {});
    });
  }, []);

  return ready;
}

/** Ключи API лежат в Keychain — поднимаем их в память один раз при старте. */
function useSecrets() {
  const loadSecrets = useStore((s) => s.loadSecrets);
  useEffect(() => {
    loadSecrets().catch(() => {});
  }, []);
}

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const ratesReady = useTaxRates();
  useSecrets();
  useReminders(hydrated);

  const ready = hydrated && ratesReady;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {!ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.accent} size="large" />
          </View>
        ) : (
          <NavigationContainer theme={navTheme}>
            <RootStack.Navigator
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}
            >
              <RootStack.Screen name="Main" component={Tabs} />
              <RootStack.Screen
                name="AddTransaction"
                component={AddTransactionScreen}
                options={{ presentation: 'modal' }}
              />
              <RootStack.Screen
                name="AddRecurring"
                component={AddRecurringScreen}
                options={{ presentation: 'modal' }}
              />
              <RootStack.Screen
                name="ScanReceipt"
                component={ScanReceiptScreen}
                options={{ presentation: 'modal' }}
              />
              <RootStack.Screen name="Loans" component={LoansScreen} />
              <RootStack.Screen name="LoanDetail" component={LoanDetailScreen} />
              <RootStack.Screen
                name="AddLoan"
                component={AddLoanScreen}
                options={{ presentation: 'modal' }}
              />
              <RootStack.Screen name="Tax" component={TaxScreen} />
              <RootStack.Screen name="Exchange" component={ExchangeScreen} />
              <RootStack.Screen
                name="TaxSetup"
                component={TaxSetupScreen}
                options={{ presentation: 'modal' }}
              />
            </RootStack.Navigator>
          </NavigationContainer>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' },
  addWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: palette.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
