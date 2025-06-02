import { studentService } from '../../../services/student.service';
import { requireAdmin } from '../../../utils/authorization';
import { wrapError } from '../../../utils/errors';
import { Context } from '../../../types/context';

export const studentQueries = {
  listStudents: async (_: any, args: { index: number; nameFilter?: string; teacherFilter?: string; subjectFilter?: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await studentService.listStudents(args.index, args.nameFilter, args.teacherFilter, args.subjectFilter);
    } catch (error) {
      wrapError(error, 'Failed to fetch students');
    }
  },

  getAssignmentData: async (_: any, __: any, context: Context) => {
    try {
      requireAdmin(context);
      return await studentService.getAssignmentData();
    } catch (error) {
      wrapError(error, 'Failed to fetch assignment data');
    }
  },

  getStudentAssignmentData: async (_: any, __: any, context: Context) => {
    try {
      requireAdmin(context);
      return await studentService.getStudentAssignmentData();
    } catch (error) {
      wrapError(error, 'Failed to fetch student assignment data');
    }
  }
};

export const studentMutations = {
  createStudent: async (_: any, args: { name: string; email?: string; password?: string; assignments?: Array<{ subjectId: string; teacherId: string }> }, context: Context) => {
    try {
      requireAdmin(context);
      return await studentService.createStudent(args.name, args.email, args.password, args.assignments);
    } catch (error) {
      wrapError(error, 'Failed to create student');
    }
  },

  updateStudent: async (_: any, args: { id: string; name: string; email?: string; password?: string; assignments?: Array<{ subjectId: string; teacherId: string }> }, context: Context) => {
    try {
      requireAdmin(context);
      return await studentService.updateStudent(args.id, args.name, args.email, args.password, args.assignments);
    } catch (error) {
      wrapError(error, 'Failed to update student');
    }
  },

  deleteStudent: async (_: any, args: { id: string }, context: Context) => {
    try {
      requireAdmin(context);
      return await studentService.deleteStudent(args.id);
    } catch (error) {
      wrapError(error, 'Failed to delete student');
    }
  },

  deleteStudents: async (_: any, args: { ids: string[] }, context: Context) => {
    try {
      requireAdmin(context);
      return await studentService.deleteStudents(args.ids);
    } catch (error) {
      wrapError(error, 'Failed to delete students');
    }
  }
};