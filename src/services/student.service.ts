import { getDbClient } from '../utils/database';
import { createGraphQLError, handleDatabaseError } from '../utils/errors';
import { getPaginationParams, createPaginatedResult, ITEMS_PER_PAGE } from '../utils/pagination';
import { supabaseAdmin } from '../lib/supabase';

interface StudentSubject {
  subject: {
    id: string;
    name: string;
  };
  teacher: {
    id: string;
    name: string;
  };
}

interface Student {
  id: string;
  name: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
  subjects: StudentSubject[];
}

interface CreateStudentAssignment {
  subjectId: string;
  teacherId: string;
}

export class StudentService {
  async listStudents(index: number, nameFilter?: string, teacherFilter?: string, subjectFilter?: string) {
    const client = getDbClient();
    const { offset, limit } = getPaginationParams(index);

    // Build the query with proper joins to fetch everything in one go
    let query = client
      .from('students')
      .select(`
        id,
        name,
        email,
        created_at,
        updated_at,
        student_teacher_subjects!left(
          teacher_id,
          subject_id,
          is_active,
          teachers:teacher_id(id, name),
          subjects:subject_id(id, name)
        )
      `, { count: 'exact' });

    // Apply name filter
    if (nameFilter) {
      query = query.ilike('name', `%${nameFilter}%`);
    }

    // For teacher/subject filters, we need to filter after fetching due to Supabase limitations
    if (teacherFilter || subjectFilter) {
      // Fetch all students with their relationships
      const { data: allStudents, error: fetchError, count } = await query
        .order('name', { ascending: true });

      if (fetchError) {
        handleDatabaseError(fetchError, 'fetch students');
      }

      // Filter students based on teacher/subject filters
      let filteredStudents = (allStudents || []).filter(student => {
        const activeRelationships = student.student_teacher_subjects?.filter(
          (rel: any) => rel.is_active
        ) || [];

        if (activeRelationships.length === 0) return false;

        let matchesTeacher = !teacherFilter;
        let matchesSubject = !subjectFilter;

        for (const rel of activeRelationships) {
          if (teacherFilter && !matchesTeacher) {
            matchesTeacher = (rel.teachers as any)?.name?.toLowerCase().includes(teacherFilter.toLowerCase());
          }
          if (subjectFilter && !matchesSubject) {
            matchesSubject = (rel.subjects as any)?.name?.toLowerCase().includes(subjectFilter.toLowerCase());
          }
          if (matchesTeacher && matchesSubject) break;
        }

        return matchesTeacher && matchesSubject;
      });

      // Apply pagination
      const total = filteredStudents.length;
      const paginatedStudents = filteredStudents.slice(offset, offset + limit);
      const result = createPaginatedResult(paginatedStudents, total, index);

      // Transform the data
      const studentsWithSubjects = paginatedStudents.map(student => this.mapToStudent(student));

      return {
        students: studentsWithSubjects,
        total: result.total,
        hasMore: result.hasMore
      };
    }

    // No filters, use standard pagination
    const { data: students, error, count } = await query
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      handleDatabaseError(error, 'fetch students');
    }

    const mappedStudents = (students || []).map(student => this.mapToStudent(student));
    const result = createPaginatedResult(mappedStudents, count || 0, index);

