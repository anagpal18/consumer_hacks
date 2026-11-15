import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, GarmentThumb, MockBadge, Pill } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useCloset } from '@/data/hooks';
import { setSession } from '@/state/session';

/** SAMPLE recommendation. No partner catalog or checkout is connected. */
const SAMPLE_PRODUCT = {
  name: 'Camel wool overcoat',
  colorHex: '#B88A55',
  price: '$180',
  pairsWith: ['bottom', 'shoes', 'top'],
  prompt: 'a cold evening out in a camel overcoat',
};

export default function ShopScreen() {
  const closet = useCloset();
  const matches = (closet ?? [])
    .filter((item) => item.availability !== 'retired' && SAMPLE_PRODUCT.pairsWith.includes(item.category))
    .slice(0, 4);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <MockBadge label="Sample catalog, no checkout" />
      <View style={styles.card}>
        <View style={[styles.hero, { backgroundColor: SAMPLE_PRODUCT.colorHex }]}>
          <Text style={styles.heroLabel}>SAMPLE ITEM</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.name}>{SAMPLE_PRODUCT.name}</Text>
          <Text style={styles.price}>{SAMPLE_PRODUCT.price}</Text>
        </View>
        <Pill label="Sample partner listing" />

        <Text style={styles.heading}>Why this fits your closet</Text>
        {matches.length === 0 ? (
          <Text style={styles.body}>Scan your closet to see which of your own pieces this works with.</Text>
        ) : (
          <>
            <Text style={styles.body}>It layers over {matches.length} {matches.length === 1 ? 'piece' : 'pieces'} you already own:</Text>
            {matches.map((item) => (
              <View key={item.itemId} style={styles.match}>
                <GarmentThumb media={item.media} colorHex={item.colorHex} category={item.category} size={44} />
                <Text style={styles.matchName}>{item.name}</Text>
                <Text style={styles.matchMeta}>{item.wearCount} wears</Text>
              </View>
            ))}
          </>
        )}

        <Button
          label={matches.length === 0 ? 'Scan your closet' : 'Preview outfits'}
          icon={matches.length === 0 ? 'videocam-outline' : 'eye-outline'}
          onPress={() => {
            if (matches.length === 0) return router.push('/scan');
            setSession({ pendingPrompt: SAMPLE_PRODUCT.prompt });
            router.navigate('/');
          }}
        />
        <Text style={styles.note}>The preview styles your own pieces. The sample item is not added to the mirror.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.four, gap: Spacing.three },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.four, gap: Spacing.three },
  hero: { height: 200, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  heroLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  name: { fontFamily: Fonts.serif, fontSize: 22, color: Colors.ink },
  price: { fontSize: 16, fontWeight: '600', color: Colors.inkSoft },
  heading: { fontSize: 16, fontWeight: '700', color: Colors.ink, marginTop: Spacing.one },
  body: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft },
  match: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  matchName: { flex: 1, fontSize: 15, color: Colors.ink },
  matchMeta: { fontSize: 12, color: Colors.muted },
  note: { fontSize: 12, color: Colors.muted, textAlign: 'center' },
});
