import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CollectionRow } from '@/components/ProfileView';
import { NameInputModal } from '@/components/NameInputModal';
import { tapLight } from '@/lib/haptics';
import { useCollections } from '@/store/CollectionsContext';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * The Collections tab's own section on group-info/chat-info — a list owned
 * by the conversation itself rather than one person, so every member can add
 * to it "like it is their own collection" (RLS backs that, not just the UI —
 * see 0067_shared_collections.sql). Private to members until the creator
 * chooses to make it public, same privacy toggle every other collection has.
 *
 * At most one empty-state "Create" card; once a shared list exists here, it
 * renders like any other `CollectionRow` and tapping it opens the same
 * `/collection/[id]` screen everyone's personal lists use.
 */
export function SharedCollectionSection({
  conversationId,
  isGroup,
}: {
  conversationId: string;
  isGroup: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { collections, createSharedCollection } = useCollections();
  const [nameOpen, setNameOpen] = useState(false);

  const shared = collections.filter((c) => c.conversationId === conversationId);

  const onCreate = async (name: string) => {
    const id = await createSharedCollection(conversationId, name);
    setNameOpen(false);
    if (id) router.push(`/collection/${id}`);
  };

  if (shared.length > 0) {
    return (
      <View style={{ gap: 10 }}>
        {shared.map((c) => (
          <CollectionRow key={c.id} collection={c} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.empty}>
      <Ionicons name="albums-outline" size={40} color={colors.textMuted} />
      <Text style={[styles.title, { color: colors.text }]}>Create a shared collection</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Add and manage posts together {isGroup ? 'with the group' : 'with each other'}.
      </Text>
      <Pressable
        onPress={() => {
          tapLight();
          setNameOpen(true);
        }}
        style={[styles.createBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="add" size={17} color={colors.text} />
        <Text style={[styles.createBtnText, { color: colors.text }]}>Create</Text>
      </Pressable>

      <NameInputModal
        visible={nameOpen}
        title="Name this collection"
        placeholder="Collection name"
        submitLabel="Create"
        onSubmit={onCreate}
        onClose={() => setNameOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 6 },
  title: { fontSize: 16, fontWeight: '800', marginTop: 8 },
  body: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  createBtnText: { fontSize: 14, fontWeight: '800' },
});
