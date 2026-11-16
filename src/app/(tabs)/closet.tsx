import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AVAILABILITY_LABEL, Button, Choice, GarmentThumb, MockBadge, Pill } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { api } from '@/data/api';
import { useCloset } from '@/data/hooks';
import { PRIVATE_CATEGORIES, type ClosetItem, type GarmentCategory } from '@shared/contract';

const FILTERS: { key: string; label: string; match: (item: ClosetItem) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'top', label: 'Tops', match: (item) => item.category === 'top' || item.category === 'dress' },
  { key: 'bottom', label: 'Bottoms', match: (item) => item.category === 'bottom' },
  { key: 'outerwear', label: 'Jackets', match: (item) => item.category === 'outerwear' },
  { key: 'shoes', label: 'Shoes', match: (item) => item.category === 'shoes' },
  { key: 'private', label: 'Private', match: (item) => PRIVATE_CATEGORIES.includes(item.category as GarmentCategory) },
  { key: 'laundry', label: 'In laundry', match: (item) => item.availability === 'laundry' },
];

export default function ClosetScreen() {
  const closet = useCloset();
  const [filter, setFilter] = useState('all');
  const [note, setNote] = useState<string | null>(null);

  if (!closet) return <View style={styles.empty}><Text style={styles.muted}>Opening your closet…</Text></View>;

  const inLaundry = closet.filter((item) => item.availability === 'laundry');
  const shown = closet.filter(FILTERS.find((entry) => entry.key === filter)!.match);

  async function laundryDone() {
    const result = await api.closet.markWashed({});
    setNote(`${result.items.length} ${result.items.length === 1 ? 'piece is' : 'pieces are'} clean and back in your closet.`);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Text style={styles.count}>
          {closet.length} pieces · {inLaundry.length} in laundry
        </Text>
        {api.usingMockData ? <MockBadge /> : null}
      </View>

      <View style={styles.topRow}>
        <Button label="Scan clothes" icon="videocam-outline" compact testID="closet-scan" onPress={() => router.push('/scan')} style={styles.grow} />
        {inLaundry.length > 0 ? (
          <Button label={`Laundry done (${inLaundry.length})`} icon="sparkles-outline" compact variant="secondary" testID="laundry-done" onPress={laundryDone} style={styles.grow} />
        ) : null}
      </View>

      {note ? <Text style={styles.note}>{note}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((entry) => (
          <Choice key={entry.key} label={entry.label} selected={filter === entry.key} onPress={() => setFilter(entry.key)} />
        ))}
      </ScrollView>

      {closet.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.muted}>Scan your clothes with a short video. You confirm every piece before it is added.</Text>
          {api.dev ? <Button label="Load a starter closet" variant="ghost" compact onPress={() => api.dev?.loadSampleCloset()} /> : null}
        </View>
      ) : shown.length === 0 ? (
        <Text style={styles.muted}>No pieces match this filter.</Text>
      ) : null}

      <View style={styles.grid}>
        {shown.map((item) => {
          const laundry = item.availability === 'laundry';
          return (
            <View key={item.itemId} style={[styles.card, laundry && styles.cardLaundry]} testID={`closet-${item.itemId}`}>
              <GarmentThumb media={item.media} colorHex={item.colorHex} category={item.category} size={96} style={styles.thumb} />
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <View style={styles.pills}>
                <Pill
                  label={AVAILABILITY_LABEL[item.availability]}
                  tone={laundry ? 'laundry' : item.availability === 'available' ? 'success' : 'neutral'}
                  icon={laundry ? 'water' : undefined}
                />
                {item.wearsSinceWash > 0 && !laundry ? <Pill label={`Worn ${item.wearsSinceWash}× since wash`} tone="worn" /> : null}
                {!item.renderAssetKey && !PRIVATE_CATEGORIES.includes(item.category) ? <Pill label="Photo only" /> : null}
              </View>
              <Text style={styles.wears}>{item.wearCount} {item.wearCount === 1 ? 'wear' : 'wears'} in total</Text>
              {laundry ? (
                <Button label="Washed, put back" compact variant="secondary" onPress={() => api.closet.markWashed({ itemIds: [item.itemId] })} />
              ) : item.availability === 'available' ? (
                <Button label="Move to laundry" compact variant="secondary" icon="water-outline" onPress={() => api.closet.setStatus({ itemId: item.itemId, availability: 'laundry' })} />
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.four, gap: Spacing.three },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  grow: { flex: 1 },
  count: { fontSize: 14, color: Colors.inkSoft },
  note: { fontSize: 13, color: Colors.success, fontWeight: '600' },
  filters: { gap: Spacing.two, paddingRight: Spacing.four },
  muted: { fontSize: 14, lineHeight: 20, color: Colors.muted },
  emptyCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.five, gap: Spacing.two },
  emptyTitle: { fontFamily: Fonts.serif, fontSize: 22, color: Colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    maxWidth: '48.5%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardLaundry: { borderColor: Colors.laundry, backgroundColor: Colors.laundrySoft },
  thumb: { width: '100%' },
  name: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, minHeight: 22 },
  wears: { fontSize: 12, color: Colors.muted },
});
