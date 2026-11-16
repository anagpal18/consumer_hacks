import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, MockBadge, Pill } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { api } from '@/data/api';
import { useCloset, useProfile, useWearProgress } from '@/data/hooks';

export default function ProfileScreen() {
  const profile = useProfile();
  const closet = useCloset();
  const progress = useWearProgress();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addPhoto() {
    setError(null);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
      if (!picked.canceled) setPhotoUri(picked.assets[0].uri);
    } catch {
      setError('Could not open your photos.');
    }
  }

  const challenges = (progress?.challenge ?? []).slice(0, 3);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {api.usingMockData ? <MockBadge label="Sample data build" /> : null}

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{progress?.streakDays ?? 0}</Text>
          <Text style={styles.statLabel}>day streak</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{progress?.wearsLogged ?? 0}</Text>
          <Text style={styles.statLabel}>wears saved</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{closet?.length ?? 0}</Text>
          <Text style={styles.statLabel}>pieces</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>One Piece, Three Ways</Text>
        <Text style={styles.body}>Wear the same piece in three different outfits.</Text>
        {challenges.length === 0 ? (
          <Text style={styles.muted}>Confirm Wearing this on Home to start.</Text>
        ) : (
          challenges.map((entry) => (
            <View key={entry.itemId} style={styles.challenge}>
              <Text style={styles.challengeName}>{closet?.find((item) => item.itemId === entry.itemId)?.name ?? 'A piece'}</Text>
              <View style={styles.dots}>
                {Array.from({ length: entry.target }, (_, index) => (
                  <View key={index} style={[styles.dot, index < entry.distinctOutfits && styles.dotDone]} />
                ))}
              </View>
              <Text style={styles.muted}>{entry.completed ? 'Done' : `${entry.distinctOutfits} of ${entry.target}`}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Outfit photo</Text>
        <Text style={styles.body}>Add a photo of today&apos;s outfit to extend your streak. It stays private until you choose to share it.</Text>
        {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" /> : null}
        {photoUri ? <Pill label="Private, on this device only" icon="lock-closed" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={photoUri ? 'Replace photo' : 'Add a private photo'} icon="camera-outline" variant="secondary" compact onPress={addPhoto} />
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Points and offers</Text>
        <Pill label="Partner offers coming soon" />
        <Text style={styles.body}>{(progress?.wearsLogged ?? 0) * 10} points. Redeem them with partner offers soon.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Avatar</Text>
        <Text style={styles.body}>
          {profile?.avatarStatus === 'preparing' ? 'Your avatar is being prepared.' : profile?.avatar.demo ? 'Using a standard avatar.' : 'Your avatar is ready.'} Height {profile?.heightCm ?? 170} cm.
        </Text>
        <Button label="Edit avatar" variant="secondary" compact onPress={() => router.replace('/onboarding')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.four, gap: Spacing.three },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, paddingVertical: Spacing.four },
  statValue: { fontFamily: Fonts.heading, fontSize: 28, color: Colors.ink },
  statLabel: { fontSize: 12, color: Colors.muted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.four, gap: Spacing.two },
  heading: { fontFamily: Fonts.heading, fontSize: 20, color: Colors.ink },
  body: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft },
  muted: { fontSize: 13, color: Colors.muted },
  error: { fontSize: 13, color: Colors.danger },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 32 },
  challengeName: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.ink },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.accent },
  dotDone: { backgroundColor: Colors.accent },
  photo: { width: 120, height: 160, borderRadius: Radius.md },
});
