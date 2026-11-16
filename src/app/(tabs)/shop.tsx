import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { BuyButton, Price, RedeemCode } from '@/components/whop';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useBrandProducts, useDeals, type BrandProduct, type Deal } from '@/data/catalog';
import { IS_FIXTURE_MODE } from '@/data/mode';
import { useAppliedCodes, useWhopCheckout } from '@/lib/whop';

/** Built-in deals for fixture mode (no backend). */
const SAMPLE_DEALS: Deal[] = [
  { dealId: 'sd1', brandSlug: 'sample', brandName: 'Northline Studio', title: '15% off your next order', description: 'Use it on anything from Northline Studio. Redeem with Dripp points.', code: 'DRIPP-NORTHLINE-15', discountPct: 15, pointsCost: 300, expiresAt: Date.now() + 14 * 86_400_000 },
  { dealId: 'sd2', brandSlug: 'sample', brandName: 'Northline Studio', title: 'Free repair or alteration', description: 'Keep a piece going instead of replacing it.', code: 'DRIPP-NORTHLINE-FIX', discountPct: 0, pointsCost: 500, expiresAt: Date.now() + 30 * 86_400_000 },
];

/** Built-in products for fixture mode (no backend). */
const SAMPLE_PRODUCTS: BrandProduct[] = [
  { productId: 'sample_p1', name: 'Navy unstructured blazer', category: 'outerwear', colorHex: '#2B2F3A', priceCents: 18900, imageUrl: null },
  { productId: 'sample_p2', name: 'Light blue oxford shirt', category: 'top', colorHex: '#C9D3DC', priceCents: 5900, imageUrl: null },
  { productId: 'sample_p3', name: 'Stone chinos', category: 'bottom', colorHex: '#B49A72', priceCents: 6900, imageUrl: null },
];

const daysLeft = (at: number) => Math.max(1, Math.round((at - Date.now()) / 86_400_000));

type Checkout = ReturnType<typeof useWhopCheckout>;

/** Deals: brand offers, each with the brand's pieces and a Whop checkout. A redeemed code makes Whop apply the deal's discount. */
export default function ShopScreen() {
  const live = useDeals();
  const deals = IS_FIXTURE_MODE ? SAMPLE_DEALS : live;
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const checkout = useWhopCheckout();

  const byBrand = new Map<string, Deal[]>();
  for (const deal of deals ?? []) byBrand.set(deal.brandName, [...(byBrand.get(deal.brandName) ?? []), deal]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Rewear what you own to earn points, then spend them with brands you like. Redeem a deal code and Whop takes the discount off at checkout.</Text>
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
              {deal.discountPct > 0 ? (
                <>
                  <View style={styles.codeRow}>
                    <Text style={styles.meta}>Your code</Text>
                    <View style={styles.code}>
                      <Text style={styles.codeText}>{deal.code}</Text>
                    </View>
                  </View>
                  <RedeemCode scope={{ dealId: deal.dealId }} brandSlug={deal.brandSlug} testID="deal-redeem" />
                  <DealProducts deal={deal} checkout={checkout} />
                </>
              ) : revealed[deal.dealId] ? (
                <View style={styles.code}>
                  <Text style={styles.codeText}>{deal.code}</Text>
                </View>
              ) : (
                <Button label="Show code" compact variant="secondary" icon="gift-outline" onPress={() => setRevealed({ ...revealed, [deal.dealId]: true })} />
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
  const code = useAppliedCodes().forBrand(deal.brandSlug);
  const applied = code?.dealId === deal.dealId ? code : null;
  if (products === null) return <ActivityIndicator style={styles.loading} color={Colors.muted} />;
  if (!products.length) return null;
  return (
    <View style={styles.products}>
      <Text style={styles.productsTitle}>{applied ? `Shop ${deal.brandName} at ${deal.discountPct}% off` : `Shop ${deal.brandName}`}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRow}>
        {products.map((p) => {
          return (
            <View key={p.productId} style={styles.product} testID="deal-product">
              {p.imageUrl ? (
                <Image source={{ uri: p.imageUrl }} style={styles.productImage} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.productImage, { backgroundColor: p.colorHex }]} />
              )}
              <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
              <Price cents={p.priceCents} pct={applied?.discountPct ?? 0} />
              <BuyButton checkout={checkout} productId={p.productId} name={p.name} dealId={deal.dealId} code={applied?.code} testID="deal-buy" style={styles.buyGap} />
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
  brandName: { flex: 1, fontFamily: Fonts.heading, fontSize: 20, color: Colors.ink },
  whopTag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.pill, backgroundColor: Colors.accentSoft },
  whopTagText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  deal: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.four, gap: Spacing.two },
  dealTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dealTitle: { flex: 1, fontFamily: Fonts.heading, fontSize: 18, color: Colors.ink },
  body: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft },
  meta: { fontSize: 12, color: Colors.muted },
  products: { gap: Spacing.two, marginTop: Spacing.one, marginHorizontal: -Spacing.four },
  productsTitle: { fontSize: 13, fontWeight: '700', color: Colors.ink, paddingHorizontal: Spacing.four },
  productRow: { gap: Spacing.three, paddingHorizontal: Spacing.four, paddingBottom: Spacing.one },
  product: { width: 150, gap: 4 },
  productImage: { width: 150, height: 188, borderRadius: Radius.md, backgroundColor: Colors.surfaceSunken },
  productName: { fontSize: 13, lineHeight: 17, color: Colors.ink, minHeight: 34 },
  buyGap: { marginTop: 2 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  code: { alignSelf: 'flex-start', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.accent },
  codeText: { fontSize: 15, fontWeight: '700', letterSpacing: 1, color: Colors.accent },
});
