import { getDbClient } from '../utils/database';
import { createGraphQLError, handleDatabaseError } from '../utils/errors';
import { getPaginationParams, createPaginatedResult } from '../utils/pagination';

interface TeacherSubject {
  subject: {
    id: string;
    name: string;
  };
  studentCount: number;
}

interface Teacher {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  subjects: TeacherSubject[];
}

interface CreateTeacherAssignment {
  subjectId: string;
  studentIds: string[];
}

export class TeacherService {
  async listTeachers(index: number, nameFilter?: string, subjectFilter?: string) {
    const client = getDbClient();
    const { offset, limit } = getPaginationParams(index);

    // Build query to fetch everything in one go
    let query = client
      .from('teachers')
      .select(`
        id,
        name,
        created_at,
        updated_at,
        student_teacher_subjects!left(
          teacher_id,
          subject_id,
          student_id,
          is_active,
          subjects:subject_id(id, name)
        )
      `, { count: 'exact' });

    if (nameFilter) {
      query = query.ilike('name', `%${nameFilter}%`);
    }

    // For subject filter, we need to filter after fetching
    if (subjectFilter) {
      const { data: allTeachers, error: fetchError, count } = await query
        .order('name', { ascending: true });

      if (fetchError) {
        handleDatabaseError(fetchError, 'fetch teachers');
      }

      // Filter teachers based on subject filter
      const filteredTeachers = (allTeachers || []).filter(teacher => {
        const activeRelationships = teacher.student_teacher_subjects?.filter(
          (rel: any) => rel.is_active
        ) || [];

        return activeRelationships.some((rel: any) => 
          rel.subjects?.name?.toLowerCase().includes(subjectFilter.toLowerCase())
        );
      });

      // Apply pagination
      const total = filteredTeachers.length;
      const paginatedTeachers = filteredTeachers.slice(offset, offset + limit);
      
      // Transform the data
      const teachersWithSubjects = paginatedTeachers.map(teacher => this.mapToTeacher(teacher));

      return {
        teachers: teachersWithSubjects,
        total,
        hasMore: offset + limit < total
      };
    }

    // No subject filter, use standard pagination
    const { data: teachers, error, count } = await query
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      handleDatabaseError(error, 'fetch teachers');
    }

    const mappedTeachers = (teachers || []).map(teacher => this.mapToTeacher(teacher));
    const result = createPaginatedResult(mappedTeachers, count || 0, index);

