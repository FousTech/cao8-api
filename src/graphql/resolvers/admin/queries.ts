import { adminService } from '../../../services/admin.service';
import { requireAdmin } from '../../../utils/authorization';
import { wrapError } from '../../../utils/errors';
import { Context } from '../../../types/context';

export const adminQueries = {
  listAdmins: async (_: any, __: any, context: Context) => {
    try {
      requireAdmin(context);
      return await adminService.listAdmins();
    } catch (error) {
      wrapError(error, 'Failed to fetch admins');
    }
  }
};