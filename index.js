const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const cors = require('cors');
const { json } = require('body-parser');

// Import compiled files
const { typeDefs } = require('./dist/graphql/schema');
const { resolvers } = require('./dist/graphql/resolvers');
const { supabaseAdmin } = require('./dist/lib/supabase');

require('dotenv').config();

const app = express();

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await server.start();

  app.use(
    '/',
    cors(),
    json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return {};
        }

        try {
          const { createClient } = require('@supabase/supabase-js');
          const authenticatedClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
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
          );
          
          const { data: { user }, error: userError } = await authenticatedClient.auth.getUser();
          
          if (userError || !user) {
            console.error('User fetch error:', userError);
            return {};
          }
          
          if (!supabaseAdmin) {
            console.error('Service role client required for profile queries');
            return {};
          }
          
          const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (profileError || !profile) {
            console.error('Profile fetch error:', profileError);
            return {};
          }

          return {
            user: {
              id: user.id,
              email: user.email,
              role: profile.role
            },
            token
          };
        } catch (error) {
          console.error('Auth error:', error);
          return {};
        }
      },
    })
  );
}

startServer();

module.exports = app;