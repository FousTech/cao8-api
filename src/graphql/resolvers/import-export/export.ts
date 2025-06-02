import { importService } from '../../../services/import.service';
import { requireAdmin } from '../../../utils/authorization';
import { wrapError } from '../../../utils/errors';
import { Context } from '../../../types/context';

export const exportQueries = {
  exportData: async (_: any, __: any, context: Context) => {
    try {
      requireAdmin(context);
      return await importService.exportData();
    } catch (error) {
      wrapError(error, 'Failed to export data');
    }
  }
};