    return {
      students: result.items,
      total: result.total,
      hasMore: result.hasMore
    };
  }

  async createStudent(name: string, email?: string, password?: string, assignments?: CreateStudentAssignment[]) {
    const client = getDbClient();

    // Check if student with same name or email already exists
    if (email) {
      const { data: existingByEmail } = await client
        .from('students')
        .select('id')
        .eq('email', email)
        .single();

      if (existingByEmail) {
        return {
          success: false,
          message: `Student s emailem "${email}" již existuje`,
          student: null
        };
      }
    }
    
    const { data: existingByName } = await client
      .from('students')
      .select('id')
      .eq('name', name)
      .single();

    if (existingByName) {
      return {
        success: false,
        message: `Student se jménem "${name}" již existuje`,
        student: null
      };
    }

    const { data: student, error } = await client
      .from('students')
      .insert({ name, email })
      .select()
      .single();

    if (error) {
      handleDatabaseError(error, 'create student');
    }

    // Create assignments if provided
    if (assignments && assignments.length > 0) {
      const assignmentRecords = assignments.map(assignment => ({
        student_id: student.id,
        subject_id: assignment.subjectId,
        teacher_id: assignment.teacherId || null, // Allow null teacher_id
        is_active: true
      }));

      const { error: assignmentError } = await client
        .from('student_teacher_subjects')
        .insert(assignmentRecords);

      if (assignmentError) {
        // Rollback student creation if assignments fail
        await client.from('students').delete().eq('id', student.id);
        handleDatabaseError(assignmentError, 'create assignments');
      }
    }

    // Create auth account if email and password provided
    if (email && password && supabaseAdmin) {
      try {
        // First check if auth user already exists
        const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers({
          filter: `email.eq.${email}`,
          perPage: 1
        });

        if (existingUsers && existingUsers.length > 0) {
          // Rollback student creation
          await client.from('students').delete().eq('id', student.id);
          return {
            success: false,
            message: `Uživatel s emailem ${email} již existuje v systému`,
            student: null
          };
        }

        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            role: 'STUDENT'
          }
        });

        if (authError) {
          // Rollback student creation
          await client.from('students').delete().eq('id', student.id);
          return {
            success: false,
            message: `Nepodařilo se vytvořit autentizační účet: ${authError.message}`,
            student: null
          };
        }

        // Update profile with additional info (profile already created by trigger)
        if (authUser?.user) {
          const { error: profileError } = await client
            .from('profiles')
            .update({
              first_name: name.split(' ')[0] || '',
              last_name: name.split(' ').slice(1).join(' ') || ''
            })
            .eq('id', authUser.user.id);

          if (profileError) {
            console.error('Failed to update profile:', profileError);
            // Don't fail the whole operation if profile update fails
          }
        }
      } catch (error: any) {
        // Rollback student creation
        await client.from('students').delete().eq('id', student.id);
        return {
          success: false,
          message: `Chyba při vytváření účtu: ${error.message}`,
          student: null
        };
      }
    }

    // Fetch student with subjects for response
    const { data: relationships } = await client
      .from('student_teacher_subjects')
      .select(`
        teacher_id,
        subject_id,
        teachers:teacher_id(id, name),
        subjects:subject_id(id, name)
      `)
      .eq('student_id', student.id)
      .eq('is_active', true);

    return {
      success: true,
      message: 'Student byl úspěšně vytvořen',
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        createdAt: student.created_at,
        updatedAt: student.updated_at,
        subjects: relationships?.map(rel => ({
          subject: {
            id: (rel.subjects as any).id,
            name: (rel.subjects as any).name
          },
          teacher: rel.teachers ? {
            id: (rel.teachers as any).id,
            name: (rel.teachers as any).name
          } : null
        })) || []
      }
    };
  }

  async updateStudent(id: string, name: string, email?: string, password?: string, assignments?: CreateStudentAssignment[]) {
    const client = getDbClient();

    // Check if student exists
    const { data: existingStudent } = await client
      .from('students')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingStudent) {
      return {
        success: false,
        message: 'Student nenalezen',
        student: null
      };
    }

    // Check if another student with the same name or email exists
    const { data: duplicateByName } = await client
      .from('students')
      .select('id')
      .eq('name', name)
      .neq('id', id)
      .single();

    if (duplicateByName) {
      return {
        success: false,
        message: `Student se jménem "${name}" již existuje`,
        student: null
      };
    }
    
    if (email) {
      const { data: duplicateByEmail } = await client
        .from('students')
        .select('id')
        .eq('email', email)
        .neq('id', id)
        .single();

      if (duplicateByEmail) {
        return {
          success: false,
          message: `Student s emailem "${email}" již existuje`,
          student: null
        };
      }
    }

    // Update student name and email
    const updateData: any = { name };
    if (email !== undefined) {
      updateData.email = email;
    }
    
    const { data: updatedStudent, error } = await client
      .from('students')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      handleDatabaseError(error, 'update student');
    }

    // Update auth account if email or password changed
    if ((email !== undefined || password !== undefined) && supabaseAdmin) {
      try {
        // First check if student already has an auth account
        let authUserId: string | null = null;
        
        if (existingStudent.email) {
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({
            filter: `email.eq.${existingStudent.email}`,
            perPage: 1
          });
          
          if (users && users.length > 0) {
            authUserId = users[0].id;
          }
        }
        
        if (authUserId) {
          // Update existing auth account
          const updateAuthData: any = {};
          if (email !== undefined && email !== existingStudent.email) {
            updateAuthData.email = email;
          }
          if (password !== undefined) {
            updateAuthData.password = password;
          }
          
          if (Object.keys(updateAuthData).length > 0) {
            const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
              authUserId,
              updateAuthData
            );
            
            if (updateAuthError) {
              // Rollback student update
              await client.from('students').update({ name: existingStudent.name, email: existingStudent.email }).eq('id', id);
              return {
                success: false,
                message: `Nepodařilo se aktualizovat autentizační účet: ${updateAuthError.message}`,
                student: null
              };
            }
            
            // Update profile email if changed
            if (email !== undefined && email !== existingStudent.email) {
              await client.from('profiles').update({ email }).eq('id', authUserId);
            }
          }
        } else if (email && password) {
          // Create new auth account if doesn't exist
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              role: 'STUDENT'
            }
          });

          if (authError) {
            // Rollback student update
            await client.from('students').update({ name: existingStudent.name, email: existingStudent.email }).eq('id', id);
            return {
              success: false,
              message: `Nepodařilo se vytvořit autentizační účet: ${authError.message}`,
              student: null
            };
          }

          // Update profile with additional info (profile already created by trigger)
          if (authUser?.user) {
            const { error: profileError } = await client
              .from('profiles')
              .update({
                first_name: name.split(' ')[0] || '',
                last_name: name.split(' ').slice(1).join(' ') || ''
              })
              .eq('id', authUser.user.id);

            if (profileError) {
              console.error('Failed to update profile:', profileError);
              // Don't fail the whole operation if profile update fails
            }
          }
        }
      } catch (error: any) {
        // Rollback student update
        await client.from('students').update({ name: existingStudent.name, email: existingStudent.email }).eq('id', id);
        return {
          success: false,
          message: `Chyba při aktualizaci účtu: ${error.message}`,
          student: null
        };
      }
    }

    // Handle assignments update
    if (assignments !== undefined) {
      // First, deactivate all existing assignments
      const { error: deactivateError } = await client
        .from('student_teacher_subjects')
        .update({ is_active: false })
        .eq('student_id', id);

      if (deactivateError) {
        handleDatabaseError(deactivateError, 'deactivate assignments');
      }

      // Then, create or reactivate new assignments
      if (assignments.length > 0) {
        for (const assignment of assignments) {
          // Check if this relationship already exists
          const { data: existingRel } = await client
            .from('student_teacher_subjects')
            .select('id')
            .eq('student_id', id)
            .eq('subject_id', assignment.subjectId)
            .eq('teacher_id', assignment.teacherId || null)
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
                student_id: id,
                subject_id: assignment.subjectId,
                teacher_id: assignment.teacherId || null,
                is_active: true
              });
          }
        }
      }
    }

    // Fetch updated student with subjects for response
    const { data: relationships } = await client
      .from('student_teacher_subjects')
      .select(`
        teacher_id,
        subject_id,
        teachers:teacher_id(id, name),
        subjects:subject_id(id, name)
      `)
      .eq('student_id', id)
      .eq('is_active', true);

    return {
      success: true,
      message: 'Student byl úspěšně aktualizován',
      student: {
        id: updatedStudent.id,
        name: updatedStudent.name,
        email: updatedStudent.email,
        createdAt: updatedStudent.created_at,
        updatedAt: updatedStudent.updated_at,
        subjects: relationships?.map(rel => ({
          subject: {
            id: (rel.subjects as any).id,
            name: (rel.subjects as any).name
          },
          teacher: rel.teachers ? {
            id: (rel.teachers as any).id,
            name: (rel.teachers as any).name
          } : null
        })) || []
      }
    };
  }

  async deleteStudent(id: string) {
    const client = getDbClient();

    // Get student details before deletion
    const { data: student } = await client
      .from('students')
      .select('*')
      .eq('id', id)
      .single();

    if (!student) {
      return {
        success: false,
        message: 'Student nenalezen',
        student: null
      };
    }

    // Delete auth account if exists
    if (student.email && supabaseAdmin) {
      try {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({
          filter: `email.eq.${student.email}`,
          perPage: 1
        });
        
        if (users && users.length > 0) {
          const authUserId = users[0].id;
          
          // Delete profile first
          await client.from('profiles').delete().eq('id', authUserId);
          
          // Then delete auth user
          await supabaseAdmin.auth.admin.deleteUser(authUserId);
        }
      } catch (error: any) {
        console.error(`Failed to delete auth account for student ${student.email}:`, error);
        // Continue with student deletion even if auth deletion fails
      }
    }

    // Delete the student (cascade will handle related records)
    const { error } = await client
      .from('students')
      .delete()
      .eq('id', id);

    if (error) {
      handleDatabaseError(error, 'delete student');
    }

    return {
      success: true,
      message: 'Student byl úspěšně smazán',
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        createdAt: student.created_at,
        updatedAt: student.updated_at,
        subjects: []
      }
    };
  }

  async deleteStudents(ids: string[]) {
    const client = getDbClient();

    const { error } = await client
      .from('students')
      .delete()
      .in('id', ids);

    if (error) {
      handleDatabaseError(error, 'delete students');
    }

    return {
      success: true,
      message: `${ids.length} studentů bylo úspěšně smazáno`,
      student: null
    };
  }

  async getAssignmentData() {
    const client = getDbClient();

    // Get all subjects
    const { data: subjects, error: subjectsError } = await client
      .from('subjects')
      .select('*')
      .order('name');

    if (subjectsError) {
      handleDatabaseError(subjectsError, 'fetch subjects');
    }

    // Get all students with their subjects
    const { data: students, error: studentsError } = await client
      .from('students')
      .select(`
        id,
        name,
        student_teacher_subjects!left(
          subject_id
        )
      `)
      .order('name');

    if (studentsError) {
      handleDatabaseError(studentsError, 'fetch students');
    }

    // Transform students data to include subject details
    const studentsWithSubjects = await Promise.all(
      (students || []).map(async (student) => {
        const subjectIds = student.student_teacher_subjects ? [...new Set(student.student_teacher_subjects.map((sts: any) => sts.subject_id))] : [];
        const studentSubjects = subjects?.filter(s => subjectIds.includes(s.id)) || [];
        
        return {
          id: student.id,
          name: student.name,
          subjects: studentSubjects.map(s => ({
            id: s.id,
            name: s.name,
            createdAt: s.created_at,
            updatedAt: s.updated_at
          }))
        };
      })
    );

    return {
      subjects: subjects?.map(s => ({
        id: s.id,
        name: s.name,
        createdAt: s.created_at,
        updatedAt: s.updated_at
      })) || [],
      students: studentsWithSubjects
    };
  }

  async getStudentAssignmentData() {
    const client = getDbClient();

    // Get all subjects with their teachers
    const { data: subjects, error: subjectsError } = await client
      .from('subjects')
      .select(`
        id,
        name,
        student_teacher_subjects!left(
          teacher_id,
          teachers:teacher_id(id, name)
        )
      `)
      .order('name');

    if (subjectsError) {
      handleDatabaseError(subjectsError, 'fetch subjects');
    }

    // Transform subjects data to include unique teachers for each subject
    const subjectsWithTeachers = (subjects || []).map(subject => {
      const teacherMap = new Map();
      
      subject.student_teacher_subjects?.forEach((rel: any) => {
        if (rel.teachers && !teacherMap.has(rel.teachers.id)) {
          teacherMap.set(rel.teachers.id, {
            id: rel.teachers.id,
            name: rel.teachers.name
          });
        }
      });

      return {
        id: subject.id,
        name: subject.name,
        teachers: Array.from(teacherMap.values())
      };
    });

    return {
      subjects: subjectsWithTeachers
    };
  }

  private mapToStudent(student: any): Student {
    return {
      id: student.id,
      name: student.name,
      email: student.email,
      createdAt: student.created_at,
      updatedAt: student.updated_at,
      subjects: (student.student_teacher_subjects || [])
        .filter((rel: any) => rel.is_active)
        .map((rel: any) => ({
          subject: {
            id: (rel.subjects as any).id,
            name: (rel.subjects as any).name
          },
          teacher: rel.teachers ? {
            id: (rel.teachers as any).id,
            name: (rel.teachers as any).name
          } : null
        }))
    };
  }
}

export const studentService = new StudentService();