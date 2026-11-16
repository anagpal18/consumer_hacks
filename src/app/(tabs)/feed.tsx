import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MockBadge, type IconName } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { addToCloset, toggleLike, useReels, useWhopConfig, type Piece, type Reel } from '@/data/catalog';
import { IS_FIXTURE_MODE } from '@/data/mode';
import { useWhopCheckout } from '@/lib/whop';
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
const handle = (brand: string) => brand.toLowerCase().replace(/[^a-z0-9]+/g, '');
const count = (n: number) => (n >= 10_000 ? Math.round(n / 1000) + 'K' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n));
const DOUBLE_TAP_MS = 280;
const WHITE = '#FFFFFF';
const LIKE_RED = '#ED4956';

type LikeState = { liked: boolean; likes: number };
type Checkout = ReturnType<typeof useWhopCheckout>;

/** Feed: Instagram Reels-style vertical pager, one brand look per screen. Tagged pieces open a Whop checkout. */
export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [active, setActive] = useState(0);
  const [likes, setLikes] = useState<Record<string, LikeState>>({});
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  const reels = useReels(10);
  const config = useWhopConfig();
  const checkout = useWhopCheckout();
  const posts = IS_FIXTURE_MODE ? SAMPLE_REELS : (reels?.posts ?? null);
  const serverActions = !IS_FIXTURE_MODE && reels?.source === 'reels';
  const sandbox = config?.sandbox !== false;

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

  return (
    <View style={styles.root} onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })} testID="feed-reels">
      {focused ? <StatusBar style="light" /> : null}
      {posts === null || !size.height ? (
        <ActivityIndicator style={styles.loading} color={WHITE} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(post) => post.postId}
          pagingEnabled
          snapToInterval={size.height}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: size.height, offset: size.height * index, index })}
          initialNumToRender={2}
          maxToRenderPerBatch={3}
          windowSize={5}
          onEndReachedThreshold={2}
          onEndReached={reels?.loadMore}
          scrollEventThrottle={64}
          onScroll={(event) => setActive(Math.round(event.nativeEvent.contentOffset.y / size.height))}
          testID="feed-list"
          renderItem={({ item, index }) => (
            <ReelPage
              post={item}
              width={size.width}
              height={size.height}
              topInset={insets.top}
              isActive={index === active}
              likeState={likes[item.postId] ?? { liked: item.likedByMe, likes: item.likes }}
              isOwned={(piece) => piece.inCloset || !!owned[piece.productId]}
              onLike={(onlyLike) => like(item, onlyLike)}
              onAdd={add}
              checkout={checkout}
              sandbox={sandbox}
            />
          )}
        />
      )}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="none">
          <Text style={styles.title}>Reels</Text>
          <Ionicons name="camera-outline" size={26} color={WHITE} />
        </View>
        <View style={styles.badge} pointerEvents="none">
          <MockBadge label="Sample brand posts · illustrative product images" />
        </View>
      </View>
    </View>
  );
}

type ReelProps = {
  post: Reel;
  width: number;
  height: number;
  topInset: number;
  isActive: boolean;
  likeState: LikeState;
  isOwned: (piece: Piece) => boolean;
  onLike: (onlyLike: boolean) => void;
  onAdd: (piece: Piece) => void;
  checkout: Checkout;
  sandbox: boolean;
};

