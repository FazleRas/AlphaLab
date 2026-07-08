// Supabase client for auth + watchlist persistence.
//
// Configure these in frontend/.env.local (see .env.example):
//   REACT_APP_SUPABASE_URL=https://xxxx.supabase.co
//   REACT_APP_SUPABASE_ANON_KEY=eyJ...
//
// The anon key is safe to ship in the frontend — Row-Level Security on the
// `watchlist` table is what actually protects each user's data.
import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Only construct a client if both values are present, so the app still boots
// (and the public tabs keep working) before Supabase keys are wired in.
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;
