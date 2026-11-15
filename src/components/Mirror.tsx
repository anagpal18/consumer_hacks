import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import type { MirrorProps } from '@shared/contract';

/**
 * Mirror slot. PLACEHOLDER: a flat paper figure, not the real renderer.
 *
 * Kenil replaces the body of this component with the 3D viewer. The props are the
 * Mirror adapter in shared/contract.ts: avatar reference and garment asset keys in,
 * ready/error state and viewer controls out. Home lays its own controls over this
 * view, so fill the parent and leave the center free for rotate and zoom gestures.
 */

type Slot = 'outerwear' | 'top' | 'bottom' | 'shoes';

const DEMO_ASSETS: Record<string, { slot: Slot; color: string }> = {
  'demo/jacket-denim': { slot: 'outerwear', color: '#3F5878' },
  'demo/shirt-white': { slot: 'top', color: '#F1EEE8' },
  'demo/tee-black': { slot: 'top', color: '#1E1E1E' },
  'demo/trousers-charcoal': { slot: 'bottom', color: '#3B3B40' },
  'demo/sneakers-white': { slot: 'shoes', color: '#EDEAE4' },
  'demo/boots-brown': { slot: 'shoes', color: '#6B4630' },
};

const SKIN = '#C9A58A';
const BARE = '#B9AD9E';
const FIGURE_HEIGHT = 360;

export function Mirror({ avatar, garmentAssetKeys, onStateChange, onControlsReady }: MirrorProps) {
  const [yaw, setYaw] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [height, setHeight] = useState(0);
  const drag = useRef({ x: 0, yaw: 0 });

  useEffect(() => {
    onStateChange?.({ status: 'loading' });
    const timer = setTimeout(() => onStateChange?.({ status: 'ready' }), 500);
    onControlsReady?.({
      resetView: () => {
        setYaw(0);
        setZoom(1);
      },
      rotateTo: setYaw,
      setZoom,
      retry: () => onStateChange?.({ status: 'ready' }),
    });
    return () => clearTimeout(timer);
  }, [onStateChange, onControlsReady]);


  const worn: Partial<Record<Slot, string>> = {};
  for (const key of garmentAssetKeys) {
    const asset = DEMO_ASSETS[key];
    if (asset) worn[asset.slot] = asset.color;
  }
  const torso = worn.top ?? BARE;
  const sleeves = worn.outerwear ?? torso;
  const scale = height > 0 ? Math.min(1.5, Math.max(0.5, (height * 0.62) / FIGURE_HEIGHT)) * zoom : 1;
  const turn = Math.cos((yaw * Math.PI) / 180);

  return (
    <View style={styles.viewport} onLayout={(event) => setHeight(event.nativeEvent.layout.height)} 
      onStartShouldSetResponder={() => true}
      onResponderGrant={(event) => {
        drag.current = { x: event.nativeEvent.pageX, yaw };
      }}
      onResponderMove={(event) => setYaw(drag.current.yaw + (event.nativeEvent.pageX - drag.current.x) * 0.8)}>
      <View style={styles.floor} />
      <View style={[styles.figure, { transform: [{ scale }, { scaleX: Math.abs(turn) < 0.15 ? 0.15 : turn }] }]}>
        <View style={styles.head} />
        <View style={styles.neck} />
        <View style={styles.upper}>
          <View style={[styles.arm, { backgroundColor: sleeves }]} />
          <View style={[styles.torso, { backgroundColor: torso }]}>
            {worn.outerwear ? (
              <>
                <View style={[styles.lapel, { left: 0, backgroundColor: worn.outerwear }]} />
                <View style={[styles.lapel, { right: 0, backgroundColor: worn.outerwear }]} />
              </>
            ) : null}
          </View>
          <View style={[styles.arm, { backgroundColor: sleeves }]} />
        </View>
        <View style={styles.lower}>
          <View style={[styles.leg, { backgroundColor: worn.bottom ?? BARE }]} />
          <View style={[styles.leg, { backgroundColor: worn.bottom ?? BARE }]} />
        </View>
        <View style={styles.lower}>
          <View style={[styles.shoe, { backgroundColor: worn.shoes ?? BARE }]} />
          <View style={[styles.shoe, { backgroundColor: worn.shoes ?? BARE }]} />
        </View>
      </View>
      <View style={styles.tag} pointerEvents="none">
        <Text style={styles.tagText}>Placeholder mirror</Text>
        <Text style={styles.tagText}>{avatar.demo ? 'Demo avatar' : 'Avatar'} · drag to turn</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, backgroundColor: Colors.mirror, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%', backgroundColor: Colors.mirrorDeep },
  figure: { alignItems: 'center', height: FIGURE_HEIGHT, marginBottom: 40 },
  head: { width: 46, height: 52, borderRadius: 23, backgroundColor: SKIN },
  neck: { width: 18, height: 10, backgroundColor: SKIN },
  upper: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  arm: { width: 22, height: 118, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  torso: { width: 88, height: 128, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  lapel: { position: 'absolute', top: 0, bottom: 0, width: 30 },
  lower: { flexDirection: 'row', gap: 6 },
  leg: { width: 40, height: 150, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  shoe: { width: 46, height: 18, borderRadius: 8, marginHorizontal: -3, borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
  tag: {
    position: 'absolute',
    top: 290,
    left: 12,
    backgroundColor: Colors.mockSoft,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: { fontSize: 10, fontWeight: '600', color: Colors.mock },
});
