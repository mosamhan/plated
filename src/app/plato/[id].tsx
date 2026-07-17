import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlatoReel } from '@/components/PlatoReel';
import { usePlatos } from '@/store/PlatosContext';

/** Full-screen player for a single Plato (opened from a profile grid tile). */
export default function PlatoViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { platos } = usePlatos();
  const plato = platos.find((p) => p.id === id);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {plato ? (
        <PlatoReel video={plato} active height={height} bottomInset={insets.bottom + 12} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' }}>
            Plato not found.
          </Text>
        </View>
      )}
      <Pressable onPress={() => router.back()} hitSlop={8} style={[styles.back, { top: insets.top + 8 }]}>
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    position: 'absolute',
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(20,20,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
