import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, MockBadge, Stepper } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { api, type AvatarProfile, type ProportionPreset } from '@/data/api';

const PRESETS: { key: ProportionPreset; label: string; shoulders: number; waist: number; hips: number }[] = [
  { key: 'straight', label: 'Straight', shoulders: 44, waist: 38, hips: 44 },
  { key: 'athletic', label: 'Broad top', shoulders: 56, waist: 36, hips: 42 },
  { key: 'curvy', label: 'Full hips', shoulders: 44, waist: 32, hips: 56 },
];

const ADJUSTMENTS: { key: keyof AvatarProfile['adjust']; label: string }[] = [
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'legs', label: 'Leg length' },
];

const ADJUST_WORD = ['Much less', 'Less', 'Preset', 'More', 'Much more'];

type SilhouetteProps = { shoulders: number; waist: number; hips: number; legs: number; color: string };

function Silhouette({ shoulders, waist, hips, legs, color }: SilhouetteProps) {
  return (
    <View style={styles.silhouette}>
      <View style={[styles.head, { backgroundColor: color }]} />
      <View style={{ width: shoulders, height: 14, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: color }} />
      <View style={{ width: waist, height: 22, backgroundColor: color }} />
      <View style={{ width: hips, height: 14, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: color }} />
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <View style={{ width: hips / 2 - 4, height: legs, backgroundColor: color, borderRadius: 4 }} />
        <View style={{ width: hips / 2 - 4, height: legs, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [heightCm, setHeightCm] = useState(170);
  const [proportion, setProportion] = useState<ProportionPreset>('straight');
  const [adjust, setAdjust] = useState({ shoulders: 0, waist: 0, hips: 0, legs: 0 });
  const [error, setError] = useState<string | null>(null);

  const preset = PRESETS.find((entry) => entry.key === proportion)!;
  const inches = Math.round(heightCm / 2.54);

  async function pickPhoto() {
    setError(null);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
      if (!picked.canceled) setPhotoUri(picked.assets[0].uri);
    } catch {
      setError('Could not open your photos. You can continue without one.');
    }
  }

  async function finish(usePreset: boolean) {
    await api.profile.save(
      usePreset
        ? { onboarded: true, avatarStatus: 'ready' }
        : { onboarded: true, photoUri, heightCm, proportion, adjust, avatarStatus: 'preparing' },
    );
    router.replace('/');
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Set up your mirror</Text>
        <Text style={styles.body}>A few approximate details so clothes sit about right. You can change them later.</Text>
        <Button label="Skip, use a preset avatar" variant="secondary" icon="flash-outline" testID="onboarding-preset" onPress={() => finish(true)} />

        <View style={styles.section}>
          <Text style={styles.heading}>Full-body photo <Text style={styles.optional}>optional</Text></Text>
          <View style={styles.photoRow}>
            {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" /> : null}
            <View style={styles.grow}>
              <Button label={photoUri ? 'Choose another' : 'Add a photo'} compact variant="secondary" icon="image-outline" onPress={pickPhoto} />
              <Text style={styles.caption}>Private. Used only to prepare your avatar, never shared.</Text>
            </View>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Height</Text>
          <Stepper
            label={`${Math.floor(inches / 12)} ft ${inches % 12} in`}
            value={`${heightCm} cm`}
            onMinus={() => setHeightCm(Math.max(130, heightCm - 1))}
            onPlus={() => setHeightCm(Math.min(215, heightCm + 1))}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Proportions</Text>
          <View style={styles.presets}>
            {PRESETS.map((entry) => (
              <Pressable
                key={entry.key}
                accessibilityRole="button"
                accessibilityState={{ selected: proportion === entry.key }}
                onPress={() => setProportion(entry.key)}
                style={[styles.preset, proportion === entry.key && styles.presetSelected]}>
                <Silhouette shoulders={entry.shoulders} waist={entry.waist} hips={entry.hips} legs={46} color={proportion === entry.key ? Colors.accent : Colors.mirrorDeep} />
                <Text style={styles.presetLabel}>{entry.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Fine-tune</Text>
          <View style={styles.tuneRow}>
            <View style={styles.tunePreview}>
              <Silhouette
                shoulders={preset.shoulders + adjust.shoulders * 4}
                waist={preset.waist + adjust.waist * 4}
                hips={preset.hips + adjust.hips * 4}
                legs={(46 + adjust.legs * 5) * (heightCm / 170)}
                color={Colors.inkSoft}
              />
            </View>
            <View style={styles.grow}>
              {ADJUSTMENTS.map((entry) => (
                <Stepper
                  key={entry.key}
                  label={entry.label}
                  value={ADJUST_WORD[adjust[entry.key] + 2]}
                  onMinus={() => setAdjust({ ...adjust, [entry.key]: Math.max(-2, adjust[entry.key] - 1) })}
                  onPlus={() => setAdjust({ ...adjust, [entry.key]: Math.min(2, adjust[entry.key] + 1) })}
                />
              ))}
            </View>
          </View>
        </View>
        {api.usingMockData ? <MockBadge label="Sample build: every choice shows the demo avatar" /> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        <Button label="Create my avatar" testID="onboarding-create" onPress={() => finish(false)} />
        <Text style={styles.caption}>You can start right away while your avatar is prepared.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.five, gap: Spacing.four },
  title: { fontFamily: Fonts.serif, fontSize: 30, color: Colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: Colors.inkSoft },
  section: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.four, gap: Spacing.three },
  heading: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  optional: { fontSize: 13, fontWeight: '400', color: Colors.muted },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  photo: { width: 64, height: 96, borderRadius: Radius.sm },
  grow: { flex: 1, gap: Spacing.one },
  caption: { fontSize: 12, lineHeight: 17, color: Colors.muted, textAlign: 'center' },
  error: { fontSize: 13, color: Colors.danger },
  presets: { flexDirection: 'row', gap: Spacing.two },
  preset: { flex: 1, alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.background },
  presetSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  presetLabel: { fontSize: 12, fontWeight: '600', color: Colors.ink, textAlign: 'center' },
  silhouette: { alignItems: 'center', gap: 2 },
  head: { width: 18, height: 18, borderRadius: 9 },
  tuneRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tunePreview: { width: 76, alignItems: 'center' },
  footer: { paddingHorizontal: Spacing.five, paddingTop: Spacing.three, gap: Spacing.one, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: Colors.background },
});
