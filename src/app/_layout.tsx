import Ionicons from '@expo/vector-icons/Ionicons';
import { Syne_700Bold } from '@expo-google-fonts/syne/700Bold';
import { Syne_800ExtraBold } from '@expo-google-fonts/syne/800ExtraBold';
import { Asset } from 'expo-asset';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { DataProvider } from '@/data';
import { BODY_TYPES } from '@/mirror/assets';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Syne_700Bold, Syne_800ExtraBold });
  const fontsReady = fontsLoaded || !!fontError;

  // Preload every onboarding mannequin so the mirror opens without a download wait.
  useEffect(() => {
    Asset.loadAsync(BODY_TYPES.map((b) => b.asset)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <DataProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerShadowVisible: false,
          headerTintColor: Colors.ink,
          headerTitleStyle: { fontFamily: Fonts.heading },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: 'Your avatar' }} />
        <Stack.Screen name="scan/index" options={{ title: 'Scan your closet' }} />
        <Stack.Screen name="scan/review" options={{ title: 'Review pieces' }} />
        <Stack.Screen
          name="profile"
          options={{
            title: 'Profile',
            presentation: 'modal',
            headerRight: () => (
              <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => router.back()}>
                <Ionicons name="close" size={24} color={Colors.ink} />
              </Pressable>
            ),
          }}
        />
      </Stack>
    </DataProvider>
  );
}
