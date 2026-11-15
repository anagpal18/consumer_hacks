import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CATEGORY_LABEL, Choice, GarmentThumb, MockBadge, Pill } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { api } from '@/data/api';
import { emptyScanDraft, setSession, useSession, type ScanDraft } from '@/state/session';
import type { GarmentCategory, ScanCandidate, ScanCandidateEdit, ScanJob } from '@shared/contract';

const CATEGORIES: GarmentCategory[] = ['top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory', 'socks', 'underwear'];
const COLORS = ['black', 'white', 'grey', 'navy', 'indigo', 'khaki', 'brown', 'green', 'red'];

export default function ScanReviewScreen() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const insets = useSafeAreaInsets();
  const { scanDrafts } = useSession();
  const [job, setJob] = useState<ScanJob | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.scans.get({ scanId }).then((next) => {
      if (live) setJob(next);
    });
    return () => {
      live = false;
    };
  }, [scanId]);

  const draft = scanDrafts[scanId] ?? emptyScanDraft;
  const update = (patch: Partial<ScanDraft>) => setSession({ scanDrafts: { ...scanDrafts, [scanId]: { ...draft, ...patch } } });

  if (!job) return <View style={styles.center}><Text style={styles.muted}>Loading detected pieces…</Text></View>;
  if (job.status !== 'review') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{job.status === 'confirmed' ? 'Already in your closet' : 'Nothing to review yet'}</Text>
        <Text style={styles.muted}>{job.error ?? 'Start a new scan to add more pieces.'}</Text>
        <Button label="Scan again" onPress={() => router.replace('/scan')} />
      </View>
    );
  }

  const describe = (candidate: ScanCandidate) => {
    const category = draft.category[candidate.candidateId];
    const color = draft.color[candidate.candidateId] ?? candidate.color;
    return `${color} ${category ? CATEGORY_LABEL[category].toLowerCase() : (candidate.subtype ?? CATEGORY_LABEL[candidate.category].toLowerCase())}`;
  };
  const isMerged = (candidate: ScanCandidate) => !!draft.mergedInto[candidate.candidateId];
  const isSelected = (candidate: ScanCandidate) => !draft.rejected[candidate.candidateId] && !isMerged(candidate);
  const needsLook = (candidate: ScanCandidate) =>
    candidate.uncertain && !draft.keptBoth[candidate.candidateId] && !isMerged(candidate) && !draft.rejected[candidate.candidateId];
  const selected = job.candidates.filter(isSelected);
  const open = job.candidates.filter(needsLook).length;

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const edits: ScanCandidateEdit[] = job!.candidates
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          category: draft.category[candidate.candidateId],
          color: draft.color[candidate.candidateId],
          mergeInto: draft.mergedInto[candidate.candidateId],
        }))
        .filter((edit) => edit.category || edit.color || edit.mergeInto);
      const result = await api.scans.confirm({ scanId, acceptedCandidateIds: selected.map((candidate) => candidate.candidateId), edits });
      const count = result.itemIds.length;
      setSession({
        activeScanId: null,
        scanDrafts: { ...scanDrafts, [scanId]: undefined as never },
        homeNotice: `${count} ${count === 1 ? 'piece' : 'pieces'} added to your closet. Here is a look to start with.`,
      });
      router.dismissAll();
      router.navigate('/');
    } catch {
      setError('Could not add these pieces. Tap again; nothing will be added twice.');
      setSaving(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.summary}>
          <Text style={styles.title}>{job.candidates.length} pieces found</Text>
          <Text style={styles.muted}>
            {selected.length} selected{open > 0 ? ` · ${open} need a look` : ''}. Only selected pieces are added.
          </Text>
          {api.usingMockData ? <MockBadge label="Sample detections, color swatches stand in for crops" /> : null}
        </View>

        {job.candidates.map((candidate) => {
          const id = candidate.candidateId;
          const merged = isMerged(candidate);
          const rejected = !!draft.rejected[id];
          const editedCategory = draft.category[id];
          const editedColor = draft.color[id];
          const duplicateOf = job.candidates.find((other) => other.candidateId === candidate.possibleDuplicateOf);
          return (
            <View key={id} style={[styles.card, needsLook(candidate) && styles.cardUncertain, (merged || rejected) && styles.cardOff]} testID={`candidate-${id}`}>
              <View style={styles.cardRow}>
                <GarmentThumb media={candidate.crop} colorHex={editedColor ? undefined : candidate.colorHex} category={editedCategory ?? candidate.category} size={84} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{describe(candidate)}</Text>
                  <View style={styles.pills}>
                    <Pill label={CATEGORY_LABEL[editedCategory ?? candidate.category]} />
                    {['socks', 'underwear'].includes(editedCategory ?? candidate.category) ? <Pill label="Private" icon="eye-off-outline" /> : null}
                    {merged ? <Pill label={`Merged into ${duplicateOf ? describe(duplicateOf) : 'another piece'}`} tone="accent" /> : null}
                    {rejected ? <Pill label="Not added" /> : null}
                  </View>
                  {editedCategory && editedCategory !== candidate.category ? (
                    <Text style={styles.changed}>Changed: {CATEGORY_LABEL[candidate.category]} → {CATEGORY_LABEL[editedCategory]}</Text>
                  ) : null}
                  {editedColor && editedColor !== candidate.color ? (
                    <Text style={styles.changed}>Changed: {candidate.color} → {editedColor}</Text>
                  ) : null}
                </View>
                {!merged ? (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !rejected }}
                    accessibilityLabel={`Add ${describe(candidate)}`}
                    hitSlop={8}
                    onPress={() => update({ rejected: { ...draft.rejected, [id]: !rejected } })}>
                    <Ionicons name={rejected ? 'ellipse-outline' : 'checkmark-circle'} size={30} color={rejected ? Colors.muted : Colors.success} />
                  </Pressable>
                ) : null}
              </View>

              {needsLook(candidate) ? (
                <View style={styles.uncertain}>
                  <Ionicons name="help-circle-outline" size={18} color={Colors.worn} />
                  <Text style={styles.uncertainText}>{candidate.uncertainReason ?? 'Not sure about this one.'}</Text>
                </View>
              ) : null}

              <View style={styles.cardActions}>
                {merged ? (
                  <Button label="Undo merge" compact variant="secondary" onPress={() => update({ mergedInto: { ...draft.mergedInto, [id]: undefined as never } })} />
                ) : (
                  <>
                    {needsLook(candidate) && duplicateOf ? (
                      <Button label="Merge" compact variant="secondary" icon="git-merge-outline" testID={`merge-${id}`} onPress={() => update({ mergedInto: { ...draft.mergedInto, [id]: duplicateOf.candidateId } })} />
                    ) : null}
                    {needsLook(candidate) ? (
                      <Button label={duplicateOf ? 'Keep both' : 'Keep'} compact variant="secondary" testID={`keep-${id}`} onPress={() => update({ keptBoth: { ...draft.keptBoth, [id]: true } })} />
                    ) : null}
                    {needsLook(candidate) && !duplicateOf ? (
                      <Button label="Reject" compact variant="secondary" onPress={() => update({ rejected: { ...draft.rejected, [id]: true } })} />
                    ) : null}
                    <Button label={editingId === id ? 'Done' : 'Edit tags'} compact variant="ghost" onPress={() => setEditingId(editingId === id ? null : id)} />
                  </>
                )}
              </View>

              {editingId === id && !merged ? (
                <View style={styles.editor}>
                  <Text style={styles.editorLabel}>Type</Text>
                  <View style={styles.choices}>
                    {CATEGORIES.map((category) => (
                      <Choice key={category} label={CATEGORY_LABEL[category]} selected={(editedCategory ?? candidate.category) === category} onPress={() => update({ category: { ...draft.category, [id]: category } })} />
                    ))}
                  </View>
                  <Text style={styles.editorLabel}>Color</Text>
                  <View style={styles.choices}>
                    {COLORS.map((color) => (
                      <Choice key={color} label={color} selected={(editedColor ?? candidate.color) === color} onPress={() => update({ color: { ...draft.color, [id]: color } })} />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={saving ? 'Adding…' : `Add ${selected.length} to closet`}
          icon="checkmark"
          testID="add-to-closet"
          disabled={saving || selected.length === 0}
          onPress={confirm}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.six, backgroundColor: Colors.background },
  list: { padding: Spacing.four, gap: Spacing.three },
  summary: { gap: Spacing.one, marginBottom: Spacing.one },
  title: { fontFamily: Fonts.serif, fontSize: 26, color: Colors.ink },
  muted: { fontSize: 14, lineHeight: 20, color: Colors.muted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Spacing.three, gap: Spacing.two },
  cardUncertain: { borderColor: Colors.worn, borderWidth: 1.5 },
  cardOff: { opacity: 0.6 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  cardBody: { flex: 1, gap: Spacing.one },
  cardTitle: { fontSize: 16, fontWeight: '600', color: Colors.ink, textTransform: 'capitalize' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  changed: { fontSize: 12, fontWeight: '600', color: Colors.accent },
  uncertain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, backgroundColor: Colors.wornSoft, borderRadius: Radius.sm, padding: Spacing.two },
  uncertainText: { flex: 1, fontSize: 13, color: Colors.ink },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  editor: { gap: Spacing.two, borderTopWidth: 1, borderTopColor: Colors.line, paddingTop: Spacing.two },
  editorLabel: { fontSize: 12, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  footer: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, gap: Spacing.two, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.line },
  error: { fontSize: 13, color: Colors.danger },
});
