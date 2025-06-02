import { adminService } from '../../../services/admin.service';
import { requireAdmin } from '../../../utils/authorization';
import { wrapError } from '../../../utils/errors';
import { Context } from '../../../types/context';

export const adminMutations = {
  createAdmin: async (_: any, args: { email: string; password: string; firstName: string; lastName: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await adminService.createAdmin(args);
    } catch (error) {
      wrapError(error, 'Create admin failed');
    }
  },

  deleteAdmin: async (_: any, args: { id: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await adminService.deleteAdmin(args.id, context.user!.id);
    } catch (error) {
      wrapError(error, 'Delete admin failed');
    }
  }
};