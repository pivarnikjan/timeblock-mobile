import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useTheme } from '@/theme';

/** The desktop's top navigation, as tabs: Calendar · Planning · Tasks · Settings. */
export default function TabsLayout() {
  const theme = useTheme();
  const icon = (glyph: string) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return <Text style={{ fontSize: 18, color }}>{glyph}</Text>;
    };
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.foreground,
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Calendar', headerShown: false, tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="planning" options={{ title: 'Planning', tabBarIcon: icon('🎯') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: icon('✓') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙') }} />
    </Tabs>
  );
}
