import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { AVATAR_ASSETS, DEFAULT_AVATAR_KEY, DRESSED_AVATARS, MIRROR_ASSETS, PREFERRED_AVATAR_KEY, TINT_TEMPLATES } from '@/mirror/assets';
import { loadAssetSource } from '@/mirror/loadAsset';
import { MirrorSurface, type MirrorSurfaceHandle } from '@/mirror/MirrorSurface';
import type { HostMessage, ViewerGarment, ViewerMessage } from '@/mirror/protocol';
import { VIEWER_HTML } from '@/mirror/viewerHtml.generated';
import type { MirrorGarment, MirrorProps, MirrorState, MirrorViewerControls } from '@shared/contract';
import type { RenderSlot } from '@shared/renderAssets';

const READY_TIMEOUT_MS = 45000;
const FALLBACK_TINT = '#8A8580';

type Worn = Omit<ViewerGarment, 'src'> & { approximate?: string };

/** One entry per slot; a later garment for the same slot replaces an earlier one. */
function resolveOutfit(garmentAssetKeys: string[], garments: MirrorGarment[] | undefined) {
  const bySlot = new Map<string, Worn>();
  const skipped: string[] = [];
  const entries: MirrorGarment[] =
    garments ?? garmentAssetKeys.map((key) => ({ slot: MIRROR_ASSETS[key]?.slot ?? '', renderAssetKey: key, label: key }));
  for (const g of entries) {
    const known = g.renderAssetKey ? MIRROR_ASSETS[g.renderAssetKey] : undefined;
    if (known) {
      bySlot.set(known.slot, { id: known.key, slot: known.slot, asset: known.key, bit: known.bit, approximate: known.approximate });
      continue;
    }
    const template = TINT_TEMPLATES[g.slot as RenderSlot];
    if (!template) {
      skipped.push(g.label);
      continue;
    }
    const tint = g.colorHex ?? FALLBACK_TINT;
    bySlot.set(g.slot, {
      id: 'tint:' + g.slot + ':' + tint,
      slot: g.slot,
      asset: template,
      bit: MIRROR_ASSETS[template].bit,
      tint,
      approximate: g.label + ' (approximate color and shape)',
    });
  }
  return { worn: [...bySlot.values()], skipped };
}

