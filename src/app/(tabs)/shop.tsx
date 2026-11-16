import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, GarmentThumb, MockBadge, Pill } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useDeals, useProductPicks } from '@/data/catalog';
import { useCloset } from '@/data/hooks';
import { setSession } from '@/state/session';

/** SAMPLE recommendation, used in fixture mode. No partner catalog or checkout is connected. */
const SAMPLE_PRODUCT = {
  name: 'Camel wool overcoat',
  colorHex: '#B88A55',
  price: '$180',
  pairsWith: ['bottom', 'shoes', 'top'],
  prompt: 'a cold evening out in a camel overcoat',
};

const money = (cents: number) => '$' + Math.round(cents / 100);

export default function ShopScreen() {
  const closet = useCloset();
  const picks = useProductPicks(12);
  const deals = useDeals();
  const fallbackMatches = (closet ?? [])
    .filter((item) => item.availability !== 'retired' && SAMPLE_PRODUCT.pairsWith.includes(item.category))
    .slice(0, 4);

  const cards = picks
    ? picks.map((p) => ({
        id: p.productId,
        name: p.name,
        brand: p.brandName,
        colorHex: p.colorHex,
        imageUrl: p.imageUrl ?? null,
        price: money(p.priceCents),
        prompt: p.prompt,
        matchCount: p.matchCount,
        matches: p.matches.map((m) => ({ id: m.itemId, name: m.name, colorHex: m.colorHex ?? undefined, category: m.category, wearCount: m.wearCount, media: { url: m.photoUrl ?? null } })),
      }))
    : [
        {
          id: 'sample',
          name: SAMPLE_PRODUCT.name,
          brand: 'Sample partner',
          colorHex: SAMPLE_PRODUCT.colorHex,
          imageUrl: null as string | null,
          price: SAMPLE_PRODUCT.price,
          prompt: SAMPLE_PRODUCT.prompt,
          matchCount: fallbackMatches.length,
          matches: fallbackMatches.map((m) => ({ id: m.itemId, name: m.name, colorHex: m.colorHex, category: m.category, wearCount: m.wearCount, media: m.media })),
        },
      ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <MockBadge label="Sample catalog, no checkout" />

      {deals && deals.length > 0 ? (
        <View>
          <Text style={styles.section}>Brand deals (sample offers)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deals}>
            {deals.slice(0, 12).map((deal) => (
              <View key={deal.dealId} style={styles.deal} testID="shop-deal">
                <Text style={styles.dealBrand}>{deal.brandName}</Text>
                <Text style={styles.dealTitle}>{deal.title}</Text>
                <Text style={styles.dealMeta}>{deal.pointsCost} points · sample offer</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {cards.map((card) => (
        <View key={card.id} style={styles.card} testID="shop-product">
          {card.imageUrl ? (
            <Image source={{ uri: card.imageUrl }} style={styles.heroPhoto} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.hero, { backgroundColor: card.colorHex }]}>
              <Text style={styles.heroLabel}>SAMPLE ITEM</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.name}>{card.name}</Text>
            <Text style={styles.price}>{card.price}</Text>
          </View>
          <Pill label={card.brand + ' · sample listing, illustrative image'} />

          <Text style={styles.heading}>Why this fits your closet</Text>
          {card.matches.length === 0 ? (
            <Text style={styles.body}>Scan your closet to see which of your own pieces this works with.</Text>
          ) : (
            <>
              <Text style={styles.body}>
                It works with {card.matchCount} {card.matchCount === 1 ? 'piece' : 'pieces'} you already own, such as:
              </Text>
              {card.matches.map((item) => (
                <View key={item.id} style={styles.match}>
                  <GarmentThumb media={item.media} colorHex={item.colorHex} category={item.category as never} size={44} />
                  <Text style={styles.matchName}>{item.name}</Text>
                  <Text style={styles.matchMeta}>{item.wearCount} wears</Text>
                </View>
              ))}
            </>
          )}

          <Button
            label={card.matches.length === 0 ? 'Scan your closet' : 'Preview outfits'}
            icon={card.matches.length === 0 ? 'videocam-outline' : 'eye-outline'}
            onPress={() => {
              if (card.matches.length === 0) return router.push('/scan');
              setSession({ pendingPrompt: card.prompt });
              router.navigate('/');
            }}
          />
          <Text style={styles.note}>The preview styles your own pieces. The sample item is not added to the mirror.</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.four, gap: Spacing.three },
  section: { fontSize: 16, fontWeight: '700', color: Colors.ink, marginBottom: Spacing.two },
  deals: { gap: Spacing.two, paddingRight: Spacing.four },
  deal: { width: 200, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: Spacing.three, gap: 4 },
  dealBrand: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: Colors.inkSoft },
  dealTitle: { fontFamily: Fonts.serif, fontSize: 16, color: Colors.ink },
  dealMeta: { fontSize: 12, color: Colors.muted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.four, gap: Spacing.three },
  hero: { height: 160, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  heroPhoto: { width: '100%', aspectRatio: 1.15, borderRadius: Radius.md, backgroundColor: Colors.surfaceSunken },
  heroLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  name: { fontFamily: Fonts.serif, fontSize: 22, color: Colors.ink, flex: 1 },
  price: { fontSize: 16, fontWeight: '600', color: Colors.inkSoft },
  heading: { fontSize: 16, fontWeight: '700', color: Colors.ink, marginTop: Spacing.one },
  body: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft },
  match: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  matchName: { flex: 1, fontSize: 15, color: Colors.ink },
  matchMeta: { fontSize: 12, color: Colors.muted },
  note: { fontSize: 12, color: Colors.muted, textAlign: 'center' },
});
