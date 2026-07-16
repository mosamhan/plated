import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'plated.location';

export interface PlatedLocation {
  label: string; // e.g. "New York, NY"
  lat?: number;
  lng?: number;
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
  setManualLocation: (label: string, coords?: { lat: number; lng: number }) => void;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<PlatedLocation>(DEFAULT_LOCATION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore the saved location on launch.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setLocation(JSON.parse(raw));
      })
      .catch(() => {});
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
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (place) {
          const city = place.city || place.subregion || place.district;
          label = city && place.region ? `${city}, ${place.region}` : city || place.region || label;
        }
      } catch {
        /* keep coord label */
      }
      persist({ label, lat: latitude, lng: longitude, source: 'device' });
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
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within a LocationProvider');
  return ctx;
}
