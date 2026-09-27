import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { Card, EmptyState, Notice } from '../../theme/components';
import { radius, spacing, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';

type PublicGroup = {
  conversationId: string;
  title: string;
  category: string | null;
  memberCount: number;
};

type CategoryDef = { value: string; label: string; icon: string };

/** Same category keys as scripts/seed-public-groups.mjs — label + icon are
 * purely presentational, the server only ever sees the `value`. */
const CATEGORIES: CategoryDef[] = [
  { value: 'musique', label: 'Musique', icon: '🎵' },
  { value: 'sport', label: 'Sport', icon: '🏋️' },
  { value: 'boxe', label: 'Boxe', icon: '🥊' },
  { value: 'course_a_pied', label: 'Course à pied', icon: '🏃' },
  { value: 'danse', label: 'Danse', icon: '💃' },
  { value: 'dev', label: 'Dev', icon: '💻' },
  { value: 'gaming', label: 'Gaming', icon: '🎮' },
  { value: 'ia', label: 'IA', icon: '🤖' },
  { value: 'foot', label: 'Foot', icon: '⚽' },
  { value: 'basket', label: 'Basket', icon: '🏀' },
  { value: 'droit', label: 'Droit', icon: '⚖️' },
  { value: 'informatique', label: 'Informatique', icon: '🖥️' },
];
const CATEGORY_BY_VALUE = new Map(CATEGORIES.map((c) => [c.value, c]));

type ListResponse = { ok: boolean; groups?: PublicGroup[]; error?: string };
type JoinResponse = { ok: boolean; conversationId?: string; error?: string };

/**
 * "Pour Toi" style discovery feed of public groups, browsable by interest
 * category — "Rejoindre" joins instantly (no invite/approval needed), via
 * the same group_keys E2EE wrap-per-member flow as any other membership.
 */
export function DiscoverGroupsScreen({ onOpenGroup }: { onOpenGroup?: (groupId: string) => void } = {}) {
  const { styles, colors } = useThemedStyles();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [userId, setUserId] = useState('');
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(isRealtimeConfigured);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');

  const load = async (client: Socket, refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const response = await emitAck<ListResponse>(client, 'groups:public-list', {});
      if (!response.ok) throw new Error(response.error ?? 'PUBLIC_GROUPS_FAILED');
      setGroups(response.groups ?? []);
      setNotice('');
    } catch {
      setNotice('Impossible de charger les groupes publics pour le moment.');
    } finally {
      if (refresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isRealtimeConfigured) {
      setLoading(false);
      setNotice('Serveur temps réel K-ssenger indisponible pour ce build.');
      return;
    }
    let active = true;
    void Promise.all([getRealtimeSocket(), getAuthenticatedUserId()]).then(async ([client, id]) => {
      if (!active) return;
      setSocket(client);
      setUserId(id);
      await load(client);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(
    () => (selectedCategory ? groups.filter((g) => g.category === selectedCategory) : groups),
    [groups, selectedCategory],
  );

  const join = async (group: PublicGroup) => {
    if (!socket || joiningId) return;
    setJoiningId(group.conversationId);
    try {
      const response = await emitAck<JoinResponse>(socket, 'group:join-public', { conversationId: group.conversationId });
      if (!response.ok) {
        setNotice(
          response.error === 'GROUP_MEMBER_ALREADY_PRESENT'
            ? 'Tu es déjà dans ce groupe.'
            : 'Impossible de rejoindre ce groupe pour le moment.',
        );
        return;
      }
      setJoinedIds((prev) => new Set(prev).add(group.conversationId));
      setNotice(`Tu as rejoint « ${group.title} ».`);
      onOpenGroup?.(group.conversationId);
    } finally {
      setJoiningId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.azure} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={socket ? <RefreshControl refreshing={refreshing} onRefresh={() => void load(socket, true)} tintColor={colors.azure} /> : undefined}
    >
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Découvrir des groupes</Text>
        <Text style={styles.introSubtitle}>Rejoins un groupe public par centre d’intérêt — accès direct, pas d’invitation nécessaire.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        <TouchableOpacity
          testID="discover-category-all"
          accessibilityRole="button"
          onPress={() => setSelectedCategory(null)}
          style={[styles.chip, selectedCategory === null && styles.chipActive]}
        >
          <Text style={[styles.chipText, selectedCategory === null && styles.chipTextActive]}>Toutes</Text>
        </TouchableOpacity>
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.value;
          return (
            <TouchableOpacity
              key={cat.value}
              testID={`discover-category-${cat.value}`}
              accessibilityRole="button"
              onPress={() => setSelectedCategory(active ? null : cat.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.icon} {cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!!notice && <Notice>{notice}</Notice>}

      {filtered.length === 0 ? (
        <EmptyState icon="🧭" title="Aucun groupe public ici" hint="Reviens plus tard ou choisis une autre catégorie." />
      ) : (
        <View style={styles.grid}>
          {filtered.map((group) => {
            const def = group.category ? CATEGORY_BY_VALUE.get(group.category) : undefined;
            const alreadyJoined = joinedIds.has(group.conversationId);
            const busy = joiningId === group.conversationId;
            return (
              <Card key={group.conversationId} style={styles.groupCard}>
                <View style={styles.groupCardHead}>
                  <View style={styles.groupIconWrap}>
                    <Text style={styles.groupIcon}>{def?.icon ?? '💬'}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.groupTitle} numberOfLines={2}>{group.title}</Text>
                    <Text style={styles.groupMeta}>
                      {def?.label ?? group.category ?? 'Général'} · {group.memberCount} membre{group.memberCount > 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  testID={`discover-join-${group.conversationId}`}
                  accessibilityRole="button"
                  disabled={busy || alreadyJoined}
                  onPress={() => void join(group)}
                  style={[styles.joinBtn, (busy || alreadyJoined) && styles.joinBtnDisabled]}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={styles.joinBtnText}>{alreadyJoined ? 'Rejoint ✓' : 'Rejoindre'}</Text>
                  )}
                </TouchableOpacity>
              </Card>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function useThemedStyles() {
  const { colors, type: typo } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors, typo };
}

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky },
    content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, backgroundColor: palette.sky, minHeight: '100%' },
    intro: { marginBottom: spacing.md },
    introTitle: { fontSize: 22, fontWeight: '900', color: palette.ink },
    introSubtitle: { marginTop: 4, fontSize: 13, color: palette.inkFaint, lineHeight: 18 },
    chipsRow: { gap: spacing.sm, paddingVertical: spacing.sm, paddingRight: spacing.lg },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.hairline,
    },
    chipActive: { backgroundColor: palette.azureSoft, borderColor: palette.azure },
    chipText: { fontSize: 13, fontWeight: '700', color: palette.inkFaint },
    chipTextActive: { color: palette.azureDeep },
    grid: { marginTop: spacing.md, gap: spacing.md },
    groupCard: { gap: spacing.md },
    groupCardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    groupIconWrap: {
      width: 48, height: 48, borderRadius: radius.md, backgroundColor: palette.azureSoft,
      alignItems: 'center', justifyContent: 'center',
    },
    groupIcon: { fontSize: 22 },
    groupTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
    groupMeta: { marginTop: 2, fontSize: 12, color: palette.inkFaint, fontWeight: '600' },
    joinBtn: {
      alignSelf: 'flex-start', paddingHorizontal: spacing.lg, paddingVertical: 10,
      borderRadius: radius.pill, backgroundColor: palette.azure, minWidth: 110, alignItems: 'center',
    },
    joinBtnDisabled: { opacity: 0.55 },
    joinBtnText: { color: palette.white, fontWeight: '900', fontSize: 13 },
  });
}
