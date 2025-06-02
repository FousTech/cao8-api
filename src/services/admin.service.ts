import { supabaseAdmin } from '../lib/supabase';
import { createGraphQLError, handleDatabaseError } from '../utils/errors';
import { getDbClient } from '../utils/database';

interface CreateAdminParams {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface Admin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export class AdminService {
  async listAdmins() {
    const client = getDbClient();

    const { data: admins, error, count } = await client
      .from('profiles')
      .select('*', { count: 'exact' })
      .eq('role', 'ADMIN')
      .order('created_at', { ascending: false });

    if (error) {
      handleDatabaseError(error, 'fetch admins');
    }

    return {
      admins: admins?.map(admin => ({
        id: admin.id,
        email: admin.email,
        firstName: admin.first_name,
        lastName: admin.last_name,
        role: admin.role,
        createdAt: admin.created_at,
        updatedAt: admin.updated_at
      })) || [],
      total: count || 0
    };
  }

  async createAdmin({ email, password, firstName, lastName }: CreateAdminParams) {
    if (!supabaseAdmin) {
      throw createGraphQLError('Admin client not available');
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError || !authData.user) {
      throw createGraphQLError(`Failed to create user: ${authError?.message || 'Unknown error'}`, 'BAD_REQUEST');
    }

    // Create or update profile with ADMIN role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: authData.user.email!,
        first_name: firstName,
        last_name: lastName,
        role: 'ADMIN'
      })
      .select()
      .single();

    if (profileError) {
      // If profile creation fails, delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      
      handleDatabaseError(profileError, 'create admin profile');
    }

    return {
      success: true,
      message: 'Admin created successfully',
      admin: this.mapToAdmin(profile)
    };
  }

  async deleteAdmin(id: string, currentUserId: string) {
    if (currentUserId === id) {
      throw createGraphQLError('Cannot delete your own account', 'BAD_REQUEST');
    }

    if (!supabaseAdmin) {
      throw createGraphQLError('Admin client not available');
    }

    // Get admin info before deletion
    const { data: adminToDelete } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .eq('role', 'ADMIN')
      .single();

    if (!adminToDelete) {
      throw createGraphQLError('Admin not found', 'NOT_FOUND');
    }

    // Try to delete the auth user first
    try {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
      
      if (authError) {
        console.error('Auth deletion error:', authError);
        
        // Try deleting just the profile as fallback
        const { error: profileDeleteError } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', id);

        if (profileDeleteError) {
          console.error('Profile deletion error:', profileDeleteError);
          throw createGraphQLError(`Failed to delete admin. Auth service error: ${authError.message}. Profile deletion error: ${profileDeleteError.message}`);
        }
        
        return {
          success: true,
          message: 'Admin profile deleted, but auth credentials may still exist. Contact support if issues persist.',
          admin: this.mapToAdmin(adminToDelete)
        };
      }
    } catch (error: any) {
      console.error('Auth deletion exception:', error);
      
      // Last resort - try to delete just the profile
      const { error: profileDeleteError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', id);

      if (!profileDeleteError) {
        return {
          success: true,
          message: 'Admin profile deleted, but auth credentials may still exist. Contact support if issues persist.',
          admin: this.mapToAdmin(adminToDelete)
        };
      }
      
      throw createGraphQLError(`Failed to delete admin user. This might be a temporary issue with the auth service. Error: ${error.message || 'Unknown error'}`);
    }

    return {
      success: true,
      message: 'Admin deleted successfully',
      admin: this.mapToAdmin(adminToDelete)
    };
  }

  private mapToAdmin(profile: any): Admin {
    return {
      id: profile.id,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      role: profile.role,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at
    };
  }
}

export const adminService = new AdminService();