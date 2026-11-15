import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Colors, Fonts } from '@/constants/theme';
import { DataProvider } from '@/data';

export default function RootLayout() {
  return (
    <DataProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerShadowVisible: false,
          headerTintColor: Colors.ink,
          headerTitleStyle: { fontFamily: Fonts.serif },
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ title: 'Profile', presentation: 'modal' }} />
      </Stack>
    </DataProvider>
  );
}
