import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { CodeScope } from '@/data/catalog';
import { redeem, useAppliedCodes, type useWhopCheckout } from '@/lib/whop';

/** Whop checkout UI shared by Deals and For you: the Buy button, the price with a redeemed code, and Redeem code. */

const dollars = (cents: number) => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);
export const afterDiscount = (cents: number, pct: number) => Math.round(cents * (1 - pct / 100));

export function Price({ cents, pct = 0, style }: { cents: number; pct?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.priceRow, style]}>
      <Text style={[styles.price, pct > 0 && styles.priceDeal]}>{dollars(afterDiscount(cents, pct))}</Text>
      {pct > 0 ? <Text style={styles.was}>{dollars(cents)}</Text> : null}
    </View>
  );
}

type BuyProps = {
  checkout: ReturnType<typeof useWhopCheckout>;
  productId: string;
  name: string;
  dealId?: string;
  code?: string | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Buy with Whop for one product; passes the redeemed code so Whop's checkout shows the discount. */
export function BuyButton({ checkout, productId, name, dealId, code, style, testID = 'whop-buy' }: BuyProps) {
  const pending = checkout.isPending(productId, dealId);
  const error = checkout.errorFor(productId, dealId);
  return (
    <View style={[styles.buyWrap, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Buy ' + name + ' with Whop'}
        accessibilityState={{ busy: pending, disabled: checkout.busy }}
        disabled={checkout.busy}
        onPress={() => checkout.buy(productId, { dealId, code: code ?? undefined })}
        style={({ pressed }) => [styles.buy, (pressed || pending) && styles.buyPressed, checkout.busy && !pending && styles.buyIdle]}
        testID={testID}>
        {pending ? <ActivityIndicator size="small" color={Colors.onAccent} /> : <Ionicons name="bag-handle" size={14} color={Colors.onAccent} />}
        <Text style={styles.buyText}>{pending ? 'Opening Whop…' : 'Buy with Whop'}</Text>
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

type RedeemProps = {
  /** The deal (Deals) or product (For you) the code must fit. */
  scope: CodeScope;
  brandSlug: string;
  /** Label of the closed button. */
  label?: string;
  compact?: boolean;
  testID?: string;
};

/** Redeem code: type a code, the backend checks it, and an accepted code shows its discount and goes with Buy. */
export function RedeemCode({ scope, brandSlug, label = 'Redeem code', compact, testID = 'redeem-code' }: RedeemProps) {
  const codes = useAppliedCodes();
  const applied = codes.forBrand(brandSlug);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (applied) {
    return (
      <View style={styles.applied} testID={testID + '-applied'}>
        <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
        <Text style={styles.appliedText} numberOfLines={2}>
          <Text style={styles.appliedCode}>{applied.code}</Text> · {applied.discountPct}% off {applied.brandName}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={'Remove code ' + applied.code} hitSlop={8} onPress={() => codes.remove(brandSlug)}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>
    );
  }

  if (!open) {
    return compact ? (
      <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={() => setOpen(true)} style={styles.linkRow} testID={testID}>
        <Ionicons name="pricetag-outline" size={14} color={Colors.accent} />
        <Text style={styles.link}>{label}</Text>
      </Pressable>
    ) : (
      <Button label={label} compact variant="secondary" icon="gift-outline" onPress={() => setOpen(true)} testID={testID} style={styles.openButton} />
    );
  }

  const submit = async () => {
    if (checking) return;
    setChecking(true);
    setError(null);
    const result = await redeem(text, scope);
    setChecking(false);
    if (result.ok) {
      setOpen(false);
      setText('');
    } else setError(result.message);
  };

  return (
    <View style={styles.form} testID={testID + '-form'}>
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={(value) => {
            setText(value.toUpperCase());
            setError(null);
          }}
          onSubmitEditing={submit}
          placeholder="Enter code"
          placeholderTextColor={Colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          returnKeyType="done"
          accessibilityLabel="Code"
          style={[styles.input, error && styles.inputError]}
          testID={testID + '-input'}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apply code"
          accessibilityState={{ busy: checking, disabled: checking || !text.trim() }}
          disabled={checking || !text.trim()}
          onPress={submit}
          style={({ pressed }) => [styles.apply, (pressed || checking) && styles.buyPressed, !text.trim() && styles.buyIdle]}
          testID={testID + '-apply'}>
          {checking ? <ActivityIndicator size="small" color={Colors.onAccent} /> : <Text style={styles.applyText}>Apply</Text>}
        </Pressable>
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" testID={testID + '-error'}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  priceDeal: { color: Colors.accent },
  was: { fontSize: 12, color: Colors.muted, textDecorationLine: 'line-through' },
  buyWrap: { gap: 4 },
  buy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, paddingHorizontal: Spacing.three, borderRadius: Radius.pill, backgroundColor: Colors.ink },
  buyPressed: { opacity: 0.8 },
  buyIdle: { opacity: 0.45 },
  buyText: { fontSize: 13, fontWeight: '700', color: Colors.onAccent },
  error: { fontSize: 12, lineHeight: 16, color: Colors.danger },
  openButton: { alignSelf: 'flex-start' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 },
  link: { fontSize: 13, fontWeight: '600', color: Colors.accent },
  form: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: {
    flex: 1,
    minWidth: 0,
    height: 38,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.background,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: Colors.ink,
  },
  inputError: { borderColor: Colors.danger },
  apply: { height: 38, minWidth: 68, paddingHorizontal: Spacing.three, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent },
  applyText: { fontSize: 13, fontWeight: '700', color: Colors.onAccent },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.two, paddingVertical: 6, borderRadius: Radius.sm, backgroundColor: Colors.successSoft },
  appliedText: { flex: 1, fontSize: 13, color: Colors.success },
  appliedCode: { fontWeight: '700', letterSpacing: 0.5 },
  remove: { fontSize: 12, fontWeight: '600', color: Colors.inkSoft, textDecorationLine: 'underline' },
});
