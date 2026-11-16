import { Asset } from 'expo-asset';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Colors, Fonts } from '@/constants/theme';
import { DataProvider } from '@/data';
import { BODY_TYPES } from '@/mirror/assets';

export default function RootLayout() {
  // Preload every onboarding mannequin so the mirror opens without a download wait.
  useEffect(() => {
    Asset.loadAsync(BODY_TYPES.map((b) => b.asset)).catch(() => undefined);
  }, []);

  return (
    <DataProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerShadowVisible: false,
          headerTintColor: Colors.ink,
          headerTitleStyle: { fontFamily: Fonts.serif },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: 'Your avatar' }} />
        <Stack.Screen name="scan/index" options={{ title: 'Scan your closet' }} />
        <Stack.Screen name="scan/review" options={{ title: 'Review pieces' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile', presentation: 'modal' }} />
      </Stack>
    </DataProvider>
  );
}
