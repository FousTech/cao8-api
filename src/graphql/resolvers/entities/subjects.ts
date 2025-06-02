import { subjectService } from '../../../services/subject.service';
import { requireAdmin } from '../../../utils/authorization';
import { wrapError } from '../../../utils/errors';
import { Context } from '../../../types/context';

export const subjectQueries = {
  listSubjects: async (_: any, args: { index: number; nameFilter?: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await subjectService.listSubjects(args.index, args.nameFilter);
    } catch (error) {
      wrapError(error, 'Failed to fetch subjects');
    }
  }
};

export const subjectMutations = {
  createSubject: async (_: any, args: { name: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await subjectService.createSubject(args.name);
    } catch (error) {
      wrapError(error, 'Failed to create subject');
    }
  },

  updateSubject: async (_: any, args: { id: string; name: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await subjectService.updateSubject(args.id, args.name);
    } catch (error) {
      wrapError(error, 'Failed to update subject');
    }
  },

  deleteSubject: async (_: any, args: { id: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await subjectService.deleteSubject(args.id);
    } catch (error) {
      wrapError(error, 'Failed to delete subject');
    }
  },

  deleteSubjects: async (_: any, args: { ids: string[] }, context: Context) => {
    try {
      requireAdmin(context);
      return await subjectService.deleteSubjects(args.ids);
    } catch (error) {
      wrapError(error, 'Failed to delete subjects');
    }
  }
};