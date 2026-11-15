import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Colors, Fonts } from '@/constants/theme';

export default function RootLayout() {
  return (
    <>
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
    </>
  );
}
