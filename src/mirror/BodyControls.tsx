import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { AvatarBody, AvatarPreset, AvatarProportions, AvatarSex } from '@shared/contract';
import { AVATAR_PRESETS, HEIGHT_RANGE_CM, PROPORTION_KEYS } from '@shared/renderAssets';

/**
 * Body editor controls, as plain components with value + onChange props so onboarding
 * can lift them as-is. They change the Mirror live through avatar.body; nothing reloads.
 */

export const SKIN_TONES = ['#F3D3BE', '#E0AC8E', '#C68B6E', '#A0694F', '#7A4A35', '#4E2E22'] as const;

const PROPORTION_LABELS: Record<keyof AvatarProportions, string> = {
  head: 'Head',
  chest: 'Chest',
  arms: 'Arms',
  waist: 'Waist',
  hips: 'Hips',
  shoulders: 'Shoulders',
};

export function SexPicker({ value, onChange }: { value: AvatarSex; onChange: (sex: AvatarSex) => void }) {
  return (
    <View style={styles.row}>
      {(['female', 'male'] as const).map((sex) => (
        <Chip key={sex} label={sex === 'female' ? 'Female' : 'Male'} active={value === sex} onPress={() => onChange(sex)} />
      ))}
    </View>
  );
}

export function PresetPicker({ sex, value, onChange }: { sex: AvatarSex; value: AvatarPreset; onChange: (preset: AvatarPreset) => void }) {
  const shown = sex === 'female' ? 'female' : 'male';
  return (
    <View style={styles.row}>
      {AVATAR_PRESETS.filter((p) => p.sex === shown).map((p) => (
        <Chip key={p.key} label={p.label} active={value === p.preset} onPress={() => onChange(p.preset)} />
      ))}
    </View>
  );
}

export function SkinTonePicker({ value, onChange }: { value: string | null; onChange: (hex: string | null) => void }) {
  return (
    <View style={styles.row}>
      <Chip label="Default" active={value === null} onPress={() => onChange(null)} />
      {SKIN_TONES.map((hex) => (
        <Pressable
          key={hex}
          accessibilityRole="button"
          accessibilityLabel={'Skin tone ' + hex}
          onPress={() => onChange(hex)}
          style={[styles.swatch, { backgroundColor: hex }, value?.toLowerCase() === hex.toLowerCase() && styles.swatchActive]}
        />
      ))}
    </View>
  );
}

/** Horizontal slider without native dependencies (Expo Go safe). */
export function BodySlider({
  label,
  value,
  min,
  max,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const ratio = (value - min) / (max - min);
  const update = (e: GestureResponderEvent) => {
    const r = Math.min(1, Math.max(0, e.nativeEvent.locationX / width));
    onChange(Math.round((min + r * (max - min)) * 100) / 100);
  };
  return (
    <View style={styles.slider}>
      <View style={styles.sliderHead}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{format ? format(value) : value.toFixed(2)}</Text>
      </View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        style={styles.track}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width || 1)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={update}
        onResponderMove={update}>
        <View pointerEvents="none" style={styles.rail} />
        <View pointerEvents="none" style={[styles.fill, { width: `${ratio * 100}%` }]} />
        <View pointerEvents="none" style={[styles.thumb, { left: `${ratio * 100}%` }]} />
      </View>
    </View>
  );
}

/** Everything at once: sex, preset, skin tone, height and the six proportions. */
export function BodyControls({ value, onChange }: { value: AvatarBody; onChange: (body: AvatarBody) => void }) {
  const set = (patch: Partial<AvatarBody>) => onChange({ ...value, ...patch });
  const preset = AVATAR_PRESETS.find((p) => p.sex === (value.sex === 'female' ? 'female' : 'male') && p.preset === value.preset);
  return (
    <View style={styles.stack}>
      <SexPicker value={value.sex} onChange={(sex) => set({ sex, heightCm: undefined })} />
      <PresetPicker sex={value.sex} value={value.preset} onChange={(p) => set({ preset: p })} />
      <SkinTonePicker value={value.skinTone} onChange={(skinTone) => set({ skinTone })} />
      <BodySlider
        label="Height"
        value={value.heightCm ?? preset?.naturalHeightCm ?? 175}
        min={HEIGHT_RANGE_CM.min}
        max={HEIGHT_RANGE_CM.max}
        format={(v) => Math.round(v) + ' cm'}
        onChange={(v) => set({ heightCm: Math.round(v) })}
      />
      {PROPORTION_KEYS.map((k) => (
        <BodySlider
          key={k}
          label={PROPORTION_LABELS[k]}
          value={value.proportions[k]}
          min={-1}
          max={1}
          onChange={(v) => set({ proportions: { ...value.proportions, [k]: v } })}
        />
      ))}
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
  stack: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  chip: { borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.surface, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipText: { color: Colors.ink, fontSize: 13 },
  chipTextActive: { color: Colors.surface },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: Colors.ink },
  slider: { gap: Spacing.half },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabel: { fontSize: 12, color: Colors.inkSoft },
  sliderValue: { fontSize: 12, color: Colors.muted, fontVariant: ['tabular-nums'] },
  track: { height: 24, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: Colors.line },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: Colors.accent },
  thumb: { position: 'absolute', width: 18, height: 18, marginLeft: -9, borderRadius: 9, backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.accent },
});