    return {
      teachers: result.items,
      total: result.total,
      hasMore: result.hasMore
    };
  }

  async createTeacher(name: string, assignments?: CreateTeacherAssignment[]) {
    const client = getDbClient();

    // Check if teacher exists
    const { data: existing } = await client
      .from('teachers')
      .select('id')
      .eq('name', name)
      .single();

    if (existing) {
      return {
        success: false,
        message: `Učitel se jménem "${name}" již existuje`,
        teacher: null
      };
    }

    // Create teacher
    const { data: teacher, error } = await client
      .from('teachers')
      .insert({ name })
      .select()
      .single();

    if (error) {
      handleDatabaseError(error, 'create teacher');
    }

    // Create student-teacher-subject relationships
    if (assignments && assignments.length > 0) {
      const relationshipsToInsert = [];
      
      for (const assignment of assignments) {
        if (assignment.studentIds && assignment.studentIds.length > 0) {
          // Create entries for each student
          for (const studentId of assignment.studentIds) {
            relationshipsToInsert.push({
              teacher_id: teacher.id,
              subject_id: assignment.subjectId,
              student_id: studentId,
              is_active: true
            });
          }
        } else {
          // Create entry without student (teacher-subject only)
          relationshipsToInsert.push({
            teacher_id: teacher.id,
            subject_id: assignment.subjectId,
            student_id: null,
            is_active: true
          });
        }
      }

      if (relationshipsToInsert.length > 0) {
        const { error: assignmentError } = await client
          .from('student_teacher_subjects')
          .insert(relationshipsToInsert);

        if (assignmentError) {
          await client.from('teachers').delete().eq('id', teacher.id);
          handleDatabaseError(assignmentError, 'create assignments');
        }
      }
    }

    // Return teacher with subjects
    const teacherWithSubjects = await this.getTeacherById(teacher.id);
    
    return {
      success: true,
      message: 'Učitel byl úspěšně vytvořen',
      teacher: teacherWithSubjects
    };
  }

  async updateTeacher(id: string, name: string, assignments?: CreateTeacherAssignment[]) {
    const client = getDbClient();

    // Check if teacher exists
    const { data: existingTeacher } = await client
      .from('teachers')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingTeacher) {
      return {
        success: false,
        message: 'Učitel nenalezen',
        teacher: null
      };
    }

    // Check if another teacher with the same name exists
    const { data: duplicateTeacher } = await client
      .from('teachers')
      .select('id')
      .eq('name', name)
      .neq('id', id)
      .single();

    if (duplicateTeacher) {
      return {
        success: false,
        message: `Učitel se jménem "${name}" již existuje`,
        teacher: null
      };
    }

    // Update teacher name
    const { data: updatedTeacher, error } = await client
      .from('teachers')
      .update({ name })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      handleDatabaseError(error, 'update teacher');
    }

    // Handle assignments update
    if (assignments !== undefined) {
      // First, deactivate all existing assignments
      const { error: deactivateError } = await client
        .from('student_teacher_subjects')
        .update({ is_active: false })
        .eq('teacher_id', id);

      if (deactivateError) {
        handleDatabaseError(deactivateError, 'deactivate assignments');
      }

      // Then, create or reactivate new assignments
      if (assignments.length > 0) {
        for (const assignment of assignments) {
          if (assignment.studentIds && assignment.studentIds.length > 0) {
            // Handle assignments with students
            for (const studentId of assignment.studentIds) {
              // Check if this relationship already exists
              const { data: existingRel } = await client
                .from('student_teacher_subjects')
                .select('id')
                .eq('teacher_id', id)
                .eq('subject_id', assignment.subjectId)
                .eq('student_id', studentId)
                .single();

              if (existingRel) {
                // Reactivate existing relationship
                await client
                  .from('student_teacher_subjects')
                  .update({ is_active: true })
                  .eq('id', existingRel.id);
              } else {
                // Create new relationship
                await client
                  .from('student_teacher_subjects')
                  .insert({
                    teacher_id: id,
                    subject_id: assignment.subjectId,
                    student_id: studentId,
                    is_active: true
                  });
              }
            }
          } else {
            // Handle assignment without students (teacher-subject only)
            const { data: existingRel } = await client
              .from('student_teacher_subjects')
              .select('id')
              .eq('teacher_id', id)
              .eq('subject_id', assignment.subjectId)
              .is('student_id', null)
              .single();

            if (existingRel) {
              // Reactivate existing relationship
              await client
                .from('student_teacher_subjects')
                .update({ is_active: true })
                .eq('id', existingRel.id);
            } else {
              // Create new relationship
              await client
                .from('student_teacher_subjects')
                .insert({
                  teacher_id: id,
                  subject_id: assignment.subjectId,
                  student_id: null,
                  is_active: true
                });
            }
          }
        }
      }
    }

    // Return updated teacher with subjects
    const teacherWithSubjects = await this.getTeacherById(id);
    
    return {
      success: true,
      message: 'Učitel byl úspěšně aktualizován',
      teacher: teacherWithSubjects
    };
  }

  async deleteTeacher(id: string) {
    const client = getDbClient();

    const { data: teacher } = await client
      .from('teachers')
      .select('*')
      .eq('id', id)
      .single();

    if (!teacher) {
      return {
        success: false,
        message: 'Učitel nenalezen',
        teacher: null
      };
    }

    const { error } = await client
      .from('teachers')
      .delete()
      .eq('id', id);

    if (error) {
      handleDatabaseError(error, 'delete teacher');
    }

    return {
      success: true,
      message: 'Učitel byl úspěšně smazán',
      teacher: {
        id: teacher.id,
        name: teacher.name,
        createdAt: teacher.created_at,
        updatedAt: teacher.updated_at,
        subjects: []
      }
    };
  }

  async deleteTeachers(ids: string[]) {
    const client = getDbClient();

    const { error } = await client
      .from('teachers')
      .delete()
      .in('id', ids);

    if (error) {
      handleDatabaseError(error, 'delete teachers');
    }

    return {
      success: true,
      message: `${ids.length} učitelů bylo úspěšně smazáno`,
      teacher: null
    };
  }

  private mapToTeacher(teacher: any): Teacher {
    // Group relationships by subject
    const subjectMap = new Map<string, { subject: any; studentIds: Set<string> }>();
    
    (teacher.student_teacher_subjects || [])
      .filter((rel: any) => rel.is_active && rel.subjects)
      .forEach((rel: any) => {
        if (!subjectMap.has(rel.subject_id)) {
          subjectMap.set(rel.subject_id, {
            subject: rel.subjects,
            studentIds: new Set()
          });
        }
        // Only count non-null student IDs
        if (rel.student_id) {
          subjectMap.get(rel.subject_id)!.studentIds.add(rel.student_id);
        }
      });

    // Transform to subjects array with student counts
    const subjects = Array.from(subjectMap.values()).map(({ subject, studentIds }) => ({
      subject: {
        id: subject.id,
        name: subject.name
      },
      studentCount: studentIds.size
    }));

    return {
      id: teacher.id,
      name: teacher.name,
      createdAt: teacher.created_at,
      updatedAt: teacher.updated_at,
      subjects
    };
  }

  private async getTeacherById(id: string): Promise<Teacher> {
    const client = getDbClient();

    const { data: teacher } = await client
      .from('teachers')
      .select(`
        id,
        name,
        created_at,
        updated_at,
        student_teacher_subjects!left(
          teacher_id,
          subject_id,
          student_id,
          is_active,
          subjects:subject_id(id, name)
        )
      `)
      .eq('id', id)
      .single();

    if (!teacher) {
      throw createGraphQLError('Teacher not found');
    }

    return this.mapToTeacher(teacher);
  }
}

export const teacherService = new TeacherService();