import { supabase, supabaseAdmin } from '../lib/supabase';
import { createGraphQLError } from '../utils/errors';
import { getDbClient } from '../utils/database';

interface LoginParams {
  email: string;
  password: string;
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  };
  token: string;
  refreshToken: string;
}

export class AuthService {
  async adminLogin({ email, password }: LoginParams): Promise<AuthResponse> {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      throw createGraphQLError('Invalid email or password', 'UNAUTHENTICATED');
    }

    const dbClient = getDbClient();
    
    const { data: profile, error: profileError } = await dbClient
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      throw createGraphQLError('User profile not found');
    }

    if (profile.role !== 'ADMIN') {
      throw createGraphQLError('Unauthorized: Admin access required', 'FORBIDDEN');
    }

    return {
      user: {
        id: authData.user.id,
        email: authData.user.email!,
        firstName: profile.first_name,
        lastName: profile.last_name,
        role: profile.role,
        createdAt: authData.user.created_at,
        updatedAt: profile.updated_at || authData.user.created_at
      },
      token: authData.session!.access_token,
      refreshToken: authData.session!.refresh_token
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const { data: authData, error: authError } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (authError || !authData.user || !authData.session) {
      throw createGraphQLError('Invalid or expired refresh token', 'UNAUTHENTICATED');
    }

    const dbClient = getDbClient();
    
    const { data: profile, error: profileError } = await dbClient
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      throw createGraphQLError('User profile not found');
    }

    if (profile.role !== 'ADMIN') {
      throw createGraphQLError('Unauthorized: Admin access required', 'FORBIDDEN');
    }

    return {
      user: {
        id: authData.user.id,
        email: authData.user.email!,
        firstName: profile.first_name,
        lastName: profile.last_name,
        role: profile.role,
        createdAt: authData.user.created_at,
        updatedAt: profile.updated_at || authData.user.created_at
      },
      token: authData.session.access_token,
      refreshToken: authData.session.refresh_token
    };
  }

  async logout(): Promise<boolean> {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Logout error:', error);
    }

    return true;
  }

  async studentLogin(email: string, password: string): Promise<AuthResponse> {
    const dbClient = getDbClient();
    
    // Check if student exists with this email
    const { data: student, error: studentError } = await dbClient
      .from('students')
      .select('*')
      .eq('email', email)
      .single();

    if (studentError || !student) {
      throw createGraphQLError('Nesprávný email nebo heslo', 'INVALID_CREDENTIALS');
    }

    // Student must exist in our students table
    // Password verification will be done by Supabase Auth

    // Try to sign in with Supabase Auth
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        // If user doesn't exist in auth.users, create them
        if (authError.message.includes('Invalid login credentials')) {
          // Create user in Supabase Auth
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              role: 'STUDENT',
              student_id: student.id
            }
          });

          if (createError) {
            throw createError;
          }

          // Create profile entry
          const { error: profileError } = await dbClient
            .from('profiles')
            .insert({
              id: newUser.user.id,
              email: student.email,
              role: 'STUDENT',
              first_name: student.name.split(' ')[0] || student.name,
              last_name: student.name.split(' ').slice(1).join(' ') || ''
            });

          if (profileError) {
            // Rollback user creation
            await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
            throw profileError;
          }

          // Now sign in with the newly created user
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (signInError || !signInData.session) {
            throw signInError || new Error('Failed to sign in after user creation');
          }

          return {
            user: {
              id: newUser.user.id,
              email: student.email,
              firstName: student.name.split(' ')[0] || student.name,
              lastName: student.name.split(' ').slice(1).join(' ') || '',
              role: 'STUDENT',
              createdAt: student.created_at,
              updatedAt: student.updated_at
            },
            token: signInData.session.access_token,
            refreshToken: signInData.session.refresh_token
          };
        }
        
        throw authError;
      }

      // User exists and signed in successfully
      return {
        user: {
          id: authData.user!.id,
          email: student.email,
          firstName: student.name.split(' ')[0] || student.name,
          lastName: student.name.split(' ').slice(1).join(' ') || '',
          role: 'STUDENT',
          createdAt: student.created_at,
          updatedAt: student.updated_at
        },
        token: authData.session!.access_token,
        refreshToken: authData.session!.refresh_token
      };
    } catch (error: any) {
      console.error('Student login error:', error);
      throw createGraphQLError('Nesprávný email nebo heslo', 'INVALID_CREDENTIALS');
    }
  }

  async getCurrentUser(userId: string) {
    const dbClient = getDbClient();
    const { data: profile } = await dbClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (profile) {
      return {
        id: userId,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        role: profile.role,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      };
    }
    
    return null;
  }

  async updateProfile(userId: string, updates: { firstName: string; lastName: string; email: string }) {
    const dbClient = getDbClient();

    const { data: profile, error: updateError } = await dbClient
      .from('profiles')
      .update({
        first_name: updates.firstName,
        last_name: updates.lastName,
        email: updates.email,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (updateError || !profile) {
      throw createGraphQLError('Failed to update profile');
    }

    // If email changed, update auth.users as well
    const { data: currentUser } = await dbClient
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (updates.email !== currentUser?.email) {
      const { error: authError } = await dbClient.auth.admin.updateUserById(
        userId,
        { email: updates.email }
      );
      
      if (authError) {
        // Rollback profile update
        await dbClient
          .from('profiles')
          .update({
            email: currentUser?.email,
            first_name: (currentUser as any)?.first_name,
            last_name: (currentUser as any)?.last_name
          })
          .eq('id', userId);
          
        throw createGraphQLError('Failed to update email');
      }
    }

    return {
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: profile.id,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        role: profile.role,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      }
    };
  }
}

export const authService = new AuthService();