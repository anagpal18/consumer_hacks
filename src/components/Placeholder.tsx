import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.five, gap: Spacing.two },
  title: { fontFamily: Fonts.serif, fontSize: 28, color: Colors.ink },
  note: { fontSize: 14, color: Colors.muted, textAlign: 'center' },
});
