import { exportQueries } from './export';
import { importMutations } from './import';

export const importExportResolvers = {
  Query: exportQueries,
  Mutation: importMutations
};