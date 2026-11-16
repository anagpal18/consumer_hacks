import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MockBadge, type IconName } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
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

type LikeState = { liked: boolean; likes: number };

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
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
    if (owned[piece.productId] || piece.inCloset) return;
    setOwned((map) => ({ ...map, [piece.productId]: true }));
    if (!serverActions) return;
    addToCloset(piece.productId).catch((error) => {
      console.warn('add to closet failed', error);
      setOwned((map) => ({ ...map, [piece.productId]: false }));
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Feed</Text>
        <MockBadge label="Sample feed · illustrative product images" />
      </View>
      <View style={styles.pager} onLayout={(event) => setHeight(Math.floor(event.nativeEvent.layout.height))}>
        {posts === null || height === 0 ? (
          <ActivityIndicator style={styles.loading} color={Colors.muted} />
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(post) => post.postId}
            pagingEnabled
            snapToInterval={height}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
            windowSize={3}
            initialNumToRender={2}
            onEndReachedThreshold={2}
            onEndReached={reels?.loadMore}
            testID="feed-pager"
            renderItem={({ item }) => (
              <ReelPage
                post={item}
                height={height}
                likeState={likes[item.postId] ?? { liked: item.likedByMe, likes: item.likes }}
                isOwned={(piece) => piece.inCloset || !!owned[piece.productId]}
                canAdd={(piece) => piece.productId !== ''}
                onLike={(onlyLike) => like(item, onlyLike)}
                onAdd={add}
              />
            )}
          />
        )}
      </View>
    </View>
  );
}

type ReelPageProps = {
  post: Reel;
  height: number;
  likeState: LikeState;
  isOwned: (piece: Piece) => boolean;
  canAdd: (piece: Piece) => boolean;
  onLike: (onlyLike: boolean) => void;
  onAdd: (piece: Piece) => void;
};

