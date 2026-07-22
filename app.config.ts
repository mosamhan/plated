import type { ExpoConfig } from 'expo/config';

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
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.samhan.plated',
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
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFDF8',
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
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
