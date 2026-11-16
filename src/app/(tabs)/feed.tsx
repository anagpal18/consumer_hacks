import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MockBadge } from '@/components/ui';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { addToCloset, toggleLike, useReels, type Piece, type Reel } from '@/data/catalog';
import { IS_FIXTURE_MODE } from '@/data/mode';
import { setSession } from '@/state/session';

/** SAMPLE reels for fixture mode. Illustrative pieces, no real products. */
const SAMPLE_REELS: Reel[] = [
  {
    postId: 'sample_1',
    rank: 3,
    brandSlug: 'sample',
    brandName: 'Sample Studio',
    caption: 'Smart casual for the office',
    prompt: 'a smart casual day at the office',
    likes: 311,
    likedByMe: false,
    pieces: [
      { productId: 'sample_p1', name: 'Navy unstructured blazer', brandName: 'Sample Studio', category: 'outerwear', imageUrl: null, priceCents: 18900, summary: 'Soft wool-blend blazer with a relaxed shoulder. Dresses up chinos without feeling stiff.', inCloset: false, colorHex: '#2B2F3A' },
      { productId: 'sample_p2', name: 'Light blue oxford shirt', brandName: 'Sample Studio', category: 'top', imageUrl: null, priceCents: 5900, summary: 'Cotton oxford in a regular fit. Works tucked or untucked.', inCloset: false, colorHex: '#C9D3DC' },
      { productId: 'sample_p3', name: 'Stone chinos', brandName: 'Sample Studio', category: 'bottom', imageUrl: null, priceCents: 6900, summary: 'Mid-weight cotton twill with a tapered leg, office to weekend.', inCloset: false, colorHex: '#B49A72' },
    ],
  },
  {
    postId: 'sample_2',
    rank: 2,
    brandSlug: 'sample',
    brandName: 'Sample Outfitters',
    caption: 'Saturday coffee run',
    prompt: 'weekend coffee with friends',
    likes: 74,
    likedByMe: false,
    pieces: [
      { productId: 'sample_p4', name: 'Olive overshirt', brandName: 'Sample Outfitters', category: 'outerwear', imageUrl: null, priceCents: 8900, summary: 'Brushed cotton overshirt, a light layer for cool mornings.', inCloset: false, colorHex: '#6B7458' },
      { productId: 'sample_p5', name: 'Ecru crewneck tee', brandName: 'Sample Outfitters', category: 'top', imageUrl: null, priceCents: 2900, summary: 'Heavyweight jersey tee with a boxy fit.', inCloset: false, colorHex: '#EDEAE4' },
    ],
  },
  {
    postId: 'sample_3',
    rank: 1,
    brandSlug: 'sample',
    brandName: 'Sample Tailors',
    caption: 'Gallery opening, then dinner',
    prompt: 'dinner after a gallery opening',
    likes: 128,
    likedByMe: false,
    pieces: [
      { productId: 'sample_p6', name: 'Charcoal merino rollneck', brandName: 'Sample Tailors', category: 'top', imageUrl: null, priceCents: 9900, summary: 'Fine merino rollneck, warm and slim under a jacket.', inCloset: false, colorHex: '#3B3B40' },
      { productId: 'sample_p7', name: 'Brown suede loafers', brandName: 'Sample Tailors', category: 'shoes', imageUrl: null, priceCents: 14900, summary: 'Unlined suede loafers that read dressy without a tie.', inCloset: false, colorHex: '#6B4630' },
    ],
  },
];

const money = (cents: number) => '$' + Math.round(cents / 100);
const DOUBLE_TAP_MS = 280;
const handle = (brand: string) => brand.toLowerCase().replace(/[^a-z0-9]+/g, '');

type LikeState = { liked: boolean; likes: number };

