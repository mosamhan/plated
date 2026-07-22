import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { showAlert } from '@/lib/dialog';
import { tapLight } from '@/lib/haptics';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** A saved item can be a restaurant, a plate (order), or a plato (reel). */
export type SavedItemType = 'restaurant' | 'plate' | 'plato';

export interface SavedItem {
  type: SavedItemType;
  id: string;
}

export interface Collection {
  id: string;
  name: string;
  items: SavedItem[];
}

interface CollectionsContextValue {
  collections: Collection[];
  loading: boolean;
  /** Every collection that contains this item (for the Save-to picker checkmarks). */
  collectionsWith: (item: SavedItem) => Collection[];
  /** True if the item is saved to at least one collection. */
  isSaved: (item: SavedItem) => boolean;
  /** Add/remove an item to/from a specific collection (optimistic, persisted). */
  toggleInCollection: (collectionId: string, item: SavedItem) => void;
  /** Create a new named list; optionally seed it with one item. Returns its id. */
  createCollection: (name: string, firstItem?: SavedItem) => Promise<string | null>;
  /** Rename / delete a list. */
  renameCollection: (collectionId: string, name: string) => void;
  deleteCollection: (collectionId: string) => void;

  // App-wide Save-to picker. Any component calls openSaveSheet(item); a single
  // <SaveToSheet> mounted at the provider root renders for whatever's targeted.
  saveTarget: SavedItem | null;
  openSaveSheet: (item: SavedItem) => void;
  closeSaveSheet: () => void;
}

const CollectionsContext = createContext<CollectionsContextValue | undefined>(undefined);

// The two lists every account starts with (mirrors the DB trigger in
// 0005_collections.sql so demo mode matches live mode).
const STARTER_NAMES = ['Want to try', 'Favorites'] as const;

function seedDemoCollections(): Collection[] {
  return STARTER_NAMES.map((name, i) => ({ id: `demo-c${i}`, name, items: [] }));
}

const sameItem = (a: SavedItem, b: SavedItem) => a.type === b.type && a.id === b.id;

