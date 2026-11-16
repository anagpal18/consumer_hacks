import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  DATA_MODE,
  FIXTURE_LABEL,
  IS_FIXTURE_MODE,
  extractFrames,
  pickClip,
  scanClip,
  useConfirmWear,
  useScan,
  useTodaysLook,
  type PickedClip,
} from '@/data';

const SAMPLE_CLIP_URL = 'https://raw.githubusercontent.com/anagpal18/consumer_hacks/shresth-video/fixtures/closet-demo.mp4';

/**
 * Integration check for today's look, wear confirmation and the clip-to-frames path, opened with wearagain://scan-check
 * or wearagain://scan-check?clip=<video url> to run against a specific clip.
 * Not part of the product flow; Aditya's capture screen replaces it.
 */
export default function ScanCheckScreen() {
  const [log, setLog] = useState<string[]>([]);
  const [frames, setFrames] = useState<{ uri: string; timestampMs: number }[]>([]);
  const [scanId, setScanId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const scan = useScan(scanId);
  const look = useTodaysLook('dinner with friends');
  const { confirmWear, isSaving, lastResult, error: wearError } = useConfirmWear();
  const { clip: clipParam } = useLocalSearchParams<{ clip?: string }>();
  const clipUrl = clipParam || SAMPLE_CLIP_URL;

  const append = (line: string) => setLog((lines) => [...lines, line]);

  async function run(getClip: () => Promise<PickedClip | null>) {
    setBusy(true);
    setFrames([]);
    setScanId(undefined);
    try {
      const clip = await getClip();
      if (!clip) return append('Cancelled');
      append(`Clip ${clip.durationMs ?? '?'} ms`);
      const started = Date.now();
      const extracted = await extractFrames(clip).catch((error: Error) => {
        append(`Extraction failed: ${error.message}`);
        return [];
      });
      setFrames(extracted);
      append(`Extracted ${extracted.length} frames in ${Date.now() - started} ms`);
      const result = await scanClip(clip, (progress) => {
        if (progress.step === 'uploading-video') append(`Fallback: uploading whole clip (${progress.reason})`);
        if (progress.step === 'uploading' && progress.done === progress.total) append(`Uploaded ${progress.total} frames`);
      });
      setScanId(result.scanId);
      append(`scans:start -> ${result.scanId}`);
    } catch (error) {
      append(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Integration check' }} />
      <Text style={styles.mode}>
        Mode: {DATA_MODE}
        {IS_FIXTURE_MODE ? ` (${FIXTURE_LABEL})` : ''}
      </Text>
      <Text style={styles.heading}>Today&apos;s look{look.isLoading ? ' (updating)' : ''}</Text>
      {look.items.map((item) => (
        <Text key={item.itemId} style={styles.log}>
          {item.category}: {item.name} ({item.availability})
        </Text>
      ))}
      {look.lockedUnavailableItemIds.length > 0 && <Text style={styles.log}>Locked item unavailable</Text>}
      {look.error && <Text style={styles.log}>Stylist error: {look.error.message}</Text>}
      <Pressable
        disabled={isSaving || !look.outfit}
        style={styles.button}
        onPress={() => look.outfit && confirmWear({ itemIds: look.outfit.itemIds, outfitId: look.outfit.outfitId }).catch(() => {})}>
        <Text style={styles.buttonText}>{isSaving ? 'Saving' : 'Wearing this'}</Text>
      </Pressable>
      {lastResult && (
        <Text style={styles.log}>
          Saved wear {lastResult.duplicate ? '(duplicate)' : ''}, streak {lastResult.streakDays ?? '?'} days, challenge{' '}
          {lastResult.challenge.map((progress) => `${progress.distinctOutfits}/${progress.target}`).join(' ')}
        </Text>
      )}
      {wearError && <Text style={styles.log}>Wear error: {wearError.message}</Text>}
      <Text style={styles.heading}>Clip to frames</Text>
      <Pressable disabled={busy} style={styles.button} onPress={() => run(() => pickClip('library'))}>
        <Text style={styles.buttonText}>Pick a clip from Photos</Text>
      </Pressable>
      <Pressable disabled={busy} style={styles.button} onPress={() => run(async () => ({ uri: clipUrl, durationMs: null }))}>
        <Text style={styles.buttonText}>{clipParam ? 'Use linked clip' : 'Use example clip (URL)'}</Text>
      </Pressable>
      {log.map((line, index) => (
        <Text key={index} style={styles.log}>
          {line}
        </Text>
      ))}
      {scan && (
        <Text style={styles.log}>
          Scan {scan.status}, {scan.candidates.length} candidates
        </Text>
      )}
      <View style={styles.grid}>
        {frames.map((frame) => (
          <View key={frame.timestampMs} style={styles.cell}>
            <Image source={{ uri: frame.uri }} style={styles.frame} contentFit="cover" />
            <Text style={styles.log}>{(frame.timestampMs / 1000).toFixed(1)} s</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.four, gap: Spacing.two },
  mode: { color: Colors.mock, fontSize: 13 },
  heading: { color: Colors.ink, fontSize: 15, fontWeight: '600', marginTop: Spacing.two },
  button: { backgroundColor: Colors.accent, borderRadius: Radius.md, padding: Spacing.three, alignItems: 'center' },
  buttonText: { color: Colors.onAccent, fontWeight: '600' },
  log: { color: Colors.inkSoft, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: { width: '30%', gap: Spacing.half },
  frame: { width: '100%', aspectRatio: 1, borderRadius: Radius.sm, backgroundColor: Colors.surfaceSunken },
});
