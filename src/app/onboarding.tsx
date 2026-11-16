import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, MockBadge, Stepper } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { api, type AvatarProfile, type ProportionPreset } from '@/data/api';
import { BODY_TYPES, type BodyGender } from '@/mirror/assets';

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
  const [proportion] = useState<ProportionPreset>('straight');
  const [gender, setGender] = useState<BodyGender>('male');
  const [bodyKey, setBodyKey] = useState<string | null>(null);
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
        : {
            onboarded: true,
            photoUri,
            heightCm,
            proportion,
            adjust,
            avatarStatus: 'ready',
            avatar: { kind: 'preset', key: bodyKey ?? 'body/male-4', demo: false },
          },
    );
    router.replace('/');
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Set up your mirror</Text>
        <Text style={styles.body}>A few details so clothes fit right. You can change them later.</Text>
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

        <View style={styles.section} testID="onboarding-body-type">
          <Text style={styles.heading}>Body type</Text>
          <View style={styles.genderRow}>
            {(['male', 'female'] as const).map((g) => (
              <Pressable
                key={g}
                accessibilityRole="button"
                accessibilityState={{ selected: gender === g }}
                onPress={() => {
                  setGender(g);
                  setBodyKey(null);
                }}
                style={[styles.genderChip, gender === g && styles.genderChipOn]}>
                <Text style={[styles.genderText, gender === g && styles.genderTextOn]}>{g === 'male' ? 'Men' : 'Women'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.bodies}>
            {BODY_TYPES.filter((b) => b.gender === gender).map((b) => (
              <Pressable
                key={b.key}
                accessibilityRole="button"
                accessibilityLabel={b.label + ' body type'}
                accessibilityState={{ selected: bodyKey === b.key }}
                onPress={() => setBodyKey(b.key)}
                style={[styles.body5, bodyKey === b.key && styles.presetSelected]}>
                <Silhouette shoulders={b.shoulders * 0.62} waist={b.waist * 0.62} hips={b.hips * 0.62} legs={34} color={bodyKey === b.key ? Colors.accent : Colors.mirrorDeep} />
                <Text style={styles.presetLabel}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
          {!bodyKey ? <Text style={styles.caption}>Pick the body type closest to yours to set up your mannequin.</Text> : null}
        </View>

        {api.usingMockData ? <MockBadge label="Sample build: every choice shows the demo avatar" /> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        <Button label={bodyKey ? 'Create my mannequin' : 'Pick a body type'} disabled={!bodyKey} testID="onboarding-create" onPress={() => finish(false)} />
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
  genderRow: { flexDirection: 'row', gap: Spacing.two },
  genderChip: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line },
  genderChipOn: { borderColor: Colors.ink, backgroundColor: Colors.ink },
  genderText: { fontSize: 14, fontWeight: '600', color: Colors.ink },
  genderTextOn: { color: Colors.background },
  bodies: { flexDirection: 'row', gap: 6 },
  body5: { flex: 1, alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.two, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.background },
  preset: { flex: 1, alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.background },
  presetSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  presetLabel: { fontSize: 12, fontWeight: '600', color: Colors.ink, textAlign: 'center' },
  silhouette: { alignItems: 'center', gap: 2 },
  head: { width: 18, height: 18, borderRadius: 9 },
  tuneRow: { gap: Spacing.three },
  tunePreview: { alignItems: 'center' },
  tuneSteppers: { gap: Spacing.one },
  footer: { paddingHorizontal: Spacing.five, paddingTop: Spacing.three, gap: Spacing.one, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: Colors.background },
});
