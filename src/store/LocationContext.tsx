import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'plated.location';
/** Set once we've asked, so a decline isn't re-prompted on every launch. */
const ASKED_KEY = 'plated.locationAsked';

export interface PlatedLocation {
  label: string; // e.g. "New York, NY"
  lat?: number;
  lng?: number;
  /** US postal code, when reverse geocoding returns one — drives sponsored-placement zip targeting. */
  zip?: string;
  source: 'device' | 'manual' | 'default';
}

const DEFAULT_LOCATION: PlatedLocation = { label: 'New York, NY', source: 'default' };

interface LocationContextValue {
  location: PlatedLocation;
  /** Foursquare query params for the active location. */
  placeQuery: { ll?: string; near?: string };
  busy: boolean;
  error: string | null;
  useDeviceLocation: () => Promise<boolean>;
  /**
   * First-run only: asks for location permission and, if granted, sets Plated's
   * location from the device. No-ops once asked, and no-ops if a location has
   * already been chosen — re-asking someone who declined is what turns a soft
   * no into a permanent one.
   */
  promptForLocationOnce: () => Promise<void>;
  setManualLocation: (label: string, coords?: { lat: number; lng: number }) => void;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<PlatedLocation>(DEFAULT_LOCATION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The stored location has been read; prompting before this would race it. */
  const [restored, setRestored] = useState(false);

  // Restore the saved location on launch.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setLocation(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setRestored(true));
  }, []);

  const persist = useCallback((loc: PlatedLocation) => {
    setLocation(loc);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(loc)).catch(() => {});
  }, []);

  const useDeviceLocation = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setError('Location permission denied. You can set a city manually instead.');
        return false;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      // Reverse geocode to a friendly label (best-effort).
      let label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
      let zip: string | undefined;
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (place) {
          const city = place.city || place.subregion || place.district;
          label = city && place.region ? `${city}, ${place.region}` : city || place.region || label;
          zip = place.postalCode ?? undefined;
        }
      } catch {
        /* keep coord label */
      }
      persist({ label, lat: latitude, lng: longitude, zip, source: 'device' });
      return true;
    } catch {
      setError('Could not get your location. Try again or set a city manually.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [persist]);

  const setManualLocation = useCallback(
    (label: string, coords?: { lat: number; lng: number }) => {
      persist({ label: label.trim(), lat: coords?.lat, lng: coords?.lng, source: 'manual' });
    },
    [persist],
  );

  const promptForLocationOnce = useCallback(async () => {
    if (!restored) return;
    const asked = await AsyncStorage.getItem(ASKED_KEY).catch(() => null);
    if (asked) return;
    // Mark first, not after: a crash or a backgrounded prompt mid-flow
    // shouldn't queue the OS dialog up again next launch.
    await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
    if (location.source !== 'default') return;
    await useDeviceLocation();
  }, [restored, location.source, useDeviceLocation]);

  const placeQuery =
    location.lat != null && location.lng != null
      ? { ll: `${location.lat},${location.lng}` }
      : { near: location.label };

  const value: LocationContextValue = {
    location,
    placeQuery,
    busy,
    error,
    useDeviceLocation,
    setManualLocation,
    promptForLocationOnce,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within a LocationProvider');
  return ctx;
}
