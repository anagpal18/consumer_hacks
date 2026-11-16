import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'body-outline' },
  { name: 'feed', title: 'Feed', icon: 'people-outline' },
  { name: 'closet', title: 'Closet', icon: 'shirt-outline' },
  { name: 'shop', title: 'Shop', icon: 'bag-outline' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        headerTitleStyle: { fontFamily: Fonts.serif, fontSize: 22, color: Colors.ink },
        headerRight: () => (
          <Link href="/profile" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Profile" hitSlop={12} style={{ marginRight: Spacing.four }}>
              <Ionicons name="person-circle-outline" size={30} color={Colors.ink} />
            </Pressable>
          </Link>
        ),
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.muted,
        tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.line },
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            headerShown: tab.name !== 'index',
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} size={size} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
