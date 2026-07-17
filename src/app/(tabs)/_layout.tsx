import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { useAuth } from '@/store/AuthContext';
import { useTheme } from '@/theme/ThemeContext';

/** Minimal shape of the props expo-router passes to a custom tabBar. */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  // Loosely typed: expo-router's navigation helper has a complex generic
  // signature; we only use emit + navigate.
  navigation: {
    emit: (...args: any[]) => { defaultPrevented: boolean };
    navigate: (...args: any[]) => void;
  };
}

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { on: 'home', off: 'home-outline', label: 'Home' },
  explore: { on: 'compass', off: 'compass-outline', label: 'Explore' },
  leaderboard: { on: 'trophy', off: 'trophy-outline', label: 'Ranks' },
  profile: { on: 'person', off: 'person-outline', label: 'Profile' },
};

function PlatedTabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [chooser, setChooser] = useState(false);

  const renderTab = (routeName: string) => {
    const index = state.routes.findIndex((r) => r.name === routeName);
    const route = state.routes[index];
    if (!route) return null;
    const focused = state.index === index;
    const cfg = ICONS[routeName];

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    return (
      <Pressable key={routeName} style={styles.tab} onPress={onPress} hitSlop={6}>
        <Ionicons
          name={focused ? cfg.on : cfg.off}
          size={24}
          color={focused ? colors.accent : colors.textMuted}
        />
        <Text style={[styles.label, { color: focused ? colors.accent : colors.textMuted }]}>
          {cfg.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          },
        ]}>
        {renderTab('index')}
        {renderTab('explore')}

        {/* Center create button — chooses between a rated plate and a Plato video */}
        <View style={styles.centerWrap}>
          <Pressable
            onPress={() => setChooser(true)}
            style={({ pressed }) => [
              styles.center,
              { backgroundColor: colors.accent, shadowColor: colors.shadow, opacity: pressed ? 0.9 : 1 },
            ]}>
            <Ionicons name="add" size={32} color={colors.accentText} />
          </Pressable>
        </View>

        {renderTab('leaderboard')}
        {renderTab('profile')}
      </View>

      <ActionSheet
        visible={chooser}
        onClose={() => setChooser(false)}
        title="Create"
        actions={[
          {
            label: 'Rate a plate',
            icon: 'restaurant',
            onPress: () => router.push('/create'),
          },
          {
            label: 'Post a Plato',
            icon: 'videocam',
            onPress: () => router.push('/create-plato'),
          },
        ]}
      />
    </>
  );
}

export default function TabsLayout() {
  const { signedIn, loading } = useAuth();
  if (loading) return null; // session restoring — index.tsx shows the loader
  if (!signedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <PlatedTabBar {...(props as unknown as TabBarProps)} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontSize: 11, fontWeight: '700' },
  centerWrap: { flex: 1, alignItems: 'center' },
  center: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