export function CollectionsProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const live = isSupabaseConfigured;

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState<boolean>(live);
  const [saveTarget, setSaveTarget] = useState<SavedItem | null>(null);

  // ── Load from Supabase (collections + their items in two reads) ─────────────
  const loadFromSupabase = useCallback(async () => {
    setLoading(true);
    const { data: cols, error } = await supabase
      .from('collections')
      .select('id, name, created_at, collection_items(item_type, item_id)')
      .order('created_at', { ascending: true });
    if (error || !cols) {
      if (__DEV__) console.warn('[Plated] collections load failed', error);
      // Fall back to empty starter lists so the picker still works offline.
      setCollections(seedDemoCollections());
      setLoading(false);
      return;
    }
    setCollections(
      cols.map((c: any) => ({
        id: c.id,
        name: c.name,
        items: (c.collection_items ?? []).map((it: any) => ({
          type: it.item_type as SavedItemType,
          id: it.item_id,
        })),
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!live) {
      setCollections(seedDemoCollections());
      setLoading(false);
      return;
    }
    if (userId) loadFromSupabase().catch(() => setLoading(false));
    else {
      // Signed out under a live config — nothing to show yet.
      setCollections([]);
      setLoading(false);
    }
  }, [live, userId, loadFromSupabase]);

  const collectionsWith = useCallback(
    (item: SavedItem) => collections.filter((c) => c.items.some((i) => sameItem(i, item))),
    [collections],
  );
  const isSaved = useCallback(
    (item: SavedItem) => collections.some((c) => c.items.some((i) => sameItem(i, item))),
    [collections],
  );

  const toggleInCollection = useCallback(
    (collectionId: string, item: SavedItem) => {
      const col = collections.find((c) => c.id === collectionId);
      if (!col) return;
      const has = col.items.some((i) => sameItem(i, item));

      // Optimistic update.
      setCollections((prev) =>
        prev.map((c) =>
          c.id !== collectionId
            ? c
            : {
                ...c,
                items: has ? c.items.filter((i) => !sameItem(i, item)) : [...c.items, item],
              },
        ),
      );

      if (!live || !userId) return;
      const revert = () =>
        setCollections((prev) =>
          prev.map((c) =>
            c.id !== collectionId
              ? c
              : {
                  ...c,
                  items: has ? [...c.items, item] : c.items.filter((i) => !sameItem(i, item)),
                },
          ),
        );

      if (has) {
        supabase
          .from('collection_items')
          .delete()
          .eq('collection_id', collectionId)
          .eq('item_type', item.type)
          .eq('item_id', item.id)
          .then(({ error }) => {
            if (error) {
              if (__DEV__) console.warn('[Plated] unsave failed', error);
              revert();
            }
          });
      } else {
        supabase
          .from('collection_items')
          .insert({ collection_id: collectionId, item_type: item.type, item_id: item.id })
          .then(({ error }) => {
            if (error) {
              if (__DEV__) console.warn('[Plated] save failed', error);
              revert();
            }
          });
      }
    },
    [collections, live, userId],
  );

  const createCollection = useCallback(
    async (name: string, firstItem?: SavedItem): Promise<string | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      if (!live || !userId) {
        const id = `demo-c${Date.now()}`;
        setCollections((prev) => [...prev, { id, name: trimmed, items: firstItem ? [firstItem] : [] }]);
        return id;
      }

      const { data, error } = await supabase
        .from('collections')
        .insert({ user_id: userId, name: trimmed })
        .select('id')
        .single();
      if (error || !data) {
        if (__DEV__) console.warn('[Plated] create collection failed', error);
        showAlert('Could not create list', 'Something went wrong — please try again.');
        return null;
      }
      const id = data.id as string;
      setCollections((prev) => [...prev, { id, name: trimmed, items: [] }]);
      if (firstItem) toggleInCollection(id, firstItem);
      return id;
    },
    [live, userId, toggleInCollection],
  );

  const renameCollection = useCallback(
    (collectionId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const prevName = collections.find((c) => c.id === collectionId)?.name;
      setCollections((prev) => prev.map((c) => (c.id === collectionId ? { ...c, name: trimmed } : c)));
      if (!live || !userId) return;
      supabase
        .from('collections')
        .update({ name: trimmed })
        .eq('id', collectionId)
        .then(({ error }) => {
          if (error) {
            if (__DEV__) console.warn('[Plated] rename collection failed', error);
            if (prevName != null)
              setCollections((prev) => prev.map((c) => (c.id === collectionId ? { ...c, name: prevName } : c)));
          }
        });
    },
    [collections, live, userId],
  );

  const deleteCollection = useCallback(
    (collectionId: string) => {
      const removed = collections.find((c) => c.id === collectionId);
      setCollections((prev) => prev.filter((c) => c.id !== collectionId));
      if (!live || !userId) return;
      supabase
        .from('collections')
        .delete()
        .eq('id', collectionId)
        .then(({ error }) => {
          if (error) {
            if (__DEV__) console.warn('[Plated] delete collection failed', error);
            if (removed) setCollections((prev) => [...prev, removed]);
          }
        });
    },
    [collections, live, userId],
  );

  const openSaveSheet = useCallback((item: SavedItem) => setSaveTarget(item), []);
  const closeSaveSheet = useCallback(() => setSaveTarget(null), []);

  const value = useMemo(
    () => ({
      collections,
      loading,
      collectionsWith,
      isSaved,
      toggleInCollection,
      createCollection,
      renameCollection,
      deleteCollection,
      saveTarget,
      openSaveSheet,
      closeSaveSheet,
    }),
    [collections, loading, collectionsWith, isSaved, toggleInCollection, createCollection, renameCollection, deleteCollection, saveTarget, openSaveSheet, closeSaveSheet],
  );

  return (
    <CollectionsContext.Provider value={value}>
      {children}
      <SaveToSheet />
    </CollectionsContext.Provider>
  );
}

export function useCollections(): CollectionsContextValue {
  const ctx = useContext(CollectionsContext);
  if (!ctx) throw new Error('useCollections must be used within a CollectionsProvider');
  return ctx;
}

/**
 * App-wide "Save to…" bottom sheet. Mounted once inside the provider; opens
 * whenever `openSaveSheet(item)` is called from anywhere (PlateCard bookmark,
 * PlatoTile, restaurant detail, …). Toggles the item across the user's named
 * lists and can create a new list inline.
 */
function SaveToSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { collections, saveTarget, closeSaveSheet, toggleInCollection, createCollection } = useCollections();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const visible = saveTarget != null;
  const target = saveTarget;

  const reset = () => {
    setCreating(false);
    setName('');
  };
  const close = () => {
    reset();
    closeSaveSheet();
  };
  const onAdd = async () => {
    if (!name.trim() || !target) return;
    await createCollection(name.trim(), target);
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={saveStyles.backdrop} onPress={close}>
        <Pressable
          style={[saveStyles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[saveStyles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[saveStyles.title, { color: colors.text, fontFamily: displayFont }]}>Save to…</Text>

          {collections.map((c) => {
            const on = target ? c.items.some((i) => i.type === target.type && i.id === target.id) : false;
            const icon = c.name === 'Favorites' ? 'heart' : c.name === 'Want to try' ? 'bookmark' : 'albums';
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  if (target) toggleInCollection(c.id, target);
                  tapLight();
                }}
                style={[saveStyles.row, { borderBottomColor: colors.border }]}>
                <View style={[saveStyles.rowIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.accent} />
                </View>
                <Text style={[saveStyles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                  {c.name}
                </Text>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={on ? colors.accent : colors.textMuted}
                />
              </Pressable>
            );
          })}

          {creating ? (
            <View style={saveStyles.createRow}>
              <TextInput
                autoFocus
                value={name}
                onChangeText={setName}
                placeholder="New collection name"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={onAdd}
                returnKeyType="done"
                style={[saveStyles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
              <Button label="Add" onPress={onAdd} />
            </View>
          ) : (
            <Pressable
              onPress={() => setCreating(true)}
              style={[saveStyles.newBtn, { borderColor: colors.border }]}>
              <Ionicons name="add" size={18} color={colors.accent} />
              <Text style={[saveStyles.newBtnText, { color: colors.accent }]}>New collection</Text>
            </Pressable>
          )}

          <Button label="Done" size="lg" style={{ marginTop: 16 }} onPress={close} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const saveStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '700' },
  createRow: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' },
  input: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  newBtnText: { fontSize: 14, fontWeight: '800' },
});
