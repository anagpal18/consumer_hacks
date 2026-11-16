import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useBrandProducts, useDeals, type BrandProduct, type Deal } from '@/data/catalog';
import { IS_FIXTURE_MODE } from '@/data/mode';
import { useWhopCheckout } from '@/lib/whop';

/** Built-in deals for fixture mode (no backend). */
const SAMPLE_DEALS: Deal[] = [
  { dealId: 'sd1', brandSlug: 'sample', brandName: 'Northline Studio', title: '15% off your next order', description: 'Use it on anything from Northline Studio. Redeem with Wear Again points.', code: 'WEAR-NORTHLINE-15', discountPct: 15, pointsCost: 300, expiresAt: Date.now() + 14 * 86_400_000 },
  { dealId: 'sd2', brandSlug: 'sample', brandName: 'Northline Studio', title: 'Free repair or alteration', description: 'Keep a piece going instead of replacing it.', code: 'WEAR-NORTHLINE-FIX', discountPct: 0, pointsCost: 500, expiresAt: Date.now() + 30 * 86_400_000 },
];

/** Built-in products for fixture mode (no backend). */
const SAMPLE_PRODUCTS: BrandProduct[] = [
  { productId: 'sample_p1', name: 'Navy unstructured blazer', category: 'outerwear', colorHex: '#2B2F3A', priceCents: 18900, imageUrl: null },
  { productId: 'sample_p2', name: 'Light blue oxford shirt', category: 'top', colorHex: '#C9D3DC', priceCents: 5900, imageUrl: null },
  { productId: 'sample_p3', name: 'Stone chinos', category: 'bottom', colorHex: '#B49A72', priceCents: 6900, imageUrl: null },
];

const daysLeft = (at: number) => Math.max(1, Math.round((at - Date.now()) / 86_400_000));
const dollars = (cents: number) => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);
const afterDiscount = (cents: number, pct: number) => Math.round(cents * (1 - pct / 100));

type Checkout = ReturnType<typeof useWhopCheckout>;

