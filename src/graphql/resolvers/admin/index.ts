import { adminQueries } from './queries';
import { adminMutations } from './mutations';

export const adminResolvers = {
  Query: adminQueries,
  Mutation: adminMutations
};