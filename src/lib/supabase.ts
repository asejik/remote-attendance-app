import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Access environment variables using Vite's syntax
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase Environment Variables');
}

// db.retry off: supabase-js (2.10x+) retries failed reads 3 times (1 + 2 + 4 s).
// The app handles failures itself (offline cache fallback, sync backoff), and
// those retries made an offline reopen sit on "Loading" for about 7 seconds.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, { db: { retry: false } });