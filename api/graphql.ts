import { ApolloServer } from '@apollo/server'
import { startServerAndCreateNextHandler } from '@as-integrations/next'
import { typeDefs } from '../src/graphql/schema'
import { resolvers } from '../src/graphql/resolvers'
import { supabaseAdmin } from '../src/lib/supabase'
import { Context } from '../src/types/context'
import { createClient } from '@supabase/supabase-js'

const server = new ApolloServer<Context>({
  typeDefs,
  resolvers: resolvers as any,
})

const handler = startServerAndCreateNextHandler(server, {
  context: async (req) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return {}
    }

    try {
      const authenticatedClient = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false
          },
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      )
      
      const { data: { user }, error: userError } = await authenticatedClient.auth.getUser()
      
      if (userError || !user) {
        console.error('User fetch error:', userError)
        return {}
      }
      
      if (!supabaseAdmin) {
        console.error('Service role client required for profile queries')
        return {}
      }
      
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError || !profile) {
        console.error('Profile fetch error:', profileError)
        return {}
      }

      return {
        user: {
          id: user.id,
          email: user.email!,
          role: profile.role
        },
        token
      }
    } catch (error) {
      console.error('Auth error:', error)
      return {}
    }
  },
})

export default async function (req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  )
  
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }
  
  return handler(req, res)
}