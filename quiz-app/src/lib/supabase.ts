import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { Category, Database, DrawnQuestion } from './database.types';

// Only PUBLIC values are read here (EXPO_PUBLIC_*). Secrets never live in the app.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

// During web static rendering there is no window, so there is nowhere to keep a session.
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient<Database>(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    persistSession: !isServer,
    autoRefreshToken: !isServer,
    detectSessionInUrl: false,
  },
});

/** Active categories, in display order. Anyone can read these. */
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order');
  if (error) throw error;
  return data;
}

/**
 * Ask the server for a question the account has never seen.
 * Returns null when that category + difficulty has run out for this account.
 */
export async function drawQuestion(gameId: string, categoryId: string, points: 2 | 3 | 4 | 5): Promise<DrawnQuestion | null> {
  const { data, error } = await supabase.rpc('draw_question', {
    p_game_id: gameId,
    p_category_id: categoryId,
    p_points: points,
  });
  if (error) throw error;
  return data[0] ?? null;
}

/** Unseen questions left for this account, keyed "categoryId:points". */
export async function remainingQuestions(categoryIds: string[]): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('remaining_questions', { p_category_ids: categoryIds });
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [`${r.category_id}:${r.points}`, r.remaining]));
}
