import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, MockBadge } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { api } from '@/data/api';
import { setSession, useSession } from '@/state/session';
import type { Id, ScanJob } from '@shared/contract';

const TIPS = [
  'Show one item at a time.',
  'Hold each piece still for a second.',
  'Good light, plain background if you can.',
];

const STATUS_TEXT: Record<ScanJob['status'], string> = {
  queued: 'Uploading your clip…',
  processing: 'Looking for distinct pieces…',
  review: 'Ready for your review',
  confirmed: 'Already added to your closet',
  failed: 'The scan did not finish',
};

export default function ScanScreen() {
  const { activeScanId, scanDrafts } = useSession();
  const [scanId, setScanId] = useState<Id | null>(null);
  const [job, setJob] = useState<ScanJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  async function begin(source: 'camera' | 'library' | 'sample') {
    setError(null);
    try {
      let clipUri: string | null = null;
      if (source !== 'sample') {
        if (source === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setError('Camera access is off. Allow it in Settings, or choose a video instead.');
            return;
          }
        }
        const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['videos'], videoMaxDuration: 30 };
        const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
        if (picked.canceled) return;
        clipUri = picked.assets[0].uri;
      }
      setPreparing(true);
      const args = await api.media.prepareScan(clipUri);
      const started = await api.scans.start(args);
      setJob(null);
      setScanId(started.scanId);
      setSession({ activeScanId: started.scanId });
    } catch {
      setError('Could not open that video. Try again or choose another clip.');
    } finally {
      setPreparing(false);
    }
  }

  useEffect(() => {
    if (!scanId) return;
    let live = true;
    const poll = async () => {
      const next = await api.scans.get({ scanId });
      if (!live) return;
      setJob(next);
      if (next.status === 'review') {
        clearInterval(timer);
        router.replace({ pathname: '/scan/review', params: { scanId } });
      }
      if (next.status === 'failed' || next.status === 'confirmed') clearInterval(timer);
    };
    const timer = setInterval(poll, 700);
    poll();
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [scanId]);

  if (scanId || preparing) {
    const done = job?.progress?.framesDone ?? 0;
    const total = job?.progress?.framesTotal ?? 10;
    const failed = job?.status === 'failed';
    return (
      <View style={styles.progressRoot}>
        <Ionicons name={failed ? 'alert-circle-outline' : 'film-outline'} size={44} color={failed ? Colors.danger : Colors.accent} />
        <Text style={styles.title}>{failed ? STATUS_TEXT.failed : 'Scanning your clip'}</Text>
        <Text style={styles.body}>{failed ? job?.error : job ? STATUS_TEXT[job.status] : 'Picking clear frames…'}</Text>
        {failed ? (
          <Button label="Try another clip" onPress={() => { setScanId(null); setJob(null); setSession({ activeScanId: null }); }} />
        ) : (
          <>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(6, (done / total) * 100)}%` }]} />
            </View>
            <Text style={styles.caption}>{done} of {total} frames checked. You will review everything before it is added.</Text>
          </>
        )}
        {api.usingMockData ? <MockBadge label="Sample detection, not your video" /> : null}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.title}>Record your clothes</Text>
      <Text style={styles.body}>A short video is enough. We find the pieces, you confirm them.</Text>

      <View style={styles.tips}>
        {TIPS.map((tip, index) => (
          <View key={tip} style={styles.tip}>
            <View style={styles.tipNumber}><Text style={styles.tipNumberText}>{index + 1}</Text></View>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>

      {activeScanId && scanDrafts[activeScanId] ? (
        <View style={styles.resume}>
          <Text style={styles.tipText}>You have a review in progress. Your edits are kept.</Text>
          <Button label="Continue review" compact variant="secondary" onPress={() => router.replace({ pathname: '/scan/review', params: { scanId: activeScanId } })} />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button label="Record a video" icon="videocam-outline" testID="scan-record" onPress={() => begin('camera')} />
      <Button label="Choose a video" icon="images-outline" variant="secondary" testID="scan-choose" onPress={() => begin('library')} />
      {api.usingMockData ? (
        <View style={styles.sample}>
          <Button label="Use the sample clip" variant="ghost" compact testID="scan-sample" onPress={() => begin('sample')} />
          <MockBadge label="Sample data build" />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: Spacing.five, gap: Spacing.four },
  progressRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.six, gap: Spacing.four, backgroundColor: Colors.background },
  title: { fontFamily: Fonts.serif, fontSize: 28, color: Colors.ink },
  body: { fontSize: 16, lineHeight: 22, color: Colors.inkSoft, textAlign: 'left' },
  tips: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three, borderWidth: 1, borderColor: Colors.line },
  tip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tipNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  tipNumberText: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  tipText: { flex: 1, fontSize: 15, color: Colors.ink },
  resume: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, backgroundColor: Colors.wornSoft, borderRadius: Radius.md, padding: Spacing.three },
  error: { fontSize: 14, color: Colors.danger },
  sample: { alignItems: 'center', gap: Spacing.one },
  track: { alignSelf: 'stretch', height: 10, borderRadius: 5, backgroundColor: Colors.surfaceSunken, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  caption: { fontSize: 13, color: Colors.muted, textAlign: 'center' },
});
