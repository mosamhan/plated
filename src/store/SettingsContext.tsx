import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { showAlert } from '@/lib/dialog';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';

/**
 * Account preferences.
 *
 * Everything here is the user's own row in `user_settings` (0024) plus three
 * small owner-only lists — close friends, muted stories, hidden words. The
 * context keeps one optimistic copy and pushes each change immediately; a
 * failed write reverts and says so, because a privacy control that silently
 * doesn't apply is worse than one that isn't there.
 */

export type Audience = 'everyone' | 'followers' | 'friends' | 'off';
export type StoryReplyAudience = 'followers' | 'friends' | 'off';
export type StoryShareAudience = 'public' | 'friends' | 'close';

export type PreferredOrderProvider = 'doordash' | 'ubereats' | 'ask';
export type PreferredMapsApp = 'apple' | 'google' | 'ask';

export interface UserSettings {
  privateAccount: boolean;
  storyReplyAudience: StoryReplyAudience;
  storyShareAudience: StoryShareAudience;
  allowStoryResharing: boolean;
  saveStoryToArchive: boolean;
  commentAudience: Audience;
  tagAudience: Audience;
  allowResharing: boolean;
  uploadHd: boolean;
  reduceMotion: boolean;
  /**
   * 'ask' (default) means "show the chooser next time" — OrderProviderSheet
   * and the maps chooser both write a real choice here the first time, then
   * go straight to it from then on. Setting it back to 'ask' from Settings
   * is how a user asks to be asked again.
   */
  preferredOrderProvider: PreferredOrderProvider;
  preferredMapsApp: PreferredMapsApp;
}

const DEFAULTS: UserSettings = {
  privateAccount: false,
  storyReplyAudience: 'followers',
  storyShareAudience: 'public',
  allowStoryResharing: true,
  saveStoryToArchive: true,
  commentAudience: 'everyone',
  tagAudience: 'everyone',
  allowResharing: true,
  uploadHd: false,
  reduceMotion: false,
  preferredOrderProvider: 'ask',
  preferredMapsApp: 'ask',
};

/** camelCase key → the column it lives in. */
const COLUMN: Record<keyof UserSettings, string> = {
  privateAccount: 'private_account',
  storyReplyAudience: 'story_reply_audience',
  storyShareAudience: 'story_share_audience',
  allowStoryResharing: 'allow_story_resharing',
  saveStoryToArchive: 'save_story_to_archive',
  commentAudience: 'comment_audience',
  tagAudience: 'tag_audience',
  allowResharing: 'allow_resharing',
  uploadHd: 'upload_hd',
  reduceMotion: 'reduce_motion',
  preferredOrderProvider: 'preferred_order_provider',
  preferredMapsApp: 'preferred_maps_app',
};

interface SettingsContextValue {
  settings: UserSettings;
  /** Change one preference. Optimistic; reverts and warns on failure. */
  update: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;

  closeFriends: string[];
  isCloseFriend: (userId: string) => boolean;
  toggleCloseFriend: (userId: string) => void;

  hiddenWords: string[];
  addHiddenWord: (word: string) => void;
  removeHiddenWord: (word: string) => void;
  /** True when a comment should be filtered by the user's hidden words. */
  isHidden: (text: string) => boolean;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const live = isSupabaseConfigured;

  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [closeFriends, setCloseFriends] = useState<string[]>([]);
  const [hiddenWords, setHiddenWords] = useState<string[]>([]);

