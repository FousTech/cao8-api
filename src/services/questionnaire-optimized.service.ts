import { getDbClient } from '../utils/database'
import { CustomError } from '../utils/errors'

export class QuestionnaireOptimizedService {
  private supabase = getDbClient()

  /**
   * Optimized version that uses RPC functions for better performance
   */
  async getAssignmentDataOptimized(): Promise<any> {
    // Use parallel queries instead of sequential
    const [subjectsResult, teachersResult, studentsResult] = await Promise.all([
      this.supabase.from('subjects').select('*').order('name'),
      this.supabase.from('teachers').select('*').order('name'),
      this.supabase.from('students').select('*').order('name')
    ])

    if (subjectsResult.error) throw new CustomError('Failed to fetch subjects', 500, subjectsResult.error.message)
    if (teachersResult.error) throw new CustomError('Failed to fetch teachers', 500, teachersResult.error.message)
    if (studentsResult.error) throw new CustomError('Failed to fetch students', 500, studentsResult.error.message)

    // Fetch assignments with only IDs to reduce payload
    const allAssignments: any[] = []
    const batchSize = 5000 // Increase batch size
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: batchAssignments, error: assignmentsError, count } = await this.supabase
        .from('student_teacher_subjects')
        .select(`
          id,
          student_id,
          teacher_id,
          subject_id
        `, { count: 'exact' })
        .eq('is_active', true)
        .range(offset, offset + batchSize - 1)
        .order('id')

      if (assignmentsError) {
        throw new CustomError('Failed to fetch assignments', 500, assignmentsError.message)
      }

      if (batchAssignments && batchAssignments.length > 0) {
        allAssignments.push(...batchAssignments)
      }

      hasMore = Boolean(batchAssignments && batchAssignments.length === batchSize && count && count > offset + batchSize)
      offset += batchSize
    }

    // Map assignments on the client side to avoid data duplication
    const subjectsMap = new Map(subjectsResult.data.map(s => [s.id, s]))
    const teachersMap = new Map(teachersResult.data.map(t => [t.id, t]))
    const studentsMap = new Map(studentsResult.data.map(s => [s.id, s]))

    const mappedAssignments = allAssignments.map(a => ({
      id: a.id,
      student: studentsMap.get(a.student_id),
      teacher: a.teacher_id ? teachersMap.get(a.teacher_id) : null,
      subject: subjectsMap.get(a.subject_id)
    })).filter(a => a.student && a.subject) // Filter out invalid assignments

    return {
      subjects: subjectsResult.data || [],
      teachers: teachersResult.data || [],
      students: studentsResult.data || [],
      assignments: mappedAssignments
    }
  }

  /**
   * Get questionnaire with optimized assignment loading
   */
  async getQuestionnaireOptimized(id: string): Promise<any> {
    // Fetch questionnaire and questions in parallel with assignment IDs
    const [questionnaireResult, assignmentIdsResult] = await Promise.all([
      this.supabase
        .from('questionnaires')
        .select(`
          *,
          questions:questions(
            *,
            options:question_options(*)
          )
        `)
        .eq('id', id)
        .order('order_index', { foreignTable: 'questions', ascending: true })
        .order('order_index', { foreignTable: 'questions.options', ascending: true })
        .single(),
      
      // Get just the assignment IDs first
      this.supabase
        .from('questionnaire_assignments')
        .select('student_teacher_subject_id')
        .eq('questionnaire_id', id)
    ])

    if (questionnaireResult.error) {
      if (questionnaireResult.error.code === 'PGRST116') return null
      throw new CustomError('Failed to fetch questionnaire', 500, questionnaireResult.error.message)
    }

    if (assignmentIdsResult.error) {
      throw new CustomError('Failed to fetch assignments', 500, assignmentIdsResult.error.message)
    }

    const assignmentIds = assignmentIdsResult.data.map(a => a.student_teacher_subject_id)
    
    // If there are assignments, fetch the details in batches
    let assignments: any[] = []
    if (assignmentIds.length > 0) {
      const batchSize = 500
      for (let i = 0; i < assignmentIds.length; i += batchSize) {
        const batchIds = assignmentIds.slice(i, i + batchSize)
        const { data: batchData, error } = await this.supabase
          .from('student_teacher_subjects')
          .select(`
            id,
            student:students(*),
            teacher:teachers(*),
            subject:subjects(*)
          `)
          .in('id', batchIds)

        if (error) {
          throw new CustomError('Failed to fetch assignment details', 500, error.message)
        }

        if (batchData) {
          assignments.push(...batchData)
        }
      }
    }

    return {
      ...questionnaireResult.data,
      assignments: assignments.map(a => ({
        id: a.id,
        student: a.student,
        teacher: a.teacher,
        subject: a.subject
      }))
    }
  }
}