import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Availability, GarmentCategory, MediaRef } from '@shared/contract';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const CATEGORY_LABEL: Record<GarmentCategory, string> = {
  top: 'Top',
  bottom: 'Bottom',
  outerwear: 'Jacket',
  dress: 'Dress',
  shoes: 'Shoes',
  accessory: 'Accessory',
  socks: 'Socks',
  underwear: 'Underwear',
};

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Available',
  laundry: 'In laundry',
  retired: 'Retired',
  on_the_way: 'On the way',
};

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  compact?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', icon, disabled, compact, testID, style }: ButtonProps) {
  const color = variant === 'primary' ? Colors.onAccent : variant === 'secondary' ? Colors.ink : Colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={compact ? 16 : 20} color={color} /> : null}
      <Text style={[styles.buttonLabel, compact && styles.buttonLabelCompact, { color }]}>{label}</Text>
    </Pressable>
  );
}

type Tone = 'neutral' | 'worn' | 'laundry' | 'success' | 'mock' | 'accent';

const toneColors: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: Colors.surfaceSunken, fg: Colors.inkSoft },
  worn: { bg: Colors.wornSoft, fg: Colors.worn },
  laundry: { bg: Colors.laundrySoft, fg: Colors.laundry },
  success: { bg: Colors.successSoft, fg: Colors.success },
  mock: { bg: Colors.mockSoft, fg: Colors.mock },
  accent: { bg: Colors.accentSoft, fg: Colors.accent },
};

export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const { bg, fg } = toneColors[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[styles.pillLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** Shown wherever a screen is rendering sample data instead of the real backend. */
export function MockBadge({ label = 'Sample data' }: { label?: string }) {
  return <Pill label={label} tone="mock" icon="flask-outline" />;
}

function isDark(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  const luminance = 0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
  return luminance < 140;
}

type GarmentThumbProps = {
  media: MediaRef;
  colorHex?: string;
  category: GarmentCategory;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** The garment's real crop when it has one, otherwise a labeled color swatch. */
export function GarmentThumb({ media, colorHex, category, size = 56, style }: GarmentThumbProps) {
  const box = [{ width: size, height: size, borderRadius: Radius.sm }, style];
  if (media.url) return <Image source={{ uri: media.url }} style={box as never} contentFit="cover" />;
  const hex = colorHex ?? Colors.surfaceSunken;
  return (
    <View style={[styles.swatch, { backgroundColor: hex }, box]}>
      <Text style={[styles.swatchLabel, { color: isDark(hex) ? '#FFFFFF' : Colors.ink, fontSize: size < 50 ? 8 : 10 }]}>
        {CATEGORY_LABEL[category].toUpperCase()}
      </Text>
    </View>
  );
}

type StepperProps = { label: string; value: string; onMinus: () => void; onPlus: () => void };

export function Stepper({ label, value, onMinus, onPlus }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={onMinus} style={styles.stepperButton}>
        <Ionicons name="remove" size={20} color={Colors.ink} />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={onPlus} style={styles.stepperButton}>
        <Ionicons name="add" size={20} color={Colors.ink} />
      </Pressable>
    </View>
  );
}

type ChoiceProps = { label: string; selected: boolean; onPress: () => void };

export function Choice({ label, selected, onPress }: ChoiceProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 44 },
  stepperLabel: { flex: 1, fontSize: 15, color: Colors.ink },
  stepperValue: { minWidth: 86, textAlign: 'center', fontSize: 15, fontWeight: '600', color: Colors.ink },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  choice: {
    paddingHorizontal: Spacing.three,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  choiceSelected: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  choiceLabel: { fontSize: 13, fontWeight: '600', color: Colors.inkSoft },
  choiceLabelSelected: { color: Colors.surface },
  button: {
    minHeight: 52,
    paddingHorizontal: Spacing.five,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  buttonCompact: { minHeight: 40, paddingHorizontal: Spacing.four },
  buttonPrimary: { backgroundColor: Colors.accent },
  buttonSecondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  buttonLabelCompact: { fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  pillLabel: { fontSize: 11, fontWeight: '600' },
  swatch: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.line },
  swatchLabel: { fontWeight: '700', letterSpacing: 0.5 },
});
