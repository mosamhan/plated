import { StyleSheet } from 'react-native';

import { spacing } from '@/theme/palettes';

/** Shared styling across the onboarding wizard's step components. */
export const onboardingStyles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 24 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  content: { paddingHorizontal: spacing.xl },
  sub: { fontSize: 14, fontWeight: '500', marginBottom: spacing.xl },
  handleStatus: { fontSize: 12, fontWeight: '600', marginTop: -8, marginBottom: 14, marginLeft: 2 },
  msg: { fontSize: 13, fontWeight: '600', marginBottom: spacing.md, textAlign: 'center' },
  claimLink: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  change: { fontSize: 14, fontWeight: '700', marginTop: 12, textAlign: 'center' },
});
