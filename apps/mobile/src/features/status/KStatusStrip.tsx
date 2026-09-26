import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  K_STATUS_MAX_CHARS,
  deleteStatus,
  fetchCurrentContactIds,
  listStatuses,
  openStatus,
  postStatus,
  unwrapAllStatusKeys,
  type VisibleKStatus,
} from '../../lib/kStatus';
import { getRealtimeSocketSync, isRealtimeConfigured } from '../../lib/realtime';
import { radius, spacing, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

type LatestByOwner = { ownerId: string; nickname: string; latest: VisibleKStatus };

function minutesUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
}

function expiryLabel(iso: string): string {
  const mins = minutesUntil(iso);
  if (mins <= 0) return 'expire bientôt';
  if (mins < 60) return `expire dans ${mins} min`;
  const hours = Math.round(mins / 60);
  return `expire dans ${hours}h`;
}

export function KStatusStrip({
  currentUserId,
  nicknameByUserId,
}: {
  currentUserId: string;
  nicknameByUserId: (userId: string) => string;
}) {
  const { styles, colors } = useThemedStyles();
  const [statuses, setStatuses] = useState<VisibleKStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = async () => {
    const list = await listStatuses();
    await unwrapAllStatusKeys(list, currentUserId);
    setStatuses(list);
    setLoading(false);
  };

  useEffect(() => {
    if (!currentUserId) return;
    void refresh();
    const socket = getRealtimeSocketSync();
    const onPosted = () => void refresh();
    const onDeleted = (payload: { statusId?: string }) => {
      setStatuses((prev) => prev.filter((s) => s.id !== payload.statusId));
    };
    socket?.on('status:posted', onPosted);
    socket?.on('status:deleted', onDeleted);
    // Re-render every minute so the countdown labels stay accurate and an
    // expired-but-not-yet-server-purged card disappears client-side too.
    const tick = setInterval(() => setRefreshTick((n) => n + 1), 60_000);
    return () => {
      socket?.off('status:posted', onPosted);
      socket?.off('status:deleted', onDeleted);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const visible = useMemo(() => statuses.filter((s) => minutesUntil(s.expiresAt) > 0 || true), [statuses, refreshTick]);

  const latestByOwner: LatestByOwner[] = useMemo(() => {
    const byOwner = new Map<string, VisibleKStatus>();
    for (const s of visible) {
      const existing = byOwner.get(s.ownerId);
      if (!existing || new Date(s.createdAt) > new Date(existing.createdAt)) byOwner.set(s.ownerId, s);
    }
    return Array.from(byOwner.entries())
      .map(([ownerId, latest]) => ({ ownerId, nickname: ownerId === currentUserId ? 'Toi' : nicknameByUserId(ownerId), latest }))
      .sort((a, b) => (a.ownerId === currentUserId ? -1 : b.ownerId === currentUserId ? 1 : new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime()));
  }, [visible, currentUserId, nicknameByUserId]);

  const myEntry = latestByOwner.find((e) => e.ownerId === currentUserId);
  const opened = openedId ? visible.find((s) => s.id === openedId) : null;

  const submitStatus = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      const contactIds = await fetchCurrentContactIds(currentUserId);
      const posted = await postStatus(currentUserId, draft, contactIds);
      if (posted) {
        setDraft('');
        setComposerOpen(false);
        await refresh();
      }
    } finally {
      setPosting(false);
    }
  };

  const removeMine = async (statusId: string) => {
    setOpenedId(null);
    await deleteStatus(statusId);
    setStatuses((prev) => prev.filter((s) => s.id !== statusId));
  };

  if (!isRealtimeConfigured) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>K-Statut</Text>
        <Text style={styles.subtitle}>Visible par tes contacts uniquement · expire en 24h</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <TouchableOpacity
          style={styles.bubble}
          onPress={() => (myEntry ? setOpenedId(myEntry.latest.id) : setComposerOpen(true))}
          onLongPress={() => setComposerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={myEntry ? 'Voir mon statut (appui long : en poser un nouveau)' : 'Poser mon statut'}
        >
          <View style={[styles.avatar, styles.avatarSelf]}>
            <Text style={styles.avatarText}>{myEntry ? '✓' : '+'}</Text>
          </View>
          <Text style={styles.bubbleLabel} numberOfLines={1}>{myEntry ? 'Mon statut' : 'Ton statut'}</Text>
        </TouchableOpacity>
        {loading && <ActivityIndicator style={styles.loader} color={colors.azure} />}
        {latestByOwner.filter((e) => e.ownerId !== currentUserId).map((entry) => (
          <TouchableOpacity key={entry.ownerId} style={styles.bubble} onPress={() => setOpenedId(entry.latest.id)} accessibilityRole="button" accessibilityLabel={`Statut de ${entry.nickname}`}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{entry.nickname[0]?.toUpperCase() ?? '?'}</Text></View>
            <Text style={styles.bubbleLabel} numberOfLines={1}>{entry.nickname}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {composerOpen && (
        <View style={styles.composerCard}>
          <Text style={styles.composerHint}>Visible par tes contacts uniquement · disparaît après 24h. Pas un fil public.</Text>
          <TextInput
            value={draft}
            onChangeText={(t) => setDraft(t.slice(0, K_STATUS_MAX_CHARS))}
            placeholder="Quoi de neuf ?"
            placeholderTextColor={colors.inkFaint}
            style={styles.composerInput}
            multiline
            maxLength={K_STATUS_MAX_CHARS}
          />
          <View style={styles.composerActions}>
            <Text style={styles.composerCount}>{draft.length}/{K_STATUS_MAX_CHARS}</Text>
            <TouchableOpacity onPress={() => { setComposerOpen(false); setDraft(''); }} style={styles.composerCancel}>
              <Text style={styles.composerCancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void submitStatus()} disabled={!draft.trim() || posting} style={[styles.composerSubmit, (!draft.trim() || posting) && styles.disabled]}>
              <Text style={styles.composerSubmitText}>{posting ? 'Publication…' : 'Publier'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {opened && (
        <View style={styles.viewerCard}>
          {(() => {
            const decoded = openStatus(opened, currentUserId);
            return (
              <>
                <Text style={styles.viewerName}>{opened.ownerId === currentUserId ? 'Toi' : nicknameByUserId(opened.ownerId)}</Text>
                <Text style={styles.viewerText}>{decoded.text ?? '🔒 Statut chiffré (clé indisponible sur cet appareil)'}</Text>
                <Text style={styles.viewerMeta}>{expiryLabel(opened.expiresAt)} · Visible par ses contacts uniquement</Text>
                <View style={styles.viewerActions}>
                  {opened.ownerId === currentUserId && (
                    <TouchableOpacity onPress={() => void removeMine(opened.id)} style={styles.viewerDelete}>
                      <Text style={styles.viewerDeleteText}>Supprimer</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setOpenedId(null)} style={styles.viewerClose}>
                    <Text style={styles.viewerCloseText}>Fermer</Text>
                  </TouchableOpacity>
                </View>
              </>
            );
          })()}
        </View>
      )}
    </View>
  );
}

function useThemedStyles() {
  const { colors, type: typo } = useTheme();
  return { styles: createStyles(colors, typo), colors };
}

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
    wrap: { marginBottom: spacing.md },
    headerRow: { marginBottom: spacing.xs },
    title: { ...typo.label, color: palette.inkSoft, textTransform: 'uppercase', fontSize: 11 },
    subtitle: { color: palette.inkFaint, fontSize: 10.5, marginTop: 1 },
    row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
    loader: { marginLeft: spacing.sm },
    bubble: { alignItems: 'center', width: 60 },
    avatar: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: palette.azureSoft, borderWidth: 2, borderColor: palette.azure, alignItems: 'center', justifyContent: 'center' },
    avatarSelf: { borderColor: palette.brass, backgroundColor: palette.pulseSoft },
    avatarText: { color: palette.azureDeep, fontSize: 18, fontWeight: '900' },
    bubbleLabel: { marginTop: 4, fontSize: 10.5, color: palette.inkSoft, fontWeight: '700', textAlign: 'center' },

    composerCard: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, gap: spacing.sm },
    composerHint: { color: palette.inkFaint, fontSize: 10.5, fontStyle: 'italic' },
    composerInput: { minHeight: 56, color: palette.ink, fontSize: 14, textAlignVertical: 'top' },
    composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
    composerCount: { color: palette.inkFaint, fontSize: 11, marginRight: 'auto' },
    composerCancel: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    composerCancelText: { color: palette.inkFaint, fontWeight: '800', fontSize: 12 },
    composerSubmit: { backgroundColor: palette.azure, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
    composerSubmitText: { color: palette.white, fontWeight: '900', fontSize: 12 },
    disabled: { opacity: 0.5 },

    viewerCard: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: palette.surfaceSunken, borderWidth: 1, borderColor: palette.hairline, gap: spacing.xs },
    viewerName: { ...typo.name },
    viewerText: { color: palette.ink, fontSize: 15, lineHeight: 21 },
    viewerMeta: { color: palette.inkFaint, fontSize: 10.5 },
    viewerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
    viewerDelete: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: palette.dangerSoft, borderWidth: 1, borderColor: palette.dangerBorder },
    viewerDeleteText: { color: palette.danger, fontWeight: '900', fontSize: 11.5 },
    viewerClose: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: palette.sky, borderWidth: 1, borderColor: palette.hairline },
    viewerCloseText: { color: palette.inkSoft, fontWeight: '900', fontSize: 11.5 },
  });
}
