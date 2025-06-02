import { getDbClient } from '../utils/database';
import { createGraphQLError } from '../utils/errors';
import { supabaseAdmin } from '../lib/supabase';

interface ImportRecord {
  student: string;
  email: string;
  password: string;
  teacher: string;
  subject: string;
}

interface ImportStats {
  totalRecords: number;
  newStudents: number;
  newTeachers: number;
  newSubjects: number;
  updatedRecords: number;
  duplicatesSkipped: number;
  errors: string[];
}

export class ImportService {
  parseImportData(data: string): ImportRecord[] {
    const lines = data.trim().split('\n');
    const records: ImportRecord[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || (i === 0 && line.toUpperCase().includes('ZAK;EMAIL;HESLO;UCITEL;PREDMET'))) {
        continue;
      }
      
      const parts = line.split(';').map(p => p.trim());
      if (parts.length !== 5) {
        throw new Error(`Invalid line format at line ${i + 1}: "${line}". Expected 5 fields (ZAK;EMAIL;HESLO;UCITEL;PREDMET), got ${parts.length}`);
      }
      
      records.push({
        student: parts[0],
        email: parts[1],
        password: parts[2],
        teacher: parts[3],
        subject: parts[4]
      });
    }
    
    return records;
  }

  async clearAllData() {
    const client = getDbClient();
    
    // First get all student emails to delete their auth accounts
    const { data: students } = await client
      .from('students')
      .select('email')
      .not('email', 'is', null);
    
    // Delete student auth accounts and their profiles in parallel with table deletions
    const authDeletionPromise = (async () => {
      if (students && students.length > 0 && supabaseAdmin) {
        console.log(`Deleting auth accounts for ${students.length} students...`);
        
        // Get all auth users once
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({
          perPage: 1000
        });
        
        // Create a map of emails to user IDs for faster lookup
        const emailToUserId = new Map<string, string>();
        users.forEach(user => {
          if (user.email) {
            emailToUserId.set(user.email, user.id);
          }
        });
        
        // Collect all user IDs to delete
        const userIdsToDelete: string[] = [];
        students.forEach(student => {
          if (student.email) {
            const userId = emailToUserId.get(student.email);
            if (userId) {
              userIdsToDelete.push(userId);
            }
          }
        });
        
        // Delete profiles in batch
        if (userIdsToDelete.length > 0) {
          await client.from('profiles').delete().in('id', userIdsToDelete);
          
          // Delete auth users in parallel batches of 10
          const batchSize = 10;
          for (let i = 0; i < userIdsToDelete.length; i += batchSize) {
            const batch = userIdsToDelete.slice(i, i + batchSize);
            await Promise.all(
              batch.map(userId => 
                supabaseAdmin!.auth.admin.deleteUser(userId).catch(error => 
                  console.error(`Failed to delete auth user ${userId}:`, error)
                )
              )
            );
          }
        }
      }
    })();
    
    // Delete database records in parallel with auth deletion
    const dbDeletionPromise = (async () => {
      // Delete in correct order due to foreign keys
      await client.from('student_teacher_subjects').delete().gte('id', '00000000-0000-0000-0000-000000000000');
      await client.from('students').delete().gte('id', '00000000-0000-0000-0000-000000000000');
      await client.from('teachers').delete().gte('id', '00000000-0000-0000-0000-000000000000');
      await client.from('subjects').delete().gte('id', '00000000-0000-0000-0000-000000000000');
    })();
    
    // Wait for both operations to complete
    await Promise.all([authDeletionPromise, dbDeletionPromise]);
  }

  async exportData() {
    const client = getDbClient();
    
    // First get the total count
    const { count } = await client
      .from('student_teacher_subjects')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
      
    console.log(`Total records to export: ${count}`);
    
    // Fetch all records in batches of 1000
    const allData = [];
    const batchSize = 1000;
    
    for (let offset = 0; offset < (count || 0); offset += batchSize) {
      const { data, error } = await client
        .from('student_teacher_subjects')
        .select(`
          student:students(name, email),
          teacher:teachers(name),
          subject:subjects(name)
        `)
        .eq('is_active', true)
        .range(offset, offset + batchSize - 1)
        .order('id');
        
      if (error) throw error;
      if (data) allData.push(...data);
      
      console.log(`Fetched ${offset + data.length} / ${count} records`);
    }
    
    if (allData.length === 0) {
      return 'ZAK;EMAIL;UCITEL;PREDMET\n# No data to export';
    }
    
    const header = 'ZAK;EMAIL;UCITEL;PREDMET';
    const rows = allData.map((row: any) => 
      `${row.student.name};${row.student.email || ''};${row.teacher.name};${row.subject.name}`
    );
    
    console.log(`Exporting ${allData.length} records`);
    return [header, ...rows].join('\n');
  }

  async importData(data: string, mode: 'REPLACE' | 'ADD', userId: string): Promise<ImportStats & { success: boolean; message: string }> {
    const stats: ImportStats = {
      totalRecords: 0,
      newStudents: 0,
      newTeachers: 0,
      newSubjects: 0,
      updatedRecords: 0,
      duplicatesSkipped: 0,
      errors: []
    };
    
    try {
      
      const records = this.parseImportData(data);
      stats.totalRecords = records.length;
      
      const client = getDbClient();
      
      if (mode === 'REPLACE') {
        await this.clearAllData();
      }
      
      // Extract unique students (by email), teachers, and subjects
      const studentsByEmail = new Map<string, { name: string; email: string; password: string }>();
      records.forEach(r => {
        if (!studentsByEmail.has(r.email)) {
          studentsByEmail.set(r.email, { name: r.student, email: r.email, password: r.password });
        }
      });
      
      const uniqueTeachers = [...new Set(records.map(r => r.teacher))];
      const uniqueSubjects = [...new Set(records.map(r => r.subject))];
      
      // Load existing data
      const [existingStudents, existingTeachers, existingSubjects] = await Promise.all([
        client.from('students').select('id, name, email'),
        client.from('teachers').select('id, name'),
        client.from('subjects').select('id, name')
      ]);
      
      // Create maps for existing data
      const studentMapByEmail = new Map(existingStudents.data?.map(s => [s.email, s.id]) || []);
      const studentMapByName = new Map(existingStudents.data?.map(s => [s.name, s.id]) || []);
      const teacherMap = new Map(existingTeachers.data?.map(t => [t.name, t.id]) || []);
      const subjectMap = new Map(existingSubjects.data?.map(s => [s.name, s.id]) || []);
      
      // Prepare new entities to insert
      const newStudents = Array.from(studentsByEmail.entries())
        .filter(([email]) => !studentMapByEmail.has(email))
        .map(([email, data]) => ({ name: data.name, email: data.email }));
      const newTeachers = uniqueTeachers.filter(t => !teacherMap.has(t)).map(name => ({ name }));
      const newSubjects = uniqueSubjects.filter(s => !subjectMap.has(s)).map(name => ({ name }));
      
      // Collect student login data for later
      const studentLogins = Array.from(studentsByEmail.entries()).map(([email, data]) => ({
        email: data.email,
        password: data.password
      }));
      

      // Batch insert new entities
      if (newStudents.length > 0) {
        const { data: insertedStudents, error } = await client
          .from('students')
          .insert(newStudents)
          .select('id, name, email');
        
        if (error) throw error;
        insertedStudents?.forEach(s => {
          studentMapByEmail.set(s.email, s.id);
          studentMapByName.set(s.name, s.id);
        });
        stats.newStudents = newStudents.length;
      }
      
      if (newTeachers.length > 0) {
        const { data: insertedTeachers, error } = await client
          .from('teachers')
          .insert(newTeachers)
          .select('id, name');
        
        if (error) throw error;
        insertedTeachers?.forEach(t => teacherMap.set(t.name, t.id));
        stats.newTeachers = newTeachers.length;
      }
      
      if (newSubjects.length > 0) {
        const { data: insertedSubjects, error } = await client
          .from('subjects')
          .insert(newSubjects)
          .select('id, name');
        
        if (error) throw error;
        insertedSubjects?.forEach(s => subjectMap.set(s.name, s.id));
        stats.newSubjects = newSubjects.length;
      }
      
      // Load ALL existing relationships to avoid duplicates
      const relationshipSet = new Set<string>();
      
      // First get the count of existing relationships
      const { count: relCount } = await client
        .from('student_teacher_subjects')
        .select('*', { count: 'exact', head: true });
        
      console.log(`Loading ${relCount} existing relationships...`);
      
      // Load all relationships in batches
      for (let offset = 0; offset < (relCount || 0); offset += 1000) {
        const { data: batch } = await client
          .from('student_teacher_subjects')
          .select('student_id, teacher_id, subject_id')
          .range(offset, offset + 999);
          
        if (batch) {
          batch.forEach(r => {
            relationshipSet.add(`${r.student_id}-${r.teacher_id}-${r.subject_id}`);
          });
        }
      }
      
      console.log(`Loaded ${relationshipSet.size} existing relationships`);
      
      // Prepare relationships to insert
      const newRelationships = [];
      for (const record of records) {
        const studentId = studentMapByEmail.get(record.email);
        const teacherId = teacherMap.get(record.teacher);
        const subjectId = subjectMap.get(record.subject);
        
        if (!studentId || !teacherId || !subjectId) {
          stats.errors.push(`Missing IDs for record: ${record.student}(${record.email})-${record.teacher}-${record.subject}`);
          continue;
        }
        
        const key = `${studentId}-${teacherId}-${subjectId}`;
        if (!relationshipSet.has(key)) {
          newRelationships.push({
            student_id: studentId,
            teacher_id: teacherId,
            subject_id: subjectId,
            is_active: true
          });
          relationshipSet.add(key);
        } else {
          stats.duplicatesSkipped++;
        }
      }
      
      // Insert relationships
      if (newRelationships.length > 0) {

        // Insert in chunks of 1000 to avoid hitting limits
        const chunkSize = 1000;
        for (let i = 0; i < newRelationships.length; i += chunkSize) {
          const chunk = newRelationships.slice(i, i + chunkSize);
          const { error } = await client
            .from('student_teacher_subjects')
            .insert(chunk);
          
          if (error) {
            stats.errors.push(`Error inserting relationships batch ${i / chunkSize + 1}: ${error.message}`);
          } else {
            stats.updatedRecords += chunk.length;
          }
          
        }
      }
      
      // Create auth accounts
      if (studentLogins.length > 0) {
        console.log(`Creating auth accounts for ${studentLogins.length} students...`);
        
        if (!supabaseAdmin) {
          throw new Error('Supabase admin client not initialized');
        }
        
        // Check existing auth users first to avoid unnecessary API calls
        const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers({
          perPage: 1000
        });
        
        const existingEmails = new Set(existingUsers.map(u => u.email).filter(Boolean));
        const loginsToCreate = studentLogins.filter(login => !existingEmails.has(login.email));
        
        console.log(`${studentLogins.length - loginsToCreate.length} students already have auth accounts, creating ${loginsToCreate.length} new accounts...`);
        
        // Process in larger batches - Supabase can handle more than 10
        const batchSize = 50; // Increased from 10 to 50
        const createdUsers: Array<{ id: string; email: string }> = [];
        
        for (let i = 0; i < loginsToCreate.length; i += batchSize) {
          const batch = loginsToCreate.slice(i, i + batchSize);
          
          const results = await Promise.allSettled(
            batch.map(async (login) => {
              try {
                const { data: newUser, error: createError } = await supabaseAdmin!.auth.admin.createUser({
                  email: login.email,
                  password: login.password,
                  email_confirm: true,
                  user_metadata: {
                    role: 'STUDENT'
                  }
                });
                
                if (createError && !createError.message.includes('already been registered')) {
                  stats.errors.push(`Failed to create auth user for ${login.email}: ${createError.message}`);
                  return null;
                } else if (newUser && newUser.user) {
                  createdUsers.push({ id: newUser.user.id, email: login.email });
                  return { id: newUser.user.id, email: login.email };
                }
                return null;
              } catch (error: any) {
                stats.errors.push(`Error processing auth for ${login.email}: ${error.message}`);
                return null;
              }
            })
          );
          
          console.log(`Processed auth accounts: ${Math.min(i + batchSize, loginsToCreate.length)} / ${loginsToCreate.length}`);
        }
        
        // Batch create all profiles at once
        if (createdUsers.length > 0) {
          console.log(`Creating ${createdUsers.length} profiles...`);
          
          const profiles = createdUsers.map(user => ({
            id: user.id,
            email: user.email,
            role: 'STUDENT',
            first_name: studentsByEmail.get(user.email)?.name.split(' ')[0] || '',
            last_name: studentsByEmail.get(user.email)?.name.split(' ').slice(1).join(' ') || ''
          }));
          
          // Insert profiles in chunks of 100
          for (let i = 0; i < profiles.length; i += 100) {
            const chunk = profiles.slice(i, i + 100);
            const { error: profileError } = await client
              .from('profiles')
              .insert(chunk)
              .select();
            
            if (profileError && !profileError.message.includes('duplicate key')) {
              stats.errors.push(`Failed to create profiles batch: ${profileError.message}`);
            }
          }
        }
      }
      
      // Record import history
      await client
        .from('import_history')
        .insert({
          imported_by: userId,
          total_records: stats.totalRecords,
          new_students: stats.newStudents,
          new_teachers: stats.newTeachers,
          new_subjects: stats.newSubjects,
          updated_records: stats.updatedRecords,
          status: stats.errors.length > 0 ? 'completed_with_errors' : 'completed',
          error_details: stats.errors.length > 0 ? { errors: stats.errors } : null
        });
      
      return {
        success: true,
        message: mode === 'REPLACE' 
          ? 'Data byla úspěšně nahrazena' 
          : 'Data byla úspěšně přidána',
        ...stats
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Import failed: ${error.message}`,
        ...stats,
        errors: [...stats.errors, error.message]
      };
    }
  }

  async deleteAllData(userId: string): Promise<ImportStats & { success: boolean; message: string }> {
    const stats: ImportStats = {
      totalRecords: 0,
      newStudents: 0,
      newTeachers: 0,
      newSubjects: 0,
      updatedRecords: 0,
      duplicatesSkipped: 0,
      errors: []
    };
    
    try {
      const client = getDbClient();
      
      // Get counts before deletion
      const [relCount, studentCount, teacherCount, subjectCount] = await Promise.all([
        client.from('student_teacher_subjects').select('*', { count: 'exact', head: true }),
        client.from('students').select('*', { count: 'exact', head: true }),
        client.from('teachers').select('*', { count: 'exact', head: true }),
        client.from('subjects').select('*', { count: 'exact', head: true })
      ]);
      
      // Delete all data
      await this.clearAllData();
      
      // Record deletion in import history
      await client
        .from('import_history')
        .insert({
          imported_by: userId,
          total_records: 0,
          new_students: 0,
          new_teachers: 0,
          new_subjects: 0,
          updated_records: 0,
          status: 'data_cleared',
          error_details: {
            deleted: {
              relationships: relCount.count || 0,
              students: studentCount.count || 0,
              teachers: teacherCount.count || 0,
              subjects: subjectCount.count || 0
            }
          }
        });
      
      return {
        success: true,
        message: `Smazáno: ${relCount.count || 0} vztahů, ${studentCount.count || 0} studentů, ${teacherCount.count || 0} učitelů, ${subjectCount.count || 0} předmětů`,
        ...stats
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Mazání selhalo: ${error.message}`,
        ...stats,
        errors: [error.message]
      };
    }
  }
}

export const importService = new ImportService();