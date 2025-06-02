import { getDbClient } from '../utils/database';
import { createGraphQLError, handleDatabaseError } from '../utils/errors';
import { getPaginationParams, createPaginatedResult } from '../utils/pagination';

interface Subject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export class SubjectService {
  async listSubjects(index: number, nameFilter?: string) {
    const client = getDbClient();
    const { offset, limit } = getPaginationParams(index);

    let query = client
      .from('subjects')
      .select('*', { count: 'exact' });

    if (nameFilter) {
      query = query.ilike('name', `%${nameFilter}%`);
    }

    const { data: subjects, error, count } = await query
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      handleDatabaseError(error, 'fetch subjects');
    }

    const mappedSubjects = subjects?.map(this.mapToSubject) || [];
    const result = createPaginatedResult(mappedSubjects, count || 0, index);

    return {
      subjects: result.items,
      total: result.total,
      hasMore: result.hasMore
    };
  }

  async createSubject(name: string) {
    const client = getDbClient();

    // Check if subject with same name already exists
    const { data: existing } = await client
      .from('subjects')
      .select('id')
      .eq('name', name)
      .single();

    if (existing) {
      return {
        success: false,
        message: `Předmět s názvem "${name}" již existuje`,
        subject: null
      };
    }

    const { data: subject, error } = await client
      .from('subjects')
      .insert({ name })
      .select()
      .single();

    if (error) {
      handleDatabaseError(error, 'create subject');
    }

    return {
      success: true,
      message: 'Předmět byl úspěšně vytvořen',
      subject: this.mapToSubject(subject)
    };
  }

  async updateSubject(id: string, name: string) {
    const client = getDbClient();

    // Check if subject exists
    const { data: existingSubject } = await client
      .from('subjects')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingSubject) {
      return {
        success: false,
        message: 'Předmět nenalezen',
        subject: null
      };
    }

    // Check if another subject with the same name exists
    const { data: duplicateSubject } = await client
      .from('subjects')
      .select('id')
      .eq('name', name)
      .neq('id', id)
      .single();

    if (duplicateSubject) {
      return {
        success: false,
        message: `Předmět s názvem "${name}" již existuje`,
        subject: null
      };
    }

    // Update the subject
    const { data: updatedSubject, error } = await client
      .from('subjects')
      .update({ name })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      handleDatabaseError(error, 'update subject');
    }

    return {
      success: true,
      message: 'Předmět byl úspěšně aktualizován',
      subject: this.mapToSubject(updatedSubject)
    };
  }

  async deleteSubject(id: string) {
    const client = getDbClient();

    // Get subject details before deletion
    const { data: subject } = await client
      .from('subjects')
      .select('*')
      .eq('id', id)
      .single();

    if (!subject) {
      return {
        success: false,
        message: 'Předmět nenalezen',
        subject: null
      };
    }

    // Delete the subject (cascade will handle related records)
    const { error } = await client
      .from('subjects')
      .delete()
      .eq('id', id);

    if (error) {
      handleDatabaseError(error, 'delete subject');
    }

    return {
      success: true,
      message: 'Předmět byl úspěšně smazán',
      subject: this.mapToSubject(subject)
    };
  }

  async deleteSubjects(ids: string[]) {
    const client = getDbClient();

    const { error } = await client
      .from('subjects')
      .delete()
      .in('id', ids);

    if (error) {
      handleDatabaseError(error, 'delete subjects');
    }

    return {
      success: true,
      message: `${ids.length} předmětů bylo úspěšně smazáno`,
      subject: null
    };
  }

  private mapToSubject(subject: any): Subject {
    return {
      id: subject.id,
      name: subject.name,
      createdAt: subject.created_at,
      updatedAt: subject.updated_at
    };
  }
}

export const subjectService = new SubjectService();