/** Instagram-style feed of brand looks: stories row, post header, swipeable photos, actions, caption. */
export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<Reel>>(null);
  const [likes, setLikes] = useState<Record<string, LikeState>>({});
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  const reels = useReels(10);
  const posts = IS_FIXTURE_MODE ? SAMPLE_REELS : (reels?.posts ?? null);
  const serverActions = !IS_FIXTURE_MODE && reels?.source === 'reels';

  const like = (post: Reel, onlyLike: boolean) => {
    const current = likes[post.postId] ?? { liked: post.likedByMe, likes: post.likes };
    if (onlyLike && current.liked) return;
    setLikes((map) => ({ ...map, [post.postId]: { liked: !current.liked, likes: current.likes + (current.liked ? -1 : 1) } }));
    if (!serverActions) return;
    toggleLike(post.postId).then(
      (result) => setLikes((map) => ({ ...map, [post.postId]: result })),
      (error) => {
        console.warn('like failed', error);
        setLikes((map) => ({ ...map, [post.postId]: current }));
      },
    );
  };

  const add = (piece: Piece) => {
    if (owned[piece.productId] || piece.inCloset || !piece.productId) return;
    setOwned((map) => ({ ...map, [piece.productId]: true }));
    if (!serverActions) return;
    addToCloset(piece.productId).catch((error) => {
      console.warn('add to closet failed', error);
      setOwned((map) => ({ ...map, [piece.productId]: false }));
    });
  };

  const brands = posts ? [...new Map(posts.map((p, index) => [p.brandName, index])).entries()] : [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>Wear Again</Text>
        <Ionicons name="heart-outline" size={24} color={Colors.ink} />
      </View>
      {posts === null ? (
        <ActivityIndicator style={styles.loading} color={Colors.muted} />
      ) : (
        <FlatList
          ref={list}
          data={posts}
          keyExtractor={(post) => post.postId}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={1.5}
          onEndReached={reels?.loadMore}
          onScrollToIndexFailed={() => undefined}
          testID="feed-list"
          ListHeaderComponent={
            <View>
              <FlatList
                horizontal
                data={brands}
                keyExtractor={([brand]) => brand}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stories}
                renderItem={({ item: [brand, index] }) => (
                  <Pressable accessibilityRole="button" accessibilityLabel={brand + ' story'} style={styles.story} onPress={() => list.current?.scrollToIndex({ index, animated: true })}>
                    <View style={styles.storyRing}>
                      <View style={styles.storyAvatar}>
                        <Text style={styles.storyLetter}>{brand[0]}</Text>
                      </View>
                    </View>
                    <Text style={styles.storyName} numberOfLines={1}>{handle(brand)}</Text>
                  </Pressable>
                )}
              />
              <View style={styles.badge}>
                <MockBadge label="Sample brand posts · illustrative product images" />
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <Post
              post={item}
              likeState={likes[item.postId] ?? { liked: item.likedByMe, likes: item.likes }}
              isOwned={(piece) => piece.inCloset || !!owned[piece.productId]}
              onLike={(onlyLike) => like(item, onlyLike)}
              onAdd={add}
            />
          )}
        />
      )}
    </View>
  );
}

type PostProps = {
  post: Reel;
  likeState: LikeState;
  isOwned: (piece: Piece) => boolean;
  onLike: (onlyLike: boolean) => void;
  onAdd: (piece: Piece) => void;
};

