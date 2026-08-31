import type { ExpoConfig } from 'expo/config';
import type { ConfigPlugin } from '@expo/config-plugins';
import { withEntitlementsPlist } from 'expo/config-plugins';

// expo-notifications unconditionally adds the aps-environment entitlement,
// which requires an Apple Developer Program (paid) team to sign — personal/free
// teams can't create a provisioning profile with Push Notifications capability.
// We only use local notifications (see the expo-notifications entry below), so
// drop the entitlement to keep local/personal-team builds signable.
const withoutPushEntitlement: ConfigPlugin = (config) =>
  withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });

// Converted from app.json → app.config.ts so native config values (like the
// Google Maps API keys below) can be read from process.env at config-eval
// time. Plain app.json can't interpolate env vars — it's static JSON.
//
// These are NOT EXPO_PUBLIC_-prefixed: they're consumed only by the
// react-native-maps config plugin at prebuild time (baked into
// Info.plist / AndroidManifest.xml), never inlined into the JS bundle.
const GOOGLE_MAPS_IOS_API_KEY = process.env.GOOGLE_MAPS_IOS_API_KEY ?? '';
const GOOGLE_MAPS_ANDROID_API_KEY = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '';

const config: ExpoConfig = {
  name: 'Plated',
  slug: 'plated',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'plated',
  // 'automatic' is required for the Appearance → Automatic option: with a fixed
  // style, iOS reports that style to useColorScheme() and auto can never resolve
  // to dark. The in-app palette is still chosen by ThemeContext, not by iOS.
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.samhan.plated',
    // Apple requires Sign in with Apple wherever a third-party social login
    // (Google, here) is offered — see App Store Review Guideline 4.8.
    usesAppleSignIn: true,
    icon: {
      // Wordmark tile — Fraunces "Plated" on the amber-gold gradient (light) /
      // charcoal (dark). iOS 18+ switches automatically with system appearance.
      light: './assets/images/icon.png',
      dark: './assets/images/icon-dark.png',
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.samhan.plated',
    adaptiveIcon: {
      backgroundColor: '#EAA01A',
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-asset',
    '@react-native-community/datetimepicker',
    // @ts-expect-error — ExpoConfig['plugins'] types only allow string/tuple
    // entries, but Expo's plugin resolver also accepts a bare ConfigPlugin
    // function at runtime (confirmed via `expo prebuild`); there's no typed
    // escape hatch for that form.
    withoutPushEntitlement,
    // Local check-in reminders only — no push credentials involved, so there's
    // nothing to configure beyond registering the module.
    ['expo-notifications', {}],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFDF8',
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
        // Matches the dark app-icon variant — a warm charcoal tile with the
        // amber wordmark — so launching in dark mode doesn't flash a cream
        // screen before the (dark) app renders.
        dark: {
          backgroundColor: '#14120F',
          image: './assets/images/splash-icon-dark.png',
          imageWidth: 160,
        },
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Plated needs access to your photos so you can add a plate you rated.',
        cameraPermission: 'Plated needs your camera to snap a photo of your plate.',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Plated uses your location to show restaurants near you.',
      },
    ],
    'expo-video',
    'expo-image',
    'expo-dev-client',
    [
      'react-native-maps',
      {
        iosGoogleMapsApiKey: GOOGLE_MAPS_IOS_API_KEY,
        androidGoogleMapsApiKey: GOOGLE_MAPS_ANDROID_API_KEY,
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
    reactCompiler: true,
  },
};

export default config;
