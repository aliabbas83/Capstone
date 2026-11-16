// Generated from the Supabase project `jawla` (public schema). Regenerate after schema changes.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
      categories: {
        Row: { active: boolean; color: string; emoji: string; id: string; name: string; sort_order: number };
        Insert: { active?: boolean; color: string; emoji: string; id: string; name: string; sort_order?: number };
        Update: { active?: boolean; color?: string; emoji?: string; id?: string; name?: string; sort_order?: number };
        Relationships: [];
      };
      games: {
        Row: {
          categories: string[];
          created_at: string;
          finished_at: string | null;
          id: string;
          lane_length: number;
          owner_id: string;
          status: string;
          team_mascots: string[];
          team_names: string[];
          team_photos: string[] | null;
          winner: number | null;
        };
        Insert: {
          categories: string[];
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          lane_length?: number;
          owner_id: string;
          status?: string;
          team_mascots: string[];
          team_names: string[];
          team_photos?: string[] | null;
          winner?: number | null;
        };
        Update: Partial<Database['public']['Tables']['games']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: { created_at: string; display_name: string | null; games_credit: number; id: string };
        Insert: { created_at?: string; display_name?: string | null; games_credit?: number; id: string };
        Update: { created_at?: string; display_name?: string | null; games_credit?: number; id?: string };
        Relationships: [];
      };
      questions: {
        Row: {
          active: boolean;
          answer: string;
          category_id: string;
          created_at: string;
          id: number;
          points: number;
          question: string;
        };
        Insert: { active?: boolean; answer: string; category_id: string; created_at?: string; id?: never; points: number; question: string };
        Update: { active?: boolean; answer?: string; category_id?: string; created_at?: string; id?: never; points?: number; question?: string };
        Relationships: [];
      };
      seen_questions: {
        Row: { game_id: string | null; question_id: number; seen_at: string; user_id: string };
        Insert: { game_id?: string | null; question_id: number; seen_at?: string; user_id: string };
        Update: { game_id?: string | null; question_id?: number; seen_at?: string; user_id?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      draw_question: {
        Args: { p_category_id: string; p_game_id: string; p_points: number };
        Returns: { answer: string; points: number; question: string; question_id: number }[];
      };
      start_game: {
        Args: { p_team_names: string[]; p_team_mascots: string[]; p_categories: string[]; p_team_photos?: (string | null)[] | null };
        Returns: string;
      };
      finish_game: {
        Args: { p_game_id: string; p_winner?: number | null };
        Returns: undefined;
      };
      remaining_questions: {
        Args: { p_category_ids: string[] };
        Returns: { category_id: string; points: number; remaining: number }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Category = Database['public']['Tables']['categories']['Row'];
export type DrawnQuestion = Database['public']['Functions']['draw_question']['Returns'][number];
