import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Mirror } from '@/components/Mirror';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { AVATARS } from '@/mirror/assets';
import { BodyControls } from '@/mirror/BodyControls';
import {
  SAMPLE_AVATAR,
  SAMPLE_AVATAR_BODY,
  SAMPLE_AVATAR_ESTIMATE_RESULT,
  type AvatarBody,
  type AvatarRef,
  type MirrorGarment,
  type MirrorState,
  type MirrorViewerControls,
} from '@shared/contract';

/**
 * Hidden dev screen (not in the tabs): open wearagain://mirror-lab.
 * Flips the shoes slot to show that only that mesh swaps, exercises the tint
 * fallback and the viewer controls, and edits the body live with BodyControls.
 */
const SHOES = { sneakers: 'demo/sneakers-white', boots: 'demo/boots-brown', canvas: 'avaturn/sneakers-blue' } as const;
const SHOE_LABELS = { sneakers: 'White sneakers', boots: 'Brown leather boots', canvas: 'Blue canvas sneakers' } as const;
const MY_AVATAR: AvatarRef = { kind: 'preset', key: 'kenil' };

export default function MirrorLab() {
  const [shoes, setShoes] = useState<keyof typeof SHOES>('sneakers');
  const [tint, setTint] = useState(false);
  const [mine, setMine] = useState(false);
  const [body, setBody] = useState<AvatarBody>(SAMPLE_AVATAR_BODY);
  const [state, setState] = useState<MirrorState>({ status: 'loading' });
  const [controls, setControls] = useState<MirrorViewerControls | null>(null);

  const outfit = ['demo/jacket-denim', 'demo/shirt-white', 'demo/trousers-charcoal', SHOES[shoes]];
  // My avatar only wears the garments refitted to it so far.
  const keys = mine ? outfit.filter((k) => k in AVATARS.kenil.garments) : outfit;
  const garments: MirrorGarment[] | undefined = tint
    ? [
        { slot: 'top', renderAssetKey: 'demo/shirt-white', label: 'White oxford shirt' },
        { slot: 'bottom', colorHex: '#B49A72', label: 'Khaki chinos' },
        { slot: 'shoes', renderAssetKey: SHOES[shoes], label: SHOE_LABELS[shoes] },
      ]
    : undefined;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Mirror lab (dev)' }} />
      <View style={styles.mirror}>
        <Mirror
          avatar={mine ? MY_AVATAR : { ...SAMPLE_AVATAR, body }}
          garmentAssetKeys={keys}
          garments={garments}
          onStateChange={setState}
          onControlsReady={setControls}
        />
      </View>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <Text style={styles.state} testID="mirror-state">
          Mirror: {state.status}
          {state.status === 'error' ? ' - ' + state.message : ''}
        </Text>
        <View style={styles.row}>
          <Chip label="Demo body" active={!mine} onPress={() => setMine(false)} />
          <Chip label="My avatar" active={mine} onPress={() => setMine(true)} />
        </View>
        <View style={styles.row}>
          <Chip label="Canvas" active={shoes === 'canvas'} onPress={() => setShoes('canvas')} />
          <Chip label="Sneakers" active={shoes === 'sneakers'} onPress={() => setShoes('sneakers')} />
          <Chip label="Boots" active={shoes === 'boots'} onPress={() => setShoes('boots')} />
          <Chip label="Chinos (tint)" active={tint} onPress={() => setTint((t) => !t)} />
        </View>
        <View style={styles.row}>
          <Chip label="Front" onPress={() => controls?.rotateTo(0)} />
          <Chip label="Side" onPress={() => controls?.rotateTo(90)} />
          <Chip label="Back" onPress={() => controls?.rotateTo(180)} />
          <Chip label="Zoom" onPress={() => controls?.setZoom(3)} />
          <Chip label="Reset" onPress={() => controls?.resetView()} />
        </View>
        <View style={styles.row}>
          <Chip label="Sample estimate" onPress={() => setBody(SAMPLE_AVATAR_ESTIMATE_RESULT.body)} />
          <Chip label="Reset body" onPress={() => setBody(SAMPLE_AVATAR_BODY)} />
        </View>
        {!mine && <BodyControls value={body} onChange={setBody} />}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background, padding: Spacing.four, gap: Spacing.three },
  mirror: { flex: 1.3 },
  panel: { flex: 1 },
  panelContent: { gap: Spacing.three, paddingBottom: Spacing.six },
  state: { color: Colors.muted, fontSize: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.surface, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipText: { color: Colors.ink, fontSize: 13 },
  chipTextActive: { color: Colors.surface },
});