function ReelPage({ post, width, height, topInset, isActive, likeState, isOwned, onLike, onAdd, checkout, sandbox }: ReelProps) {
  const [index, setIndex] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [following, setFollowing] = useState(false);
  const lastTap = useRef(0);
  const burst = useSharedValue(0);
  const pop = useSharedValue(1);
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.get(), transform: [{ scale: 0.5 + burst.get() * 0.7 }] }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const piece = post.pieces[index] ?? post.pieces[0];
  const owned = piece ? isOwned(piece) : false;
  const sheetOpen = sheet && isActive;

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

  const share = () => {
    Share.share({ message: handle(post.brandName) + ' on Wear Again: ' + post.caption + '. ' + post.pieces.map((p) => p.name).join(', ') }).catch(() => undefined);
  };

  const styleIt = () => {
    setSession({ pendingPrompt: post.prompt });
    router.navigate('/');
  };

  return (
    <View style={[styles.page, { width, height }]} testID="feed-post">
      <FlatList
        horizontal
        pagingEnabled
        data={post.pieces}
        keyExtractor={(p, i) => p.productId || String(i)}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        scrollEventThrottle={64}
        onScroll={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
        renderItem={({ item: p }) => (
          <Pressable onPress={tap} accessibilityLabel="Double tap to like" testID="feed-hero">
            {p.imageUrl ? (
              <Image source={{ uri: p.imageUrl }} style={{ width, height }} contentFit="cover" transition={150} />
            ) : (
              <View style={[{ width, height }, styles.swatch, { backgroundColor: p.colorHex ?? Colors.mirror }]}>
                <Text style={styles.swatchLabel}>SAMPLE ITEM</Text>
              </View>
            )}
          </Pressable>
        )}
      />
      <View style={styles.shadeTop} pointerEvents="none" />
      <View style={styles.shadeBottom} pointerEvents="none" />
      <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
        <Ionicons name="heart" size={110} color={WHITE} />
      </Animated.View>

      {post.pieces.length > 1 ? (
        <View style={[styles.segments, { top: topInset + 84 }]} pointerEvents="none">
          {post.pieces.map((_, i) => (
            <View key={i} style={[styles.segment, i === index && styles.segmentOn]} />
          ))}
        </View>
      ) : null}

      <View style={styles.rail}>
        <Animated.View style={popStyle}>
          <RailButton icon={likeState.liked ? 'heart' : 'heart-outline'} color={likeState.liked ? LIKE_RED : WHITE} label={count(likeState.likes)} a11y={likeState.liked ? 'Unlike' : 'Like'} onPress={() => onLike(false)} testID="reel-like" />
        </Animated.View>
        <RailButton icon="chatbubble-outline" label="Ask" a11y="Ask the stylist how to wear this with my closet" onPress={styleIt} testID="reel-comment" />
        <RailButton icon="paper-plane-outline" label="Share" a11y="Share" onPress={share} />
        <RailButton icon={owned ? 'bookmark' : 'bookmark-outline'} label={owned ? 'In closet' : 'Closet'} a11y={owned ? 'In closet' : 'Add to closet'} disabled={!piece?.productId || owned} onPress={() => piece && onAdd(piece)} testID="feed-add" />
        <RailButton icon="bag-handle-outline" label="Shop" a11y="Shop this look with Whop" onPress={() => setSheet(true)} testID="reel-shop" badge={post.pieces.length} />
      </View>

      <View style={styles.info}>
        <View style={styles.authorRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{post.brandName[0]}</Text>
          </View>
          <Text style={styles.author}>{handle(post.brandName)}</Text>
          <Ionicons name="checkmark-circle" size={14} color="#3897F0" />
          <Pressable accessibilityRole="button" onPress={() => setFollowing(!following)} style={styles.follow} hitSlop={6}>
            <Text style={styles.followText}>{following ? 'Following' : 'Follow'}</Text>
          </Pressable>
        </View>
        <Text style={styles.caption} numberOfLines={2}>
          {post.caption}. {post.pieces.map((p) => p.name).join(' · ')}
        </Text>
        <Text style={styles.sampleLine}>Sample brand post</Text>
        {piece ? (
          <Pressable accessibilityRole="button" accessibilityLabel={'Shop ' + piece.name} onPress={() => setSheet(true)} style={styles.tagChip} testID="reel-tag">
            <Ionicons name="bag-handle" size={14} color={WHITE} />
            <Text style={styles.tagText} numberOfLines={1}>
              {piece.name}
              {piece.priceCents ? ' · ' + money(piece.priceCents) : ''}
            </Text>
            {post.pieces.length > 1 ? <Text style={styles.tagMore}>+{post.pieces.length - 1}</Text> : null}
            <Ionicons name="chevron-forward" size={14} color={WHITE} />
          </Pressable>
        ) : null}
      </View>

      {sheetOpen ? (
        <ProductSheet post={post} height={height} isOwned={isOwned} onAdd={onAdd} checkout={checkout} sandbox={sandbox} onClose={() => setSheet(false)} />
      ) : null}
    </View>
  );
}

function RailButton({ icon, label, a11y, onPress, color = WHITE, disabled, testID, badge }: { icon: IconName; label: string; a11y: string; onPress: () => void; color?: string; disabled?: boolean; testID?: string; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6} disabled={disabled} onPress={onPress} style={styles.railButton} testID={testID}>
      <View>
        <Ionicons name={icon} size={30} color={color} style={styles.iconShadow} />
        {badge ? (
          <View style={styles.railBadge}>
            <Text style={styles.railBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.railLabel}>{label}</Text>
    </Pressable>
  );
}

type SheetProps = { post: Reel; height: number; isOwned: (piece: Piece) => boolean; onAdd: (piece: Piece) => void; checkout: Checkout; sandbox: boolean; onClose: () => void };

function ProductSheet({ post, height, isOwned, onAdd, checkout, sandbox, onClose }: SheetProps) {
  return (
    <View style={StyleSheet.absoluteFill} testID="reel-sheet">
      <Pressable style={styles.backdrop} accessibilityLabel="Close products" onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: Math.round(height * 0.62) }]}>
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <View style={styles.grow}>
            <Text style={styles.sheetTitle}>Shop this look</Text>
            <Text style={styles.sheetSub}>
              {post.pieces.length} {post.pieces.length === 1 ? 'piece' : 'pieces'} from {post.brandName}
              {sandbox ? ' · Whop test checkout, no real charge' : ' · checkout with Whop'}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetList}>
          {post.pieces.map((p, i) => {
            const pending = checkout.isPending(p.productId);
            const error = checkout.errorFor(p.productId);
            const inCloset = isOwned(p);
            return (
              <View key={p.productId || i} style={styles.row} testID="reel-product">
                {p.imageUrl ? (
                  <Image source={{ uri: p.imageUrl }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: p.colorHex ?? Colors.mirror }]} />
                )}
                <View style={styles.rowBody}>
                  <Text style={styles.rowName} numberOfLines={2}>{p.name}</Text>
                  <Text style={styles.rowMeta}>
                    {p.brandName}
                    {p.priceCents ? ' · ' + money(p.priceCents) : ''}
                  </Text>
                  <View style={styles.rowActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={'Buy ' + p.name + ' with Whop'}
                      accessibilityState={{ busy: pending, disabled: checkout.busy }}
                      disabled={checkout.busy}
                      onPress={() => checkout.buy(p.productId)}
                      style={({ pressed }) => [styles.buy, (pressed || pending) && styles.pressed, checkout.busy && !pending && styles.idle]}
                      testID="reel-buy">
                      {pending ? <ActivityIndicator size="small" color={WHITE} /> : <Ionicons name="bag-handle" size={14} color={WHITE} />}
                      <Text style={styles.buyText}>{pending ? 'Opening Whop…' : 'Buy with Whop'}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={inCloset ? 'In closet' : 'Add ' + p.name + ' to closet'}
                      disabled={inCloset || !p.productId}
                      onPress={() => onAdd(p)}
                      style={styles.closetButton}
                      hitSlop={6}>
                      <Ionicons name={inCloset ? 'bookmark' : 'bookmark-outline'} size={20} color={Colors.ink} />
                    </Pressable>
                  </View>
                  {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  loading: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: Spacing.four, gap: Spacing.two },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700', color: WHITE, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6 },
  badge: { alignSelf: 'flex-start' },
  page: { backgroundColor: '#111111', overflow: 'hidden' },
  swatch: { alignItems: 'center', justifyContent: 'center' },
  swatchLabel: { color: WHITE, fontWeight: '700', letterSpacing: 1 },
  shadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 140, backgroundColor: 'rgba(0,0,0,0.22)' },
  shadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 230, backgroundColor: 'rgba(0,0,0,0.35)' },
  burst: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  segments: { position: 'absolute', left: Spacing.four, right: Spacing.four, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  segmentOn: { backgroundColor: WHITE },
  rail: { position: 'absolute', right: Spacing.two, bottom: Spacing.five, alignItems: 'center', gap: Spacing.four },
  railButton: { alignItems: 'center', gap: 3, minWidth: 54 },
  iconShadow: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6 },
  railLabel: { color: WHITE, fontSize: 12, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  railBadge: { position: 'absolute', top: -4, right: -8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  railBadgeText: { color: WHITE, fontSize: 11, fontWeight: '700' },
  info: { position: 'absolute', left: Spacing.four, right: 84, bottom: Spacing.five, gap: Spacing.two },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.ink, borderWidth: 1.5, borderColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: WHITE, fontSize: 14, fontWeight: '700' },
  author: { color: WHITE, fontSize: 15, fontWeight: '700' },
  follow: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginLeft: 2 },
  followText: { color: WHITE, fontSize: 13, fontWeight: '600' },
  caption: { color: WHITE, fontSize: 14, lineHeight: 19, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  sampleLine: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  tagChip: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  tagText: { flexShrink: 1, color: WHITE, fontSize: 13, fontWeight: '600' },
  tagMore: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: Spacing.three },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.line, marginTop: Spacing.two },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  grow: { flex: 1 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  sheetSub: { fontSize: 12, lineHeight: 16, color: Colors.muted, marginTop: 2 },
  sheetList: { paddingHorizontal: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.three },
  thumb: { width: 64, height: 80, borderRadius: 10, backgroundColor: Colors.surfaceSunken },
  rowBody: { flex: 1, gap: 3 },
  rowName: { fontSize: 14, fontWeight: '600', color: Colors.ink },
  rowMeta: { fontSize: 13, color: Colors.muted },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: 4 },
  buy: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Colors.ink },
  pressed: { opacity: 0.8 },
  idle: { opacity: 0.45 },
  buyText: { color: WHITE, fontSize: 13, fontWeight: '700' },
  closetButton: { padding: 4 },
  error: { fontSize: 12, lineHeight: 16, color: Colors.danger },
});
