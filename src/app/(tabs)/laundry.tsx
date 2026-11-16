import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, GarmentThumb } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { api } from '@/data/api';
import { useCloset } from '@/data/hooks';
import { PRIVATE_CATEGORIES, type ClosetItem, type GarmentCategory } from '@shared/contract';

/** Laundry: what is in the wash, and what has been worn enough to need one. */
const dueWash = (item: ClosetItem) => item.wearsSinceWash >= (item.category === 'outerwear' || item.category === 'bottom' ? 5 : item.category === 'shoes' ? 8 : 2);

export default function LaundryScreen() {
  const closet = useCloset();
  const [note, setNote] = useState<string | null>(null);
  if (!closet) return <View style={styles.empty}><Text style={styles.muted}>Opening your laundry…</Text></View>;

  const visible = closet.filter((item) => !PRIVATE_CATEGORIES.includes(item.category as GarmentCategory) || item.availability === 'laundry');
  const inWash = visible.filter((item) => item.availability === 'laundry');
  const due = visible
    .filter((item) => item.availability === 'available' && item.wearsSinceWash > 0)
    .sort((a, b) => Number(dueWash(b)) - Number(dueWash(a)) || b.wearsSinceWash - a.wearsSinceWash);

  async function allWashed() {
    const result = await api.closet.markWashed({});
    setNote(`${result.items.length} ${result.items.length === 1 ? 'piece is' : 'pieces are'} clean and back in your closet.`);
  }

  const row = (item: ClosetItem, action: React.ReactNode) => (
    <View key={item.itemId} style={styles.row} testID="laundry-item">
      <GarmentThumb media={item.media} colorHex={item.colorHex} category={item.category} size={56} />
      <View style={styles.grow}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.meta}>
          {item.availability === 'laundry' ? 'In the wash' : `Worn ${item.wearsSinceWash}x since last wash${dueWash(item) ? ' · due a wash' : ''}`}
        </Text>
      </View>
      {action}
    </View>
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.heading}>In the wash · {inWash.length}</Text>
        {inWash.length === 0 ? <Text style={styles.muted}>Nothing in the wash. The stylist can use everything.</Text> : null}
        {inWash.map((item) =>
          row(item, <Button label="Washed" compact variant="secondary" icon="checkmark" onPress={() => api.closet.markWashed({ itemIds: [item.itemId] })} />),
        )}
        {inWash.length > 1 ? <Button label="Everything is washed" icon="sparkles-outline" onPress={allWashed} /> : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
        <Text style={styles.muted}>Pieces in the wash are left out of new looks until you put them back.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Worn since last wash · {due.length}</Text>
        {due.length === 0 ? <Text style={styles.muted}>Log a wear on Home and pieces show up here.</Text> : null}
        {due.map((item) =>
          row(item, <Button label="Wash" compact variant={dueWash(item) ? 'primary' : 'secondary'} icon="water-outline" onPress={() => api.closet.setStatus({ itemId: item.itemId, availability: 'laundry' })} />),
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.four, gap: Spacing.four },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.four, gap: Spacing.three },
  heading: { fontFamily: Fonts.heading, fontSize: 20, color: Colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  meta: { fontSize: 12, color: Colors.muted },
  muted: { fontSize: 13, lineHeight: 18, color: Colors.muted },
  note: { fontSize: 13, color: Colors.ink },
});
