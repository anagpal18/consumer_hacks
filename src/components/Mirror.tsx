import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import type { MirrorProps } from '@shared/contract';

/**
 * Mirror slot. Kenil replaces the body of this component with the real 3D viewer;
 * the props are the Mirror adapter in shared/contract.ts and must not change shape here.
 */
export function Mirror({ avatar, garmentAssetKeys, onStateChange, onControlsReady }: MirrorProps) {
  useEffect(() => {
    onStateChange?.({ status: 'ready' });
    onControlsReady?.({ resetView() {}, rotateTo() {}, setZoom() {}, retry() {} });
  }, [onStateChange, onControlsReady]);

  return (
    <View style={styles.viewport}>
      <Text style={styles.label}>Mirror placeholder</Text>
      <Text style={styles.detail}>
        {avatar.demo ? 'Demo avatar' : 'Avatar'}: {avatar.key}
      </Text>
      {garmentAssetKeys.map((key) => (
        <Text key={key} style={styles.detail}>
          {key}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    backgroundColor: Colors.mirror,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  label: { fontFamily: Fonts.serif, fontSize: 20, color: Colors.ink },
  detail: { fontSize: 12, color: Colors.muted },
});
