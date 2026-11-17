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

/**
 * Public web address of a question picture (flag or map), or null for a text question.
 * Only names the server gave us are accepted (32 hex characters + .png/.svg).
 */
export function questionImageUrl(path: string | null | undefined): string | null {
  if (!path || !/^[0-9a-f]{32}\.(png|svg)$/.test(path)) return null;
  return supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl;
}

/** Unseen questions left for this account, keyed "categoryId:points". */
export async function remainingQuestions(categoryIds: string[]): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('remaining_questions', { p_category_ids: categoryIds });
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [`${r.category_id}:${r.points}`, r.remaining]));
}

/**
 * Start a paid game. The server checks everything and takes one credit.
 * Photos are storage paths from uploadTeamPhoto (or null).
 */
export async function startGame(input: {
  teamNames: [string, string];
  mascots: [string, string];
  categories: string[];
  photos: [string | null, string | null];
}): Promise<string> {
  const hasPhoto = input.photos.some(Boolean);
  const { data, error } = await supabase.rpc('start_game', {
    p_team_names: input.teamNames,
    p_team_mascots: input.mascots,
    p_categories: input.categories,
    p_team_photos: hasPhoto ? input.photos : null,
  });
  if (error) throw error;
  return data;
}

/** Mark a game finished (winner 0/1) or abandoned (null). */
export async function finishGame(gameId: string, winner: 0 | 1 | null): Promise<void> {
  const { error } = await supabase.rpc('finish_game', { p_game_id: gameId, p_winner: winner });
  if (error) throw error;
}

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Upload a team photo to the private bucket, inside the user's own folder. Returns its path. */
export async function uploadTeamPhoto(userId: string, uri: string): Promise<string> {
  const kind = /^data:image\/png|\.png$/i.test(uri) ? 'png' : /^data:image\/webp|\.webp$/i.test(uri) ? 'webp' : 'jpg';
  const contentType = kind === 'jpg' ? 'image/jpeg' : `image/${kind}`;
  const body = await (await fetch(uri)).arrayBuffer();
  if (body.byteLength > PHOTO_MAX_BYTES) throw new Error('photo_too_big');
  const name = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const path = `${userId}/${name}.${kind}`;
  const { error } = await supabase.storage.from('team-photos').upload(path, body, { contentType, upsert: false });
  // Storage allows 40 photo uploads per account per day; past that the insert policy says no.
  if (error && /row-level security/i.test(error.message)) throw new Error('photo_limit');
  if (error) throw error;
  return path;
}

/** Turn a server/network error from the game functions into a friendly Arabic message. */
export function gameErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : '';
  if (/no credit/i.test(msg)) return 'رصيدك من الألعاب خلص. اشترِ لعبة من صفحة حسابك.';
  if (/team names must differ/i.test(msg)) return 'اسما الفريقين لازم يكونون مختلفين.';
  if (/team name/i.test(msg)) return 'اسم الفريق لازم يكون من حرف إلى 20 حرف.';
  if (/categories/i.test(msg)) return 'اختاروا 8 فئات مختلفة.';
  if (/photo_too_big/i.test(msg)) return 'الصورة كبيرة. اختاروا صورة أصغر أو شخصية بدلها.';
  if (/photo_limit/i.test(msg)) return 'رفعتوا صور كثيرة اليوم. اختاروا شخصية بدل الصورة، أو جرّبوا بكرة.';
  if (/photo|storage|mime/i.test(msg)) return 'ما قدرنا نرفع صورة الفريق. جرّبوا مرة ثانية أو اختاروا شخصية.';
  if (/game expired/i.test(msg)) return 'مرّ وقت طويل على هذه اللعبة (أكثر من 6 ساعات). ابدأوا لعبة جديدة.';
  if (/question limit/i.test(msg)) return 'وصلت اللعبة للحد الأقصى من الأسئلة. ابدأوا لعبة جديدة.';
  if (/not active|not found/i.test(msg)) return 'هذه اللعبة انتهت. ابدأوا لعبة جديدة.';
  if (/not signed in|jwt/i.test(msg)) return 'انتهت جلستك. سجّل دخول مرة ثانية.';
  if (/network|fetch/i.test(msg)) return 'لا يوجد اتصال بالإنترنت. تأكد من الشبكة وحاول مرة ثانية.';
  return 'صار خطأ غير متوقع. حاول مرة ثانية.';
}
