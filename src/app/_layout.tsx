import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../components/ui';
import { useT } from '../lib/i18n';
import { StoreProvider } from '../lib/store';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <AppStack />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

function AppStack() {
  const t = useT();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: t('Back'),
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="invoice/[id]" options={{ title: t('Invoice') }} />
      <Stack.Screen name="business/[id]" options={{ title: t('Company') }} />
      <Stack.Screen name="clients" options={{ title: t('Clients') }} />
      <Stack.Screen name="rates" options={{ title: t('Rate card') }} />
      <Stack.Screen name="import" options={{ title: t('Import') }} />
    </Stack>
  );
}
