import { authQueries } from './queries';
import { authMutations } from './mutations';

export const authResolvers = {
  Query: authQueries,
  Mutation: authMutations
};