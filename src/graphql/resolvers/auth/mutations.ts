import { authService } from '../../../services/auth.service';
import { requireAuth, requireAdmin } from '../../../utils/authorization';
import { wrapError } from '../../../utils/errors';
import { Context } from '../../../types/context';

export const authMutations = {
  adminLogin: async (_: any, args: { email: string; password: string }) => {
    try {
      return await authService.adminLogin(args);
    } catch (error) {
      wrapError(error, 'Login failed');
    }
  },

  studentLogin: async (_: any, args: { email: string; password: string }) => {
    try {
      return await authService.studentLogin(args.email, args.password);
    } catch (error) {
      wrapError(error, 'Student login failed');
    }
  },

  refreshToken: async (_: any, args: { refreshToken: string }) => {
    try {
      return await authService.refreshToken(args.refreshToken);
    } catch (error) {
      wrapError(error, 'Token refresh failed');
    }
  },

  logout: async (_: any, __: any, context: Context) => {
    try {
      requireAuth(context);
      return await authService.logout();
    } catch (error) {
      wrapError(error, 'Logout failed');
    }
  },

  updateAdminProfile: async (_: any, args: { firstName: string; lastName: string; email: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await authService.updateProfile(context.user!.id, args);
    } catch (error) {
      wrapError(error, 'Failed to update profile');
    }
  }
};