function Post({ post, likeState, isOwned, onLike, onAdd }: PostProps) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const lastTap = useRef(0);
  const burst = useSharedValue(0);
  const pop = useSharedValue(1);
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.get(), transform: [{ scale: 0.5 + burst.get() * 0.7 }] }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const piece = post.pieces[index] ?? post.pieces[0];
  const owned = piece ? isOwned(piece) : false;
  const photoHeight = Math.round(width * 1.15);

  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      burst.set(withSequence(withTiming(1, { duration: 140 }), withDelay(420, withTiming(0, { duration: 220 }))));
      pop.set(withSequence(withTiming(1.3, { duration: 110 }), withSpring(1)));
      onLike(true);
      return;
    }
    lastTap.current = now;
  };

  return (
    <View style={styles.post} testID="feed-post">
      <View style={styles.postHeader}>
        <View style={styles.headerRing}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerLetter}>{post.brandName[0]}</Text>
          </View>
        </View>
        <View style={styles.grow}>
          <View style={styles.nameRow}>
            <Text style={styles.brand}>{handle(post.brandName)}</Text>
            <Ionicons name="checkmark-circle" size={14} color="#3897F0" />
          </View>
          <Text style={styles.sponsored}>Sample · {post.caption}</Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={20} color={Colors.ink} />
      </View>

      <View style={{ width, height: photoHeight }}>
        <FlatList
          horizontal
          pagingEnabled
          data={post.pieces}
          keyExtractor={(p, i) => p.productId || String(i)}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
          renderItem={({ item: p }) => (
            <Pressable onPress={tap} accessibilityLabel="Double tap to like" testID="feed-hero">
              {p.imageUrl ? (
                <Image source={{ uri: p.imageUrl }} style={{ width, height: photoHeight }} contentFit="cover" transition={150} />
              ) : (
                <View style={[{ width, height: photoHeight }, styles.swatch, { backgroundColor: p.colorHex ?? Colors.mirror }]}>
                  <Text style={styles.swatchLabel}>SAMPLE ITEM</Text>
                </View>
              )}
            </Pressable>
          )}
        />
        <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
          <Ionicons name="heart" size={110} color="#FFFFFF" />
        </Animated.View>
        {post.pieces.length > 1 ? (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>{index + 1}/{post.pieces.length}</Text>
          </View>
        ) : null}
        {piece ? (
          <View style={styles.tag} pointerEvents="none">
            <Ionicons name="bag-handle-outline" size={13} color="#FFFFFF" />
            <Text style={styles.tagText} numberOfLines={1}>{piece.name}{piece.priceCents ? ' · ' + money(piece.priceCents) : ''}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Animated.View style={popStyle}>
          <Pressable accessibilityRole="button" accessibilityLabel={likeState.liked ? 'Unlike' : 'Like'} hitSlop={8} onPress={() => onLike(false)}>
            <Ionicons name={likeState.liked ? 'heart' : 'heart-outline'} size={27} color={likeState.liked ? '#ED4956' : Colors.ink} />
          </Pressable>
        </Animated.View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Style it with my closet"
          hitSlop={8}
          onPress={() => {
            setSession({ pendingPrompt: post.prompt });
            router.navigate('/');
          }}>
          <Ionicons name="sparkles-outline" size={25} color={Colors.ink} />
        </Pressable>
        <Ionicons name="paper-plane-outline" size={25} color={Colors.ink} />
        <View style={styles.dots}>
          {post.pieces.length > 1
            ? post.pieces.map((_, i) => <View key={i} style={[styles.dot, i === index && styles.dotOn]} />)
            : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={owned ? 'In closet' : 'Add to closet'}
          hitSlop={8}
          disabled={!piece?.productId || owned}
          onPress={() => piece && onAdd(piece)}
          testID="feed-add">
          <Ionicons name={owned ? 'bookmark' : 'bookmark-outline'} size={25} color={Colors.ink} />
        </Pressable>
      </View>

      <View style={styles.meta}>
        <Text style={styles.likes}>{likeState.likes.toLocaleString()} likes</Text>
        <Text style={styles.caption}>
          <Text style={styles.brand}>{handle(post.brandName)} </Text>
          {post.caption}. {post.pieces.map((p) => p.name).join(' · ')}
        </Text>
        {piece?.summary ? <Text style={styles.summary} numberOfLines={2}>{piece.summary}</Text> : null}
        <Text style={styles.hint}>{owned ? piece?.name + ' is in your closet' : 'Tap the bookmark to add ' + (piece?.name ?? 'this piece') + ' to your closet'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  logo: { fontFamily: Fonts.serif, fontSize: 26, color: Colors.ink },
  loading: { marginTop: 48 },
  stories: { paddingHorizontal: Spacing.three, gap: Spacing.three, paddingVertical: Spacing.two },
  story: { alignItems: 'center', width: 72, gap: 4 },
  storyRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 2.5, borderColor: '#D62976', alignItems: 'center', justifyContent: 'center' },
  storyAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  storyLetter: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  storyName: { fontSize: 11, color: Colors.ink },
  badge: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  post: { paddingBottom: Spacing.four },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  headerRing: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#D62976', alignItems: 'center', justifyContent: 'center' },
  headerAvatar: { width: 31, height: 31, borderRadius: 16, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  headerLetter: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  grow: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  brand: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  sponsored: { fontSize: 12, color: Colors.muted },
  swatch: { alignItems: 'center', justifyContent: 'center' },
  swatchLabel: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 1 },
  burst: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  counterText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  tag: { position: 'absolute', left: 12, bottom: 12, maxWidth: '80%', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  tagText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  dots: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4, marginLeft: -60 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C7C7C7' },
  dotOn: { backgroundColor: '#3897F0' },
  meta: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: 4 },
  likes: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  caption: { fontSize: 14, lineHeight: 19, color: Colors.ink },
  summary: { fontSize: 13, lineHeight: 18, color: Colors.muted },
  hint: { fontSize: 12, color: Colors.muted },
});
