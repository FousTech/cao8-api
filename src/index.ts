import { ApolloServer } from '@apollo/server'
import { startStandaloneServer } from '@apollo/server/standalone'
import { typeDefs } from './graphql/schema'
import { resolvers } from './graphql/resolvers'
import { supabase, supabaseAdmin } from './lib/supabase'
import { Context } from './types/context'
import dotenv from 'dotenv'

dotenv.config()

async function startServer() {
  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
  })

  const { url } = await startStandaloneServer(server, {
    listen: { port: 3000 },
    context: async ({ req }) => {
      const token = req.headers.authorization?.replace('Bearer ', '')
      
      if (!token) {
        return {}
      }

      try {
        // Create a Supabase client with the user's token for RLS
        const { createClient } = await import('@supabase/supabase-js')
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
        
        // Get the current user from Supabase
        const { data: { user }, error: userError } = await authenticatedClient.auth.getUser()
        
        if (userError || !user) {
          console.error('User fetch error:', userError)
          return {}
        }
        
        // Get user profile with role - MUST use service role to bypass RLS to avoid infinite recursion
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

        console.log('Auth context created for user:', { id: user.id, email: user.email, role: profile.role })

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

  console.log(`🚀 Server ready at: ${url}`)
}

startServer().catch((err) => {
  console.error('Error starting server:', err)
  process.exit(1)
})