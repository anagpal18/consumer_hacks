import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, MockBadge } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useFeed } from '@/data/catalog';
import { setSession } from '@/state/session';

/** SAMPLE posts. There is no feed backend in the contract yet. */
const SAMPLE_POSTS = [
  { id: 'post_1', author: 'Maya R.', caption: 'Gallery opening, then dinner', prompt: 'dinner after a gallery opening', swatches: ['#3F5878', '#F1EEE8', '#3B3B40', '#6B4630'], likes: 128 },
  { id: 'post_2', author: 'Dev K.', caption: 'Saturday coffee run', prompt: 'weekend coffee with friends', swatches: ['#8A9A7B', '#EDEAE4', '#B49A72', '#EDEAE4'], likes: 74 },
  { id: 'post_3', author: 'Studio Nine', caption: 'Smart casual for the office', prompt: 'a smart casual day at the office', swatches: ['#2B2F3A', '#C9D3DC', '#3B3B40', '#1E1E1E'], likes: 311 },
];

export default function FeedScreen() {
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [following, setFollowing] = useState<Record<string, boolean>>({});

  const live = useFeed(12);
  const posts = live ? live.map((p) => ({ id: p.postId, author: p.author, caption: p.caption, prompt: p.prompt, swatches: p.swatches, images: p.images ?? [], pieces: p.pieces ?? [], likes: p.likes, kind: p.kind })) : SAMPLE_POSTS.map((p) => ({ ...p, images: [] as string[], pieces: [] as string[], kind: 'friend' }));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <MockBadge label="Sample feed · illustrative product images" />
      {posts.map((post) => (
        <View key={post.id} style={styles.card} testID="feed-post">
          <View style={styles.row}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{post.author[0]}</Text></View>
            <Text style={styles.author}>{post.author}{post.kind === 'friend' ? '' : post.kind === 'brand' ? '  ·  Brand' : '  ·  Creator'}</Text>
            <Button label={following[post.id] ? 'Following' : 'Follow'} compact variant={following[post.id] ? 'secondary' : 'ghost'} onPress={() => setFollowing({ ...following, [post.id]: !following[post.id] })} />
          </View>
          {post.images.length > 0 ? (
            <View style={styles.grid} testID="feed-photos">
              {post.images.slice(0, 4).map((uri, index) => (
                <Image key={index} source={{ uri }} style={styles.photo} contentFit="cover" transition={150} />
              ))}
            </View>
          ) : (
            <View style={styles.look}>
              {post.swatches.map((color, index) => (
                <View key={index} style={[styles.swatch, { backgroundColor: color, flex: index === 3 ? 0.5 : 1 }]} />
              ))}
            </View>
          )}
          {post.pieces.length > 0 ? <Text style={styles.pieces}>{post.pieces.join('  ·  ')}</Text> : null}
          <Text style={styles.caption}>{post.caption}</Text>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" accessibilityLabel="Like" hitSlop={8} onPress={() => setLiked({ ...liked, [post.id]: !liked[post.id] })} style={styles.like}>
              <Ionicons name={liked[post.id] ? 'heart' : 'heart-outline'} size={24} color={liked[post.id] ? Colors.accent : Colors.inkSoft} />
              <Text style={styles.likeCount}>{post.likes + (liked[post.id] ? 1 : 0)}</Text>
            </Pressable>
            <Button
              label="Make it with my closet"
              compact
              icon="sparkles-outline"
              onPress={() => {
                setSession({ pendingPrompt: post.prompt });
                router.navigate('/');
              }}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.four, gap: Spacing.four },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Fonts.serif, fontSize: 16, color: Colors.ink },
  author: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.ink },
  look: { height: 200, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.mirror, padding: Spacing.four, gap: 4, alignItems: 'stretch', paddingHorizontal: 96 },
  grid: { flexDirection: 'row', gap: 4, height: 190, borderRadius: Radius.md, overflow: 'hidden' },
  photo: { flex: 1, height: 190, backgroundColor: Colors.surfaceSunken },
  pieces: { fontSize: 12, lineHeight: 17, color: Colors.muted },
  swatch: { borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  caption: { fontFamily: Fonts.serif, fontSize: 18, color: Colors.ink },
  like: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.one, minHeight: 44 },
  likeCount: { fontSize: 14, color: Colors.inkSoft },
});
