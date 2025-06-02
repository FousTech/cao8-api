import { supabase, supabaseAdmin } from '../lib/supabase';

export function getDbClient() {
  return supabaseAdmin || supabase;
}