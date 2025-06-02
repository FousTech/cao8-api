import { teacherService } from '../../../services/teacher.service';
import { requireAdmin } from '../../../utils/authorization';
import { wrapError } from '../../../utils/errors';
import { Context } from '../../../types/context';

export const teacherQueries = {
  listTeachers: async (_: any, args: { index: number; nameFilter?: string; subjectFilter?: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await teacherService.listTeachers(args.index, args.nameFilter, args.subjectFilter);
    } catch (error) {
      wrapError(error, 'Failed to fetch teachers');
    }
  }
};

export const teacherMutations = {
  createTeacher: async (_: any, args: { name: string; assignments?: Array<{ subjectId: string; studentIds: string[] }> }, context: Context) => {
    try {
      requireAdmin(context);
      return await teacherService.createTeacher(args.name, args.assignments);
    } catch (error) {
      wrapError(error, 'Failed to create teacher');
    }
  },

  updateTeacher: async (_: any, args: { id: string; name: string; assignments?: Array<{ subjectId: string; studentIds: string[] }> }, context: Context) => {
    try {
      requireAdmin(context);
      return await teacherService.updateTeacher(args.id, args.name, args.assignments);
    } catch (error) {
      wrapError(error, 'Failed to update teacher');
    }
  },

  deleteTeacher: async (_: any, args: { id: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await teacherService.deleteTeacher(args.id);
    } catch (error) {
      wrapError(error, 'Failed to delete teacher');
    }
  },

  deleteTeachers: async (_: any, args: { ids: string[] }, context: Context) => {
    try {
      requireAdmin(context);
      return await teacherService.deleteTeachers(args.ids);
    } catch (error) {
      wrapError(error, 'Failed to delete teachers');
    }
  }
};