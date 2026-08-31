import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { tapMedium, tick } from '@/lib/haptics';
import { SECTION_META, SectionKey, TAB_BAR_BOTTOM_MARGIN, TAB_BAR_HEIGHT } from '@/lib/sections';
import { useAuth } from '@/store/AuthContext';
import { DiscoverSharedProvider } from '@/store/DiscoverSharedContext';
import { ExploreModeProvider } from '@/store/ExploreModeContext';
import { useLocation } from '@/store/LocationContext';
import { MainPagerProvider, useMainPagerControl } from '@/store/MainPagerControl';
import { useTheme } from '@/theme/ThemeContext';

const BAR_SECTIONS: SectionKey[] = ['home', 'platos', 'discover', 'profile'];

/**
 * One floating pill: Home · Platos · [create] · Discover · Profile, in swipe
 * order. Every tap jumps the pager hosted by `index.tsx` directly — none of
 * these five route anywhere, so the transition is always the pager's own
 * live animation, not a navigation cut. The create button sits in the middle
 * but isn't a section; the pager never lands on it.
 */
function PlatedTabBar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeSection, jumpTo } = useMainPagerControl();
  const [chooser, setChooser] = useState(false);

  // Platos is a video feed edge-to-edge behind the bar — a solid card reads
  // heavy against it, so the bar goes nearly see-through there instead.
  const onPlatos = activeSection === 'platos';

  const renderSection = (key: SectionKey) => {
    const cfg = SECTION_META[key];
    const focused = activeSection === key;
    const tint = onPlatos ? 'rgba(255,255,255,0.9)' : colors.textMuted;
    return (
      <AnimatedPressable
        key={key}
        onPress={() => {
          tick();
          jumpTo(key);
        }}
        hitSlop={4}
        pressScale={0.9}
        style={[styles.item, focused && { backgroundColor: onPlatos ? 'rgba(255,255,255,0.18)' : colors.surface }]}>
        <Ionicons name={focused ? cfg.icon : cfg.iconOutline} size={27} color={focused ? colors.accent : tint} />
      </AnimatedPressable>
    );
  };

  return (
    <>
      <View
        style={[
          styles.barWrap,
          {
            bottom: insets.bottom + TAB_BAR_BOTTOM_MARGIN,
            height: TAB_BAR_HEIGHT,
            backgroundColor: onPlatos ? 'rgba(20,20,20,0.35)' : colors.card + 'D9',
            borderColor: onPlatos ? 'rgba(255,255,255,0.15)' : colors.border,
            shadowColor: colors.shadow,
          },
        ]}>
        {renderSection(BAR_SECTIONS[0])}
        {renderSection(BAR_SECTIONS[1])}

        {/* Create — chooses between a rated plate and a Plato video. Not a
            section: tapped directly, never landed on by paging. */}
        <AnimatedPressable
          onPress={() => {
            tapMedium();
            setChooser(true);
          }}
          pressScale={0.92}
          style={[styles.create, { backgroundColor: colors.accent, shadowColor: colors.shadow }]}>
          <Ionicons name="add" size={30} color={colors.accentText} />
        </AnimatedPressable>

        {renderSection(BAR_SECTIONS[2])}
        {renderSection(BAR_SECTIONS[3])}
      </View>

      <ActionSheet
        visible={chooser}
        onClose={() => setChooser(false)}
        title="Create"
        actions={[
          {
            label: 'Rate a spot',
            icon: 'restaurant',
            onPress: () => router.push('/create-post'),
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
  const { promptForLocationOnce } = useLocation();

  /**
   * First run: ask for location once the user is actually inside the app.
   * Deliberately not on the auth screen or during the splash — a permission
   * dialog with no visible context behind it is the one people reflexively
   * decline, and on iOS that decline is permanent without a trip to Settings.
   * Granting it sets Plated's own location straight from the device.
   */
  useEffect(() => {
    if (signedIn) void promptForLocationOnce();
  }, [signedIn, promptForLocationOnce]);

  if (loading) return null; // session restoring — index.tsx shows the loader
  if (!signedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <MainPagerProvider>
      <ExploreModeProvider>
        <DiscoverSharedProvider>
          <Tabs
            screenOptions={{ headerShown: false }}
            tabBar={() => <PlatedTabBar />}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="explore" />
            <Tabs.Screen name="profile" />
          </Tabs>
        </DiscoverSharedProvider>
      </ExploreModeProvider>
    </MainPagerProvider>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  // A rounded square, not a circle, behind the active icon — reads as a
  // firmer, more "filled-in" tap target at this size.
  item: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  create: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
