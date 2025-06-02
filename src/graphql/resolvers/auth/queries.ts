import { authService } from '../../../services/auth.service';
import { Context } from '../../../types/context';

export const authQueries = {
  me: async (_: any, __: any, context: Context) => {
    if (!context.user) {
      return null;
    }
    
    return await authService.getCurrentUser(context.user.id);
  }
};