import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn('[funnel-lab] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars.');
}

export const supabase = createClient(url || '', anon || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