export function Mirror({ avatar, garmentAssetKeys, garments, onStateChange, onControlsReady }: MirrorProps) {
  const surface = useRef<MirrorSurfaceHandle>(null);
  const sent = useRef(new Set<string>());
  const booted = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MirrorState>({ status: 'loading' });

  const avatarKey = avatar.demo || !AVATAR_ASSETS[avatar.key] ? (AVATAR_ASSETS[PREFERRED_AVATAR_KEY] ? PREFERRED_AVATAR_KEY : DEFAULT_AVATAR_KEY) : avatar.key;
  const dressed = DRESSED_AVATARS.has(avatarKey);
  const showDemoLabel = (avatar.demo || avatarKey !== avatar.key) && !dressed;
  const keysSignature = garmentAssetKeys.join('|');
  const garmentsSignature = JSON.stringify(garments ?? null);
  const outfit = useMemo(
    () => resolveOutfit(keysSignature ? keysSignature.split('|') : [], JSON.parse(garmentsSignature) ?? undefined),
    [keysSignature, garmentsSignature],
  );

  const report = useCallback(
    (next: MirrorState) => {
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  const send = useCallback((msg: HostMessage) => surface.current?.send(JSON.stringify(msg)), []);

  const pushScene = useCallback(async () => {
    try {
      const avatarSrc = sent.current.has(avatarKey) ? null : await loadAssetSource(AVATAR_ASSETS[avatarKey]);
      const list: ViewerGarment[] = [];
      for (const w of dressed ? [] : outfit.worn) {
        const src = sent.current.has(w.asset) ? undefined : await loadAssetSource(MIRROR_ASSETS[w.asset].asset);
        list.push({ id: w.id, slot: w.slot, asset: w.asset, bit: w.bit, tint: w.tint, src });
      }
      send({ type: 'scene', avatarId: avatarKey, avatarSrc, garments: list });
      sent.current.add(avatarKey);
      if (!dressed) for (const w of outfit.worn) sent.current.add(w.asset);
    } catch (e) {
      report({ status: 'error', message: e instanceof Error ? e.message : 'Could not load the mirror assets.' });
    }
  }, [avatarKey, dressed, outfit, send, report]);

  const retry = useCallback(() => {
    booted.current = false;
    sent.current = new Set();
    report({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, [report]);

  const controls = useMemo<MirrorViewerControls>(
    () => ({
      resetView: () => send({ type: 'reset' }),
      rotateTo: (yawDeg) => send({ type: 'rotateTo', yawDeg }),
      setZoom: (scale) => send({ type: 'zoom', scale }),
      retry,
    }),
    [send, retry],
  );

  const onMessage = useCallback(
    (raw: string) => {
      let msg: ViewerMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === 'booted') {
        booted.current = true;
        onControlsReady?.(controls);
        pushScene();
      } else if (msg.status === 'error') {
        sent.current = new Set();
        report({ status: 'error', message: msg.message });
      } else {
        report({ status: msg.status });
      }
    },
    [controls, onControlsReady, pushScene, report],
  );

  useEffect(() => {
    if (booted.current) pushScene();
  }, [pushScene]);

  useEffect(() => {
    if (state.status !== 'loading') return;
    const timer = setTimeout(() => report({ status: 'error', message: 'The mirror took too long to load.' }), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state.status, attempt, report]);

  const notes = dressed ? [] : [
    ...outfit.worn.flatMap((w) => (w.approximate ? ['Approximate: ' + w.approximate] : [])),
    ...outfit.skipped.map((label) => 'Not shown: ' + label),
  ];

  return (
    <View style={styles.viewport}>
      <MirrorSurface
        key={attempt}
        ref={surface}
        html={VIEWER_HTML}
        onMessage={onMessage}
        onFailure={(message) => report({ status: 'error', message })}
      />
      {showDemoLabel && (
        <View style={[styles.pill, styles.topLeft]} pointerEvents="none">
          <Text style={styles.pillText}>Demo avatar</Text>
        </View>
      )}
      {notes.length > 0 && (
        <View style={styles.notes} pointerEvents="none">
          {notes.map((n) => (
            <Text key={n} style={styles.note}>
              {n}
            </Text>
          ))}
        </View>
      )}
      {state.status === 'loading' && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color={Colors.inkSoft} />
          <Text style={styles.detail}>Loading mirror</Text>
        </View>
      )}
      {state.status === 'error' && (
        <View style={styles.center}>
          <View style={styles.card}>
            <Text style={styles.title}>The mirror could not load</Text>
            <Text style={styles.detail}>{state.message}</Text>
            <Pressable accessibilityRole="button" onPress={retry} style={styles.button}>
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, backgroundColor: Colors.mirror, borderRadius: Radius.lg, overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  topLeft: { position: 'absolute', top: Spacing.three, left: Spacing.three },
  pill: { backgroundColor: Colors.mockSoft, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  pillText: { color: Colors.mock, fontSize: 12, fontWeight: '600' },
  notes: { position: 'absolute', left: Spacing.three, right: Spacing.three, bottom: Spacing.three, gap: Spacing.one },
  note: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    color: Colors.inkSoft,
    fontSize: 11,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    overflow: 'hidden',
  },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.four, gap: Spacing.two, maxWidth: 280, alignItems: 'center' },
  title: { fontFamily: Fonts.serif, fontSize: 17, color: Colors.ink },
  detail: { fontSize: 13, color: Colors.muted, textAlign: 'center' },
  button: { marginTop: Spacing.one, backgroundColor: Colors.accent, borderRadius: Radius.pill, paddingHorizontal: Spacing.five, paddingVertical: Spacing.two },
  buttonText: { color: Colors.onAccent, fontWeight: '600' },
});