  useEffect(() => {
    if (!live || !userId) return;
    supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setSettings({
          privateAccount: !!data.private_account,
          storyReplyAudience: data.story_reply_audience ?? DEFAULTS.storyReplyAudience,
          storyShareAudience: data.story_share_audience ?? DEFAULTS.storyShareAudience,
          allowStoryResharing: data.allow_story_resharing ?? true,
          saveStoryToArchive: data.save_story_to_archive ?? true,
          commentAudience: data.comment_audience ?? DEFAULTS.commentAudience,
          tagAudience: data.tag_audience ?? DEFAULTS.tagAudience,
          allowResharing: data.allow_resharing ?? true,
          uploadHd: !!data.upload_hd,
          reduceMotion: !!data.reduce_motion,
          preferredOrderProvider: data.preferred_order_provider ?? DEFAULTS.preferredOrderProvider,
          preferredMapsApp: data.preferred_maps_app ?? DEFAULTS.preferredMapsApp,
        });
      });

    supabase
      .from('close_friends')
      .select('friend_id')
      .eq('user_id', userId)
      .then(({ data }) => setCloseFriends((data ?? []).map((r: any) => r.friend_id)));

    supabase
      .from('hidden_words')
      .select('word')
      .eq('user_id', userId)
      .then(({ data }) => setHiddenWords((data ?? []).map((r: any) => r.word)));
  }, [live, userId]);

  const update = useCallback(
    <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      const previous = settings[key];
      setSettings((prev) => ({ ...prev, [key]: value }));
      if (!live || !userId) return;
      supabase
        .from('user_settings')
        .upsert({ user_id: userId, [COLUMN[key]]: value, updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) {
            if (__DEV__) console.warn('[Plated] setting write failed', key, error);
            setSettings((prev) => ({ ...prev, [key]: previous }));
            showAlert('Could not save', 'That setting is unchanged — please try again.');
          }
        });
    },
    [live, userId, settings],
  );

  const isCloseFriend = useCallback((id: string) => closeFriends.includes(id), [closeFriends]);

  const toggleCloseFriend = useCallback(
    (id: string) => {
      const on = !closeFriends.includes(id);
      setCloseFriends((prev) => (on ? [...prev, id] : prev.filter((f) => f !== id)));
      if (!live || !userId) return;
      const q = on
        ? supabase.from('close_friends').insert({ user_id: userId, friend_id: id })
        : supabase.from('close_friends').delete().eq('user_id', userId).eq('friend_id', id);
      q.then(({ error }) => {
        if (error) {
          if (__DEV__) console.warn('[Plated] close friends write failed', error);
          setCloseFriends((prev) => (on ? prev.filter((f) => f !== id) : [...prev, id]));
        }
      });
    },
    [closeFriends, live, userId],
  );

  const addHiddenWord = useCallback(
    (raw: string) => {
      const word = raw.trim().toLowerCase();
      if (!word || hiddenWords.includes(word)) return;
      setHiddenWords((prev) => [...prev, word]);
      if (!live || !userId) return;
      supabase
        .from('hidden_words')
        .insert({ user_id: userId, word })
        .then(({ error }) => {
          if (error) setHiddenWords((prev) => prev.filter((w) => w !== word));
        });
    },
    [hiddenWords, live, userId],
  );

  const removeHiddenWord = useCallback(
    (word: string) => {
      setHiddenWords((prev) => prev.filter((w) => w !== word));
      if (!live || !userId) return;
      supabase
        .from('hidden_words')
        .delete()
        .eq('user_id', userId)
        .eq('word', word)
        .then(({ error }) => {
          if (error) setHiddenWords((prev) => [...prev, word]);
        });
    },
    [live, userId],
  );

  const isHidden = useCallback(
    (text: string) => {
      if (hiddenWords.length === 0) return false;
      const lower = text.toLowerCase();
      return hiddenWords.some((w) => lower.includes(w));
    },
    [hiddenWords],
  );

  const value = useMemo(
    () => ({
      settings,
      update,
      closeFriends,
      isCloseFriend,
      toggleCloseFriend,
      hiddenWords,
      addHiddenWord,
      removeHiddenWord,
      isHidden,
    }),
    [settings, update, closeFriends, isCloseFriend, toggleCloseFriend, hiddenWords, addHiddenWord, removeHiddenWord, isHidden],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
