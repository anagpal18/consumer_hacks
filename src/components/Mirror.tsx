import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { AVATARS, DEFAULT_AVATAR_KEY, DRESSED_AVATARS, MIRROR_ASSETS, PREFERRED_AVATAR_KEY, TINT_TEMPLATES } from '@/mirror/assets';
import { loadAssetSource } from '@/mirror/loadAsset';
import { MirrorSurface, type MirrorSurfaceHandle } from '@/mirror/MirrorSurface';
import type { HostMessage, ViewerBody, ViewerGarment, ViewerMessage } from '@/mirror/protocol';
import { VIEWER_HTML } from '@/mirror/viewerHtml.generated';
import type { AvatarBody, MirrorGarment, MirrorProps, MirrorState, MirrorViewerControls } from '@shared/contract';
import { AVATAR_PRESETS, HEIGHT_RANGE_CM, PROPORTION_KEYS, UNSPECIFIED_SEX_RENDERS_AS, type RenderSlot } from '@shared/renderAssets';

const READY_TIMEOUT_MS = 45000;
const FALLBACK_TINT = '#8A8580';

type Worn = Omit<ViewerGarment, 'src'> & { file: number; approximate?: string };

/** Body sent for avatars without morph targets: their own shape, height and skin. */
const AS_MODELED: ViewerBody = { meshPreset: 'male-average', female: false, skinTone: null, heightScale: 1, proportions: {} };

/**
 * Proportions are -1..1 in the contract; the morphs were built at the clean limit,
 * so the full range is safe and values are only clamped to it.
 */
function resolveBody(body: AvatarBody | undefined): ViewerBody {
  const sex = !body || body.sex === 'unspecified' ? UNSPECIFIED_SEX_RENDERS_AS : body.sex;
  const preset = AVATAR_PRESETS.find((p) => p.sex === sex && p.preset === (body?.preset ?? 'average')) ?? AVATAR_PRESETS[4];
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0));
  const heightCm = body?.heightCm ? clamp(body.heightCm, HEIGHT_RANGE_CM.min, HEIGHT_RANGE_CM.max) : preset.naturalHeightCm;
  return {
    meshPreset: preset.key,
    female: sex === 'female',
    skinTone: body?.skinTone && /^#[0-9a-f]{6}$/i.test(body.skinTone) ? body.skinTone : null,
    heightScale: heightCm / preset.naturalHeightCm,
    proportions: Object.fromEntries(PROPORTION_KEYS.map((k) => [k, clamp(body?.proportions?.[k] ?? 0, -1, 1)])),
  };
}

/**
 * One entry per slot; a later garment for the same slot replaces an earlier one.
 * Garment GLBs are looked up on the current avatar; a key without one there gets the
 * slot's tint stand-in, and a slot without a stand-in on that avatar is listed as not shown.
 */
function resolveOutfit(avatarKey: string, garmentAssetKeys: string[], garments: MirrorGarment[] | undefined) {
  const files = AVATARS[avatarKey].garments;
  const bySlot = new Map<string, Worn>();
  const skipped: string[] = [];
  const entries: MirrorGarment[] =
    garments ?? garmentAssetKeys.map((key) => ({ slot: MIRROR_ASSETS[key]?.slot ?? '', renderAssetKey: key, label: key }));
  for (const g of entries) {
    const known = g.renderAssetKey ? MIRROR_ASSETS[g.renderAssetKey] : undefined;
    if (known && files[known.key]) {
      const asset = avatarKey + '|' + known.key;
      bySlot.set(known.slot, {
        id: asset,
        slot: known.slot,
        asset,
        file: files[known.key],
        bit: known.bit,
        approximate: known.approximate,
      });
      continue;
    }
    const template = TINT_TEMPLATES[g.slot as RenderSlot];
    if (!template || !files[template]) {
      skipped.push(g.label);
      continue;
    }
    const tint = g.colorHex ?? FALLBACK_TINT;
    bySlot.set(g.slot, {
      id: 'tint:' + avatarKey + ':' + g.slot + ':' + tint,
      slot: g.slot,
      asset: avatarKey + '|' + template,
      file: files[template],
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

  const avatarKey = avatar.demo || !AVATARS[avatar.key] ? (AVATARS[PREFERRED_AVATAR_KEY] ? PREFERRED_AVATAR_KEY : DEFAULT_AVATAR_KEY) : avatar.key;
  const morphs = AVATARS[avatarKey].morphs;
  const dressed = DRESSED_AVATARS.has(avatarKey);
  const badge = avatar.demo || avatarKey !== avatar.key ? AVATARS[avatarKey].label : morphs ? null : AVATARS[avatarKey].label;
  const keysSignature = garmentAssetKeys.join('|');
  const garmentsSignature = JSON.stringify(garments ?? null);
  const bodySignature = JSON.stringify(avatar.body ?? null);
  const viewerBody = useMemo(() => (morphs ? resolveBody(JSON.parse(bodySignature) ?? undefined) : AS_MODELED), [morphs, bodySignature]);
  const outfit = useMemo(
    () => resolveOutfit(avatarKey, keysSignature ? keysSignature.split('|') : [], JSON.parse(garmentsSignature) ?? undefined),
    [avatarKey, keysSignature, garmentsSignature],
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
      const avatarSrc = sent.current.has(avatarKey) ? null : await loadAssetSource(AVATARS[avatarKey].asset);
      const list: ViewerGarment[] = [];
      for (const w of dressed ? [] : outfit.worn) {
        const src = sent.current.has(w.asset) ? undefined : await loadAssetSource(w.file);
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
        send({ type: 'body', body: viewerBody });
        pushScene();
      } else if (msg.status === 'error') {
        sent.current = new Set();
        report({ status: 'error', message: msg.message });
      } else {
        report({ status: msg.status });
      }
    },
    [controls, onControlsReady, pushScene, report, send, viewerBody],
  );

  useEffect(() => {
    if (booted.current) pushScene();
  }, [pushScene]);

  useEffect(() => {
    if (booted.current) send({ type: 'body', body: viewerBody });
  }, [send, viewerBody]);

  useEffect(() => {
    if (state.status !== 'loading') return;
    const timer = setTimeout(() => report({ status: 'error', message: 'The mirror took too long to load.' }), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state.status, attempt, report]);

  const notes = dressed ? ['The avatar wears its own outfit. Your pieces are shown as photos.'] : [
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
      {badge && (
        <View style={[styles.pill, styles.topLeft]} pointerEvents="none">
          <Text style={styles.pillText}>{badge}</Text>
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
