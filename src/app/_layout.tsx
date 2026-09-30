import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { prepareDatabase } from '@/db/database';
import { AppProvider } from '@/state/app';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const theme = useTheme();
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    prepareDatabase().then(
      () => setReady(true),
      (error: Error) => setFailure(error.message),
    );
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.background }}>
        {failure ? (
          <Text style={{ color: theme.danger, textAlign: 'center' }}>TimeBlock could not open its database: {failure}</Text>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  return (
    <AppProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.foreground,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'TimeBlock' }} />
        <Stack.Screen name="item" options={{ presentation: 'modal', title: 'Details' }} />
        <Stack.Screen name="today" options={{ title: 'My day' }} />
        <Stack.Screen name="plan" options={{ title: 'Plan calendar' }} />
        <Stack.Screen name="vacations" options={{ title: 'Vacations' }} />
        <Stack.Screen name="vacation" options={{ presentation: 'modal', title: 'Set vacation' }} />
        <Stack.Screen name="horizon" options={{ presentation: 'modal', title: 'Goal' }} />
        <Stack.Screen name="task" options={{ presentation: 'modal', title: 'Task' }} />
      </Stack>
    </AppProvider>
  );
}
