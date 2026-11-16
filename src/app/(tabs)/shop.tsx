import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, MockBadge } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useDeals, type Deal } from '@/data/catalog';
import { IS_FIXTURE_MODE } from '@/data/mode';

/** SAMPLE deals for fixture mode. */
const SAMPLE_DEALS: Deal[] = [
  { dealId: 'sd1', brandSlug: 'sample', brandName: 'Sample Studio', title: '15% off your next order', description: 'Sample offer. Redeem with Wear Again points.', code: 'SAMPLE-15', discountPct: 15, pointsCost: 300, expiresAt: Date.now() + 14 * 86_400_000 },
  { dealId: 'sd2', brandSlug: 'sample', brandName: 'Sample Studio', title: 'Free repair or alteration', description: 'Keep a piece going instead of replacing it.', code: 'SAMPLE-FIX', discountPct: 0, pointsCost: 500, expiresAt: Date.now() + 30 * 86_400_000 },
];

const daysLeft = (at: number) => Math.max(1, Math.round((at - Date.now()) / 86_400_000));

/** Shop: brand deals only. Points come from logging wears; nothing here is a real offer. */
export default function ShopScreen() {
  const live = useDeals();
  const deals = IS_FIXTURE_MODE ? SAMPLE_DEALS : live;
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const byBrand = new Map<string, Deal[]>();
  for (const deal of deals ?? []) byBrand.set(deal.brandName, [...(byBrand.get(deal.brandName) ?? []), deal]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <MockBadge label="Sample brand offers, no checkout" />
      <Text style={styles.intro}>Rewear what you own to earn points, then spend them with brands you like.</Text>
      {deals === null ? <Text style={styles.muted}>Loading deals…</Text> : null}
      {[...byBrand.entries()].map(([brand, list]) => (
        <View key={brand} style={styles.brand} testID="shop-brand">
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>{brand[0]}</Text>
            </View>
            <Text style={styles.brandName}>{brand}</Text>
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
              {revealed[deal.dealId] ? (
                <View style={styles.code}>
                  <Text style={styles.codeText}>{deal.code}</Text>
                </View>
              ) : (
                <Button label="Redeem" compact variant="secondary" icon="gift-outline" onPress={() => setRevealed({ ...revealed, [deal.dealId]: true })} />
              )}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.four, gap: Spacing.four },
  intro: { fontSize: 15, lineHeight: 21, color: Colors.inkSoft },
  muted: { fontSize: 14, color: Colors.muted },
  brand: { gap: Spacing.two },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  logo: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: Colors.background, fontWeight: '700', fontSize: 15 },
  brandName: { fontFamily: Fonts.serif, fontSize: 20, color: Colors.ink },
  deal: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.four, gap: Spacing.two },
  dealTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dealTitle: { flex: 1, fontFamily: Fonts.serif, fontSize: 18, color: Colors.ink },
  body: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft },
  meta: { fontSize: 12, color: Colors.muted },
  code: { alignSelf: 'flex-start', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.accent },
  codeText: { fontSize: 15, fontWeight: '700', letterSpacing: 1, color: Colors.accent },
});
