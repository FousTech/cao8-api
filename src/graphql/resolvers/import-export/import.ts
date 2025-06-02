import { importService } from '../../../services/import.service';
import { requireAdmin } from '../../../utils/authorization';
import { wrapError } from '../../../utils/errors';
import { Context } from '../../../types/context';

export const importMutations = {
  importData: async (_: any, args: { data: string; mode: 'REPLACE' | 'ADD' }, context: Context) => {
    try {
      requireAdmin(context);
      return await importService.importData(args.data, args.mode, context.user!.id);
    } catch (error) {
      wrapError(error, 'Import failed');
    }
  },

  deleteAllData: async (_: any, __: any, context: Context) => {
    try {
      requireAdmin(context);
      return await importService.deleteAllData(context.user!.id);
    } catch (error) {
      wrapError(error, 'Delete all data failed');
    }
  }
};