/** Deals: brand offers, each with the brand's pieces at the deal price and a Whop checkout. */
export default function ShopScreen() {
  const live = useDeals();
  const deals = IS_FIXTURE_MODE ? SAMPLE_DEALS : live;
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const checkout = useWhopCheckout();

  const byBrand = new Map<string, Deal[]>();
  for (const deal of deals ?? []) byBrand.set(deal.brandName, [...(byBrand.get(deal.brandName) ?? []), deal]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Rewear what you own to earn points, then spend them with brands you like. Buy a piece at the deal price with Whop.</Text>
      {deals === null ? <ActivityIndicator style={styles.loading} color={Colors.muted} /> : null}
      {deals?.length === 0 ? <Text style={styles.muted}>No deals right now.</Text> : null}
      {[...byBrand.entries()].map(([brand, list]) => (
        <View key={brand} style={styles.brand} testID="shop-brand">
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>{brand[0]}</Text>
            </View>
            <Text style={styles.brandName}>{brand}</Text>
            <View style={styles.whopTag}>
              <Ionicons name="bag-check-outline" size={13} color={Colors.accent} />
              <Text style={styles.whopTagText}>Whop</Text>
            </View>
          </View>
          {list.map((deal) => (
            <View key={deal.dealId} style={styles.deal} testID="shop-deal">
              <View style={styles.dealTop}>
                <Ionicons name={deal.discountPct > 0 ? 'pricetag-outline' : 'construct-outline'} size={20} color={Colors.accent} />
                <Text style={styles.dealTitle}>{deal.title}</Text>
              </View>
              <Text style={styles.body}>{deal.description}</Text>
              <Text style={styles.meta}>
                {deal.pointsCost} points · ends in {daysLeft(deal.expiresAt)} days
              </Text>
              {deal.discountPct > 0 ? <DealProducts deal={deal} checkout={checkout} /> : null}
              {revealed[deal.dealId] ? (
                <View style={styles.code}>
                  <Text style={styles.codeText}>{deal.code}</Text>
                </View>
              ) : (
                <Button label="Redeem code" compact variant="secondary" icon="gift-outline" onPress={() => setRevealed({ ...revealed, [deal.dealId]: true })} />
              )}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function DealProducts({ deal, checkout }: { deal: Deal; checkout: Checkout }) {
  const live = useBrandProducts(IS_FIXTURE_MODE ? '' : deal.brandSlug);
  const products = IS_FIXTURE_MODE ? SAMPLE_PRODUCTS : live;
  if (products === null) return <ActivityIndicator style={styles.loading} color={Colors.muted} />;
  if (!products.length) return null;
  return (
    <View style={styles.products}>
      <Text style={styles.productsTitle}>Shop {deal.brandName} at {deal.discountPct}% off</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRow}>
        {products.map((p) => {
          const pending = checkout.isPending(p.productId, deal.dealId);
          const error = checkout.errorFor(p.productId, deal.dealId);
          return (
            <View key={p.productId} style={styles.product} testID="deal-product">
              {p.imageUrl ? (
                <Image source={{ uri: p.imageUrl }} style={styles.productImage} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.productImage, { backgroundColor: p.colorHex }]} />
              )}
              <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.price}>{dollars(afterDiscount(p.priceCents, deal.discountPct))}</Text>
                <Text style={styles.was}>{dollars(p.priceCents)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Buy ' + p.name + ' with Whop'}
                accessibilityState={{ busy: pending, disabled: checkout.busy }}
                disabled={checkout.busy}
                onPress={() => checkout.buy(p.productId, deal.dealId)}
                style={({ pressed }) => [styles.buy, (pressed || pending) && styles.buyPressed, checkout.busy && !pending && styles.buyIdle]}
                testID="deal-buy">
                {pending ? <ActivityIndicator size="small" color={Colors.onAccent} /> : <Ionicons name="bag-handle" size={14} color={Colors.onAccent} />}
                <Text style={styles.buyText}>{pending ? 'Opening Whop…' : 'Buy with Whop'}</Text>
              </Pressable>
              {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.four, gap: Spacing.four },
  intro: { fontSize: 15, lineHeight: 21, color: Colors.inkSoft },
  muted: { fontSize: 14, color: Colors.muted },
  loading: { marginVertical: Spacing.three },
  brand: { gap: Spacing.two },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  logo: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: Colors.background, fontWeight: '700', fontSize: 15 },
  brandName: { flex: 1, fontFamily: Fonts.serif, fontSize: 20, color: Colors.ink },
  whopTag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.pill, backgroundColor: Colors.accentSoft },
  whopTagText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  deal: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.four, gap: Spacing.two },
  dealTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dealTitle: { flex: 1, fontFamily: Fonts.serif, fontSize: 18, color: Colors.ink },
  body: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft },
  meta: { fontSize: 12, color: Colors.muted },
  products: { gap: Spacing.two, marginTop: Spacing.one, marginHorizontal: -Spacing.four },
  productsTitle: { fontSize: 13, fontWeight: '700', color: Colors.ink, paddingHorizontal: Spacing.four },
  productRow: { gap: Spacing.three, paddingHorizontal: Spacing.four, paddingBottom: Spacing.one },
  product: { width: 150, gap: 4 },
  productImage: { width: 150, height: 188, borderRadius: Radius.md, backgroundColor: Colors.surfaceSunken },
  productName: { fontSize: 13, lineHeight: 17, color: Colors.ink, minHeight: 34 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { fontSize: 15, fontWeight: '700', color: Colors.accent },
  was: { fontSize: 12, color: Colors.muted, textDecorationLine: 'line-through' },
  buy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, borderRadius: Radius.pill, backgroundColor: Colors.ink, marginTop: 2 },
  buyPressed: { opacity: 0.8 },
  buyIdle: { opacity: 0.45 },
  buyText: { fontSize: 13, fontWeight: '700', color: Colors.onAccent },
  error: { fontSize: 12, lineHeight: 16, color: Colors.danger },
  code: { alignSelf: 'flex-start', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.accent },
  codeText: { fontSize: 15, fontWeight: '700', letterSpacing: 1, color: Colors.accent },
});
