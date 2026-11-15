import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_IDOL_ASSET, IDOL_ASSETS } from '@/components/dev/idolAssets';
import { SplatViewer } from '@/components/dev/SplatViewer';
import type { SplatViewerMessage } from '@/components/dev/splatViewerHtml';

type Stats = { count?: number; loadMs?: number; totalMs?: number; via?: string; fps?: number; error?: string };

export default function IdolDevScreen() {
  const { asset: assetParam } = useLocalSearchParams<{ asset?: string }>();
  const key = assetParam ?? DEFAULT_IDOL_ASSET;
  const entry = IDOL_ASSETS[key];
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<Stats>({});
  const mountedAt = useRef(0);

  useEffect(() => {
    mountedAt.current = Date.now();
  }, [key]);

  const handleMessage = useCallback((message: SplatViewerMessage) => {
    switch (message.type) {
      case 'loaded':
        setStats((s) => ({ ...s, count: message.count, loadMs: message.loadMs, via: message.via, totalMs: Date.now() - mountedAt.current }));
        break;
      case 'fps':
        setStats((s) => ({ ...s, fps: message.fps }));
        break;
      case 'error':
        setStats((s) => ({ ...s, error: message.message }));
        break;
    }
  }, []);

  const error = entry ? stats.error : `Unknown asset "${key}". Known: ${Object.keys(IDOL_ASSETS).join(', ')}`;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {entry ? <SplatViewer key={key} assetModule={entry.module} up={entry.up} yaw={entry.yaw} onMessage={handleMessage} /> : null}
      <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 8 }]}>
        <View pointerEvents="none" style={styles.panel}>
          <Text style={styles.title}>IDOL avatar (dev)</Text>
          {entry ? <Text style={styles.label}>{entry.label}</Text> : null}
          {entry ? <Text style={styles.meta}>{entry.source}</Text> : null}
          <Text style={styles.meta}>
            {stats.count != null ? `${stats.count.toLocaleString()} gaussians · page load ${stats.loadMs} ms · total ${stats.totalMs} ms · via ${stats.via}` : 'Loading...'}
          </Text>
          <Text style={styles.meta}>FPS {stats.fps ?? '–'}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.close}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#141210' },
  overlay: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  panel: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', gap: 2 },
  title: { color: '#fff', fontSize: 15, fontWeight: '600' },
  label: { color: '#fff', fontSize: 12, fontWeight: '700' },
  meta: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontVariant: ['tabular-nums'] },
  error: { color: '#FF8A7A', fontSize: 12, fontWeight: '600' },
  close: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)' },
  closeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
