import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';

interface Props {
  uri: string;
  size?: number;
  verified?: boolean;
  ring?: boolean;
}

export function Avatar({ uri, size = 44, verified, ring }: Props) {
  const { colors } = useTheme();
  return (
    <View>
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ring ? 2 : 0,
          borderColor: colors.accent,
          backgroundColor: colors.surface,
        }}
        contentFit="cover"
        transition={200}
      />
      {verified && (
        <View
          style={[
            styles.verified,
            {
              backgroundColor: colors.accent,
              borderColor: colors.card,
              width: size * 0.38,
              height: size * 0.38,
              borderRadius: size * 0.19,
            },
          ]}>
          <Ionicons name="checkmark" size={size * 0.22} color={colors.accentText} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  verified: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
});