function ReelPage({ post, height, likeState, isOwned, canAdd, onLike, onAdd }: ReelPageProps) {
  const [selected, setSelected] = useState(0);
  const lastTap = useRef(0);
  const burst = useSharedValue(0);
  const pop = useSharedValue(1);
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.get(), transform: [{ scale: 0.5 + burst.get() * 0.7 }] }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const piece = post.pieces[selected] ?? post.pieces[0];
  const owned = piece ? isOwned(piece) : false;

  const animateLike = () => {
    pop.set(withSequence(withTiming(1.3, { duration: 110 }), withSpring(1)));
  };

  const onHeroPress = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      burst.set(withSequence(withTiming(1, { duration: 140 }), withDelay(420, withTiming(0, { duration: 220 }))));
      animateLike();
      onLike(true);
      return;
    }
    lastTap.current = now;
  };

  return (
    <View style={[styles.page, { height }]} testID="feed-post">
      <Pressable style={styles.hero} onPress={onHeroPress} accessibilityLabel="Double tap to like" testID="feed-hero">
        {piece?.imageUrl ? (
          <Image source={{ uri: piece.imageUrl }} style={styles.heroImage} contentFit="contain" transition={150} />
        ) : (
          <View style={[styles.heroImage, styles.swatch, { backgroundColor: piece?.colorHex ?? Colors.mirror }]}>
            <Text style={styles.swatchLabel}>SAMPLE ITEM</Text>
          </View>
        )}
        <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
          <Ionicons name="heart" size={110} color="#FFFFFF" style={styles.burstIcon} />
        </Animated.View>
        <View style={styles.actions}>
          <Animated.View style={popStyle}>
            <Action
              icon={likeState.liked ? 'heart' : 'heart-outline'}
              color={likeState.liked ? Colors.accent : Colors.ink}
              label={String(likeState.likes)}
              accessibilityLabel={likeState.liked ? 'Unlike' : 'Like'}
              onPress={() => {
                animateLike();
                onLike(false);
              }}
            />
          </Animated.View>
          {piece && canAdd(piece) ? (
            <Action
              icon={owned ? 'checkmark-circle' : 'add-circle-outline'}
              color={owned ? Colors.success : Colors.ink}
              label={owned ? 'In closet' : 'Add to closet'}
              accessibilityLabel={owned ? piece.name + ' is in your closet' : 'Add ' + piece.name + ' to closet'}
              onPress={() => onAdd(piece)}
            />
          ) : null}
          <Action
            icon="sparkles-outline"
            color={Colors.ink}
            label="Style it"
            accessibilityLabel="Style it with my closet"
            onPress={() => {
              setSession({ pendingPrompt: post.prompt });
              router.navigate('/');
            }}
          />
        </View>
      </Pressable>

      <View style={styles.info}>
        <Text style={styles.brand}>{post.brandName}</Text>
        <Text style={styles.caption} numberOfLines={2}>{post.caption}</Text>
        {post.pieces.length > 1 ? (
          <View style={styles.thumbs}>
            {post.pieces.map((p, index) => (
              <Pressable
                key={p.productId + index}
                accessibilityRole="button"
                accessibilityLabel={'Show ' + p.name}
                accessibilityState={{ selected: index === selected }}
                onPress={() => setSelected(index)}
                style={[styles.thumb, index === selected && styles.thumbSelected]}>
                {p.imageUrl ? (
                  <Image source={{ uri: p.imageUrl }} style={styles.thumbImage} contentFit="cover" />
                ) : (
                  <View style={[styles.thumbImage, { backgroundColor: p.colorHex ?? Colors.mirror }]} />
                )}
              </Pressable>
            ))}
          </View>
        ) : null}
        {piece ? (
          <View style={styles.piece}>
            <View style={styles.pieceRow}>
              <Text style={styles.pieceName} numberOfLines={1}>{piece.name}</Text>
              {piece.priceCents > 0 ? <Text style={styles.price}>{money(piece.priceCents)}</Text> : null}
            </View>
            {piece.summary ? <Text style={styles.summary} numberOfLines={3}>{piece.summary}</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Action({ icon, color, label, accessibilityLabel, onPress }: { icon: IconName; color: string; label: string; accessibilityLabel: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={6} onPress={onPress} style={styles.action}>
      <View style={styles.actionCircle}>
        <Ionicons name={icon} size={26} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  title: { fontFamily: Fonts.serif, fontSize: 22, color: Colors.ink },
  pager: { flex: 1 },
  loading: { flex: 1 },
  page: { backgroundColor: Colors.background },
  hero: { flex: 1, backgroundColor: Colors.surface, marginHorizontal: Spacing.two, borderRadius: Radius.lg, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  swatch: { alignItems: 'center', justifyContent: 'center' },
  swatchLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4 },
  burst: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  burstIcon: { textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 12 },
  actions: { position: 'absolute', right: Spacing.three, bottom: Spacing.four, gap: Spacing.four, alignItems: 'center' },
  action: { alignItems: 'center', gap: 2, maxWidth: 76 },
  actionCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(251,248,243,0.92)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.line },
  actionLabel: { fontSize: 11, fontWeight: '600', color: Colors.ink, textAlign: 'center', backgroundColor: 'rgba(251,248,243,0.85)', borderRadius: 6, paddingHorizontal: 4, overflow: 'hidden' },
  info: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two },
  brand: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, color: Colors.inkSoft, textTransform: 'uppercase' },
  caption: { fontFamily: Fonts.serif, fontSize: 20, color: Colors.ink },
  thumbs: { flexDirection: 'row', gap: Spacing.two },
  thumb: { width: 54, height: 54, borderRadius: Radius.sm, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  thumbSelected: { borderColor: Colors.accent },
  thumbImage: { width: '100%', height: '100%', backgroundColor: Colors.surfaceSunken },
  piece: { gap: 2 },
  pieceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  pieceName: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.ink },
  price: { fontSize: 15, fontWeight: '600', color: Colors.inkSoft },
  summary: { fontSize: 13, lineHeight: 18, color: Colors.muted },
});
