import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// Admin client with service role for privileged operations
export const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_SECRET
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_SECRET,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  : null