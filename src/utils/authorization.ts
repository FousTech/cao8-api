import { GraphQLError } from 'graphql';
import { Context } from '../types/context';

export function requireAuth(context: Context): void {
  if (!context.user || !context.token) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
}

export function requireAdmin(context: Context): void {
  requireAuth(context);
  
  if (context.user!.role !== 'ADMIN') {
    throw new GraphQLError('Unauthorized: Admin access required', {
      extensions: { code: 'FORBIDDEN' }
    });
  }
}

export function preventSelfDeletion(context: Context, targetId: string): void {
  if (context.user?.id === targetId) {
    throw new GraphQLError('Cannot delete your own account', {
      extensions: { code: 'BAD_REQUEST' }
    });
  }
}