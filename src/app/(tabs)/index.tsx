import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mirror } from '@/components/Mirror';
import { Button, CATEGORY_LABEL, GarmentThumb, MockBadge } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { api } from '@/data/api';
import { useCloset, useProfile } from '@/data/hooks';
import { setSession, useSession } from '@/state/session';
import type {
  ClosetItem,
  ConfirmWearResult,
  GarmentCategory,
  Id,
  MirrorState,
  MirrorViewerControls,
  SuggestedOutfit,
} from '@shared/contract';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const closet = useCloset();
  const { homeNotice, pendingPrompt } = useSession();

  const [prompt, setPrompt] = useState('');
  const [occasion, setOccasion] = useState('');
  const [outfits, setOutfits] = useState<SuggestedOutfit[]>([]);
  const [lookIndex, setLookIndex] = useState(0);
  const [locked, setLocked] = useState<Id[]>([]);
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [skipped, setSkipped] = useState<Partial<Record<GarmentCategory, Id[]>>>({});
  const [change, setChange] = useState<{ text: string; newItemId?: Id } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<ConfirmWearResult | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [mirrorState, setMirrorState] = useState<MirrorState>({ status: 'loading' });
  const [controls, setControls] = useState<MirrorViewerControls | null>(null);
  const [view, setView] = useState({ yaw: 0, zoom: 1 });
  const autoStarted = useRef(false);
  const wearRequest = useRef({ key: '', id: '' });

  const byId = (id: Id) => closet?.find((item) => item.itemId === id);
  const hasCloset = !!closet && closet.length > 0;
  const outfit = outfits[lookIndex];
  const items = (outfit?.itemIds ?? []).map(byId).filter((item): item is ClosetItem => !!item);
  const selected = items.find((item) => item.itemId === selectedId);
  const unavailable = items.find((item) => item.availability !== 'available');

  async function suggest(text: string) {
    if (text.trim()) setSession({ homeNotice: null });
    setBusy(true);
    setMessage(null);
    setChange(null);
    try {
      const result = await api.stylist.suggest({ prompt: text, lockedItemIds: locked });
      const gone = result.lockedUnavailableItemIds ?? [];
      if (gone.length > 0) {
        setLocked(locked.filter((id) => !gone.includes(id)));
        setMessage('A locked piece is no longer available, so it was unlocked. Ask again.');
        return;
      }
      if (result.outfits.length === 0) {
        setMessage('Nothing clean to style right now. Mark laundry done in Closet.');
        return;
      }
      setOutfits(result.outfits);
      setLookIndex(0);
      setOccasion(text.trim());
      setSelectedId(null);
      setSkipped({});
      setSaved(null);
    } catch {
      setMessage('The stylist did not answer. Try again.');
    } finally {
      setBusy(false);
    }
  }

  /** Change exactly one piece: every other piece is sent as locked. */
  async function replaceItem(item: ClosetItem, cause: 'change' | 'laundry') {
    if (!outfit) return;
    const others = outfit.itemIds.filter((id) => id !== item.itemId);
    const label = CATEGORY_LABEL[item.category];
    const kept = byId(others.find((id) => locked.includes(id)) ?? others[0]);
    setSession({ homeNotice: null });
    setBusy(true);
    setMessage(null);
    try {
      const find = async (exclude: Id[]) => {
        const result = await api.stylist.suggest({
          prompt: occasion,
          lockedItemIds: others,
          excludeItemIds: exclude,
          currentItemIds: outfit.itemIds,
        });
        const next = result.outfits[0];
        const swap = next?.swaps?.find((entry) => entry.from === item.itemId);
        const itemId = swap
          ? swap.to
          : next?.itemIds.find((id) => id !== item.itemId && byId(id)?.category === item.category);
        return itemId ? { itemId, outfitId: next.outfitId } : null;
      };
      const seen = cause === 'change' ? (skipped[item.category] ?? []) : [];
      let replacement = await find([item.itemId, ...seen]);
      let nextSeen = [...seen, item.itemId];
      if (!replacement && seen.length > 0 && cause === 'change') {
        replacement = await find([item.itemId]);
        nextSeen = [item.itemId];
      }
      if (!replacement && cause === 'change') {
        setMessage(`No other clean ${label.toLowerCase()} in your closet.`);
        return;
      }
      const itemIds = replacement
        ? outfit.itemIds.map((id) => (id === item.itemId ? replacement.itemId : id))
        : others;
      setOutfits(outfits.map((entry, index) => (index === lookIndex ? { ...entry, itemIds, outfitId: replacement?.outfitId ?? entry.outfitId } : entry)));
      setSkipped({ ...skipped, [item.category]: nextSeen });
      setLocked(locked.filter((id) => id !== item.itemId));
      setSelectedId(replacement?.itemId ?? null);
      setSaved(null);
      const stayed = kept ? ` ${kept.name} stayed.` : '';
      const newName = replacement ? byId(replacement.itemId)?.name : null;
      setChange({
        newItemId: replacement?.itemId,
        text:
          cause === 'laundry'
            ? newName
              ? `${item.name} went to laundry. ${label} changed to ${newName}.${stayed}`
              : `${item.name} went to laundry. Nothing clean to replace it.${stayed}`
            : `${label} changed: ${item.name} → ${newName}.${stayed}`,
      });
    } catch {
      setMessage('Could not change that piece. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmWear() {
    if (!outfit) return;
    const key = outfit.itemIds.join('+');
    if (wearRequest.current.key !== key) wearRequest.current = { key, id: `wear_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.outfits.confirmWear({
        itemIds: outfit.itemIds,
        requestId: wearRequest.current.id,
        outfitId: outfit.outfitId,
        occasion: occasion || undefined,
        tzOffsetMinutes: -new Date().getTimezoneOffset(),
      });
      setSaved(result);
      setSavedOpen(true);
      setChange(null);
    } catch {
      setMessage('Could not save this wear. Tap Wearing this again; it will not count twice.');
    } finally {
      setBusy(false);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hasCloset) return;
    if (pendingPrompt) {
      autoStarted.current = true;
      setSession({ pendingPrompt: null });
      setPrompt(pendingPrompt);
      suggest(pendingPrompt);
    } else if (!autoStarted.current) {
      autoStarted.current = true;
      suggest('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCloset, pendingPrompt]);

  // A piece that leaves the closet's available set (here or on another device) is swapped out alone.
  useEffect(() => {
    if (unavailable && !busy) replaceItem(unavailable, 'laundry');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unavailable?.itemId, busy]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (profile && !profile.onboarded) return <Redirect href="/onboarding" />;

  const approximate = items.filter((item) => !item.renderAssetKey);
  const topChallenge = saved?.challenge[0];
  const turn = (yaw: number, zoom: number) => {
    setView({ yaw, zoom });
    controls?.rotateTo(yaw);
    controls?.setZoom(zoom);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.mirrorArea}>
        <Mirror
          avatar={profile?.avatar ?? { kind: 'preset', key: 'demo/avatar-a', demo: true }}
          garmentAssetKeys={items.map((item) => item.renderAssetKey).filter((key): key is string => !!key)}
          onStateChange={setMirrorState}
          onControlsReady={setControls}
        />

        <View style={[styles.topBar, { top: insets.top + Spacing.two }]} pointerEvents="box-none">
          <Text style={styles.brand}>Wear Again</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Profile" hitSlop={10} onPress={() => router.push('/profile')} style={styles.roundButton}>
            <Ionicons name="person-outline" size={20} color={Colors.ink} />
          </Pressable>
        </View>

        <View style={[styles.viewerControls, { top: insets.top + 60 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Turn avatar" onPress={() => turn((view.yaw + 90) % 360, view.zoom)} style={styles.roundButton}>
            <Ionicons name="sync-outline" size={18} color={Colors.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom" onPress={() => turn(view.yaw, view.zoom > 1 ? 1 : 1.5)} style={styles.roundButton}>
            <Ionicons name={view.zoom > 1 ? 'remove-outline' : 'add-outline'} size={18} color={Colors.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset view" onPress={() => { setView({ yaw: 0, zoom: 1 }); controls?.resetView(); }} style={styles.roundButton}>
            <Ionicons name="scan-outline" size={18} color={Colors.ink} />
          </Pressable>
        </View>

        {mirrorState.status === 'loading' ? (
          <View style={styles.viewerStatus}>
            <Text style={styles.viewerStatusText}>Preparing the mirror…</Text>
          </View>
        ) : null}
        {mirrorState.status === 'error' ? (
          <View style={styles.viewerStatus}>
            <Text style={styles.viewerStatusText}>{mirrorState.message}</Text>
            <Button label="Retry" compact variant="secondary" onPress={() => controls?.retry()} />
          </View>
        ) : null}
        {profile?.avatarStatus === 'preparing' ? (
          <View style={[styles.viewerStatus, { top: insets.top + 60 }]}>
            <Text style={styles.viewerStatusText}>Preparing your avatar. Showing the demo avatar for now.</Text>
          </View>
        ) : null}

        {approximate.length > 0 ? (
          <View style={[styles.approximate, { top: insets.top + 170 }]}>
            <Text style={styles.approximateLabel}>Shown as photo</Text>
            {approximate.map((item) => (
              <GarmentThumb key={item.itemId} media={item.media} colorHex={item.colorHex} category={item.category} size={40} />
            ))}
          </View>
        ) : null}

        <View style={styles.banners} pointerEvents="box-none">
          {homeNotice ? (
            <Pressable style={[styles.banner, styles.bannerSuccess]} onPress={() => setSession({ homeNotice: null })}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.bannerText}>{homeNotice}</Text>
              <Ionicons name="close" size={16} color={Colors.muted} />
            </Pressable>
          ) : null}
          {change ? (
            <View style={[styles.banner, styles.bannerChange]} testID="change-banner">
              <Ionicons name="swap-horizontal" size={18} color={Colors.accent} />
              <Text style={styles.bannerText}>{change.text}</Text>
            </View>
          ) : null}
          {message ? (
            <View style={styles.banner}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.inkSoft} />
              <Text style={styles.bannerText}>{message}</Text>
            </View>
          ) : null}
        </View>

        {saved && savedOpen ? (
          <View style={[styles.savedCard, { top: insets.top + 56 }]} testID="wear-saved">
            <View style={styles.savedHeader}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
              <Text style={styles.savedTitle}>Wear saved</Text>
            </View>
            <Text style={styles.savedText}>
              {saved.wear.itemIds.length} pieces logged{occasion ? ` for ${occasion}` : ''}. Tomorrow&apos;s look will account for it.
            </Text>
            {topChallenge ? (
              <Text style={styles.savedText}>
                One Piece, Three Ways: {byId(topChallenge.itemId)?.name} is at {topChallenge.distinctOutfits} of {topChallenge.target}.
              </Text>
            ) : null}
            {saved.streakDays ? (
              <Text style={styles.savedText}>
                {saved.streakDays}-day streak.
              </Text>
            ) : null}
            <View style={styles.savedActions}>
              <Button label="Add a private photo" compact variant="secondary" icon="camera-outline" onPress={() => router.push('/profile')} />
              <Button label="Done" compact onPress={() => setSavedOpen(false)} />
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.panel}>
        {!closet ? (
          <Text style={styles.reason}>Opening your closet…</Text>
        ) : !hasCloset ? (
          <>
            <Text style={styles.title}>Your closet is empty</Text>
            <Text style={styles.reason}>Record a short video of your clothes, confirm what we find, and get dressed from what you own.</Text>
            <Button label="Scan your closet" icon="videocam-outline" testID="scan-cta" onPress={() => router.push('/scan')} />
            {api.dev ? <Button label="Load sample closet instead" variant="ghost" compact onPress={() => api.dev?.loadSampleCloset()} /> : null}
          </>
        ) : (
          <>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {occasion ? `For ${occasion}` : "Today's look"}
              </Text>
              {outfits.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Show the other look"
                  onPress={() => { setLookIndex((lookIndex + 1) % outfits.length); setSelectedId(null); setChange(null); setSaved(null); }}
                  style={styles.lookSwitch}>
                  <Text style={styles.lookSwitchText}>Look {lookIndex + 1} of {outfits.length}</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
                </Pressable>
              ) : null}
              {api.usingMockData ? <MockBadge label="Sample" /> : null}
            </View>

            {selected ? (
              <View style={styles.actions}>
                <Button
                  label={locked.includes(selected.itemId) ? 'Unlock' : 'Lock'}
                  icon={locked.includes(selected.itemId) ? 'lock-open-outline' : 'lock-closed-outline'}
                  compact
                  variant="secondary"
                  testID="action-lock"
                  style={styles.action}
                  onPress={() => setLocked(locked.includes(selected.itemId) ? locked.filter((id) => id !== selected.itemId) : [...locked, selected.itemId])}
                />
                <Button
                  label="Change"
                  icon="swap-horizontal"
                  compact
                  variant="secondary"
                  testID="action-change"
                  style={styles.action}
                  disabled={busy || locked.includes(selected.itemId)}
                  onPress={() => replaceItem(selected, 'change')}
                />
                <Button
                  label="In laundry"
                  icon="water-outline"
                  compact
                  variant="secondary"
                  testID="action-laundry"
                  style={styles.action}
                  disabled={busy}
                  onPress={() => api.closet.setStatus({ itemId: selected.itemId, availability: 'laundry' })}
                />
              </View>
            ) : (
              <Text style={styles.reason} numberOfLines={2}>
                {busy && !outfit ? 'Styling from your closet…' : (outfit?.reason ?? 'Tell me your plans and I will pick a look.')}
              </Text>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {items.map((item) => {
                const isLocked = locked.includes(item.itemId);
                return (
                  <Pressable
                    key={item.itemId}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}${isLocked ? ', locked' : ''}`}
                    accessibilityHint="Tap to lock, change or send to laundry. Long press to lock."
                    testID={`chip-${item.category}`}
                    onPress={() => setSelectedId(selectedId === item.itemId ? null : item.itemId)}
                    onLongPress={() => setLocked(isLocked ? locked.filter((id) => id !== item.itemId) : [...locked, item.itemId])}
                    style={[styles.chip, selectedId === item.itemId && styles.chipSelected, change?.newItemId === item.itemId && styles.chipNew]}>
                    <GarmentThumb media={item.media} colorHex={item.colorHex} category={item.category} size={40} />
                    <View>
                      <Text style={styles.chipName} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.chipMeta, change?.newItemId === item.itemId && { color: Colors.accent }]}>
                        {change?.newItemId === item.itemId ? 'Just changed' : isLocked ? 'Locked' : CATEGORY_LABEL[item.category]}
                      </Text>
                    </View>
                    {isLocked ? <Ionicons name="lock-closed" size={14} color={Colors.ink} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            {!selected && items.length > 0 ? <Text style={styles.hint}>Tap a piece to lock it, change it or send it to laundry.</Text> : null}

            <View style={styles.inputRow}>
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder="Tell me your plans"
                placeholderTextColor={Colors.muted}
                returnKeyType="send"
                onSubmitEditing={() => suggest(prompt)}
                testID="plans-input"
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Speak your plans"
                onPress={() => setMessage('Voice input is not connected in this build. Type your plans instead.')}
                style={styles.roundButton}>
                <Ionicons name="mic-outline" size={20} color={Colors.muted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Style me"
                testID="plans-send"
                disabled={busy}
                onPress={() => suggest(prompt)}
                style={[styles.roundButton, styles.sendButton]}>
                <Ionicons name="arrow-up" size={20} color={Colors.onAccent} />
              </Pressable>
            </View>

            <Button
              label={saved ? 'Saved for today' : 'Wearing this'}
              icon={saved ? 'checkmark' : 'shirt-outline'}
              testID="wearing-this"
              disabled={busy || !!saved || items.length === 0}
              onPress={confirmWear}
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.mirror },
  mirrorArea: { flex: 1 },
  topBar: { position: 'absolute', left: Spacing.four, right: Spacing.four, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontFamily: Fonts.serif, fontSize: 24, color: Colors.ink },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  sendButton: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  viewerControls: { position: 'absolute', left: Spacing.four, gap: Spacing.two },
  viewerStatus: {
    position: 'absolute',
    alignSelf: 'center',
    top: '40%',
    maxWidth: '70%',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  viewerStatusText: { fontSize: 13, color: Colors.inkSoft, textAlign: 'center' },
  approximate: { position: 'absolute', right: Spacing.three, top: 170, alignItems: 'center', gap: Spacing.one, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.two },
  approximateLabel: { fontSize: 10, fontWeight: '600', color: Colors.muted },
  banners: { position: 'absolute', left: Spacing.three, right: Spacing.three, bottom: Spacing.three, gap: Spacing.two },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  bannerSuccess: { backgroundColor: Colors.successSoft, borderColor: Colors.successSoft },
  bannerChange: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, color: Colors.ink },
  savedCard: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.success,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  savedHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  savedTitle: { fontFamily: Fonts.serif, fontSize: 22, color: Colors.ink },
  savedText: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft },
  savedActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two, marginTop: Spacing.one },
  panel: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1, fontFamily: Fonts.serif, fontSize: 20, color: Colors.ink },
  lookSwitch: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },
  lookSwitchText: { fontSize: 13, fontWeight: '600', color: Colors.accent },
  reason: { fontSize: 14, lineHeight: 20, minHeight: 40, color: Colors.inkSoft },
  actions: { flexDirection: 'row', gap: Spacing.two },
  action: { flex: 1, paddingHorizontal: Spacing.two },
  chips: { gap: Spacing.two, paddingRight: Spacing.four },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: 6,
    paddingRight: Spacing.three,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  chipSelected: { borderColor: Colors.ink },
  chipNew: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  chipName: { fontSize: 13, fontWeight: '600', color: Colors.ink, maxWidth: 130 },
  chipMeta: { fontSize: 11, color: Colors.muted },
  hint: { fontSize: 12, color: Colors.muted },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: {
    flex: 1,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: Spacing.four,
    fontSize: 15,
    color: Colors.ink,
  },
});
