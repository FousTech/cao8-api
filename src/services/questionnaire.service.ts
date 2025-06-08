import { getDbClient } from '../utils/database'
import { QuestionnaireGroup, Questionnaire, Question, QuestionOption } from '../types/questionnaire'
import { CustomError } from '../utils/errors'
import { PaginationParams, PaginatedResult } from '../utils/pagination'

export class QuestionnaireService {
  private supabase = getDbClient()

  // Group operations
  async listGroups(
    params: PaginationParams & { name?: string }
  ): Promise<PaginatedResult<QuestionnaireGroup>> {
    const { offset = 0, limit = 20, name } = params

    let query = this.supabase
      .from('questionnaire_groups')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (name) {
      query = query.ilike('name', `%${name}%`)
    }

    const { data, error, count } = await query

    if (error) {
      throw new CustomError('Failed to fetch questionnaire groups', 500, error.message)
    }

    return {
      items: data || [],
      total: count || 0,
      hasMore: (count || 0) > offset + limit
    }
  }

  async getGroup(id: string): Promise<QuestionnaireGroup | null> {
    const { data, error } = await this.supabase
      .from('questionnaire_groups')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new CustomError('Failed to fetch questionnaire group', 500, error.message)
    }

    return data
  }

  async createGroup(input: { name: string; description?: string }): Promise<QuestionnaireGroup> {
    const { data, error } = await this.supabase
      .from('questionnaire_groups')
      .insert(input)
      .select()
      .single()

    if (error) {
      throw new CustomError('Failed to create questionnaire group', 500, error.message)
    }

    return data
  }

  async updateGroup(id: string, input: { name?: string; description?: string }): Promise<QuestionnaireGroup> {
    const { data, error } = await this.supabase
      .from('questionnaire_groups')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new CustomError('Failed to update questionnaire group', 500, error.message)
    }

    return data
  }

  async deleteGroup(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('questionnaire_groups')
      .delete()
      .eq('id', id)

    if (error) {
      throw new CustomError('Failed to delete questionnaire group', 500, error.message)
    }

    return true
  }

  // Questionnaire operations
  async listQuestionnaires(
    groupId: string,
    params: PaginationParams & { title?: string; isActive?: boolean }
  ): Promise<PaginatedResult<Questionnaire>> {
    const { offset = 0, limit = 20, title, isActive } = params

    let query = this.supabase
      .from('questionnaires')
      .select('*', { count: 'exact' })
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (title) {
      query = query.ilike('title', `%${title}%`)
    }

    if (isActive !== undefined) {
      query = query.eq('is_active', isActive)
    }

    const { data, error, count } = await query

    if (error) {
      throw new CustomError('Failed to fetch questionnaires', 500, error.message)
    }

    return {
      items: data || [],
      total: count || 0,
      hasMore: (count || 0) > offset + limit
    }
  }

  async getQuestionnaire(id: string): Promise<Questionnaire | null> {
    // First get the questionnaire and count of assignments in parallel
    const [questionnaireResult, assignmentCountResult] = await Promise.all([
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
      
      // Get count to know how many batches we need
      this.supabase
        .from('questionnaire_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('questionnaire_id', id)
    ])

    if (questionnaireResult.error) {
      if (questionnaireResult.error.code === 'PGRST116') {
        return null
      }
      throw new CustomError('Failed to fetch questionnaire', 500, questionnaireResult.error.message)
    }

    const totalAssignments = assignmentCountResult.count || 0
    console.log(`[getQuestionnaire] Loading questionnaire ${id} with ${totalAssignments} assignments`)
    
    // If no assignments, return early
    if (totalAssignments === 0) {
      return {
        ...questionnaireResult.data,
        assignments: []
      }
    }

    // Fetch assignment IDs in larger batches
    const assignmentIds: string[] = []
    const idBatchSize = 10000 // Much larger for just IDs
    
    for (let offset = 0; offset < totalAssignments; offset += idBatchSize) {
      const { data: idBatch, error: idError } = await this.supabase
        .from('questionnaire_assignments')
        .select('student_teacher_subject_id')
        .eq('questionnaire_id', id)
        .range(offset, Math.min(offset + idBatchSize - 1, totalAssignments - 1))
        .order('id')

      if (idError) {
        throw new CustomError('Failed to fetch assignment IDs', 500, idError.message)
      }

      if (idBatch) {
        assignmentIds.push(...idBatch.map(b => b.student_teacher_subject_id))
      }
    }

    // Now fetch the assignment details in optimized batches
    const assignments: any[] = []
    const detailBatchSize = 500 // Smaller batches for reliability
    
    for (let i = 0; i < assignmentIds.length; i += detailBatchSize) {
      const batchIds = assignmentIds.slice(i, i + detailBatchSize)
      const { data: batchData, error: batchError } = await this.supabase
        .from('student_teacher_subjects')
        .select(`
          id,
          student:students(*),
          teacher:teachers(*),
          subject:subjects(*)
        `)
        .in('id', batchIds)

      if (batchError) {
        console.error(`Failed to fetch batch ${Math.floor(i / detailBatchSize) + 1}:`, batchError)
        // Continue with partial data instead of failing completely
        continue
      }

      if (batchData) {
        // Filter out any records with null students or subjects
        const validData = batchData.filter(d => d.student && d.subject)
        assignments.push(...validData)
      }
    }

    // Create a map for O(1) lookup when transforming
    const assignmentMap = new Map(assignments.map(a => [a.id, a]))

    // Transform the data to match the GraphQL schema
    const transformedAssignments = assignmentIds
      .map(id => {
        const assignment = assignmentMap.get(id)
        if (!assignment) return null
        return {
          id: assignment.id,
          student: assignment.student,
          teacher: assignment.teacher,
          subject: assignment.subject
        }
      })
      .filter(Boolean) // Remove any null assignments

    console.log(`[getQuestionnaire] Returning ${transformedAssignments.length} assignments out of ${assignmentIds.length} IDs`)

    const transformed = {
      ...questionnaireResult.data,
      assignments: transformedAssignments
    }

    return transformed
  }

  async createQuestionnaire(input: {
    groupId: string
    title: string
    description?: string
    isAnonymous?: boolean
    assignmentType: 'ALL_STUDENTS' | 'SPECIFIC_STUDENTS'
    assignmentIds?: string[] // student_teacher_subject IDs
    questions?: Array<{
      text: string
      type: 'MULTIPLE_CHOICE' | 'FREE_TEXT' | 'RATING' | 'YES_NO'
      required?: boolean
      orderIndex: number
      options?: Array<{
        text: string
        orderIndex: number
      }>
    }>
  }): Promise<Questionnaire> {
    const { groupId, title, description, isAnonymous = false, assignmentType, assignmentIds = [], questions = [] } = input

    // Start transaction
    const { data: questionnaire, error: questionnaireError } = await this.supabase
      .from('questionnaires')
      .insert({
        group_id: groupId,
        title,
        description,
        is_active: true,
        is_anonymous: isAnonymous,
        assignment_type: assignmentType
      })
      .select()
      .single()

    if (questionnaireError) {
      throw new CustomError('Failed to create questionnaire', 500, questionnaireError.message)
    }

    // Handle assignments based on type
    if (assignmentType === 'SPECIFIC_STUDENTS' && assignmentIds.length > 0) {
      const assignments = assignmentIds.map(stsId => ({
        questionnaire_id: questionnaire.id,
        student_teacher_subject_id: stsId
      }))
      
      // Batch insert assignments to handle large datasets
      const batchSize = 1000
      for (let i = 0; i < assignments.length; i += batchSize) {
        const batch = assignments.slice(i, i + batchSize)
        const { error: assignmentError } = await this.supabase
          .from('questionnaire_assignments')
          .insert(batch)
        
        if (assignmentError) {
          throw new CustomError(`Failed to assign questionnaire (batch ${Math.floor(i / batchSize) + 1})`, 500, assignmentError.message)
        }
      }
    }

    // Create questions
    if (questions.length > 0) {
      const questionsToInsert = questions.map(q => ({
        questionnaire_id: questionnaire.id,
        text: q.text,
        type: q.type,
        required: q.required ?? false,
        order_index: q.orderIndex
      }))

      const { data: createdQuestions, error: questionsError } = await this.supabase
        .from('questions')
        .insert(questionsToInsert)
        .select()

      if (questionsError) {
        throw new CustomError('Failed to create questions', 500, questionsError.message)
      }

      // Create options for multiple choice questions
      const optionsToInsert: any[] = []
      createdQuestions.forEach((question, idx) => {
        if (question.type === 'MULTIPLE_CHOICE' && questions[idx].options) {
          questions[idx].options!.forEach(opt => {
            optionsToInsert.push({
              question_id: question.id,
              text: opt.text,
              order_index: opt.orderIndex
            })
          })
        }
      })

      if (optionsToInsert.length > 0) {
        const { error: optionsError } = await this.supabase
          .from('question_options')
          .insert(optionsToInsert)

        if (optionsError) {
          throw new CustomError('Failed to create question options', 500, optionsError.message)
        }
      }
    }

    return this.getQuestionnaire(questionnaire.id) as Promise<Questionnaire>
  }

  async updateQuestionnaire(
    id: string,
    input: {
      title?: string
      description?: string
      isActive?: boolean
      isAnonymous?: boolean
      assignmentType?: 'ALL_STUDENTS' | 'SPECIFIC_STUDENTS'
      assignmentIds?: string[] // student_teacher_subject IDs
      questions?: Array<{
        id?: string
        text: string
        type: 'MULTIPLE_CHOICE' | 'FREE_TEXT' | 'RATING' | 'YES_NO'
        required?: boolean
        orderIndex: number
        options?: Array<{
          id?: string
          text: string
          orderIndex: number
        }>
      }>
    }
  ): Promise<Questionnaire> {
    const { title, description, isActive, isAnonymous, assignmentType, assignmentIds, questions } = input

    // Update questionnaire
    if (title !== undefined || description !== undefined || isActive !== undefined || isAnonymous !== undefined || assignmentType !== undefined) {
      const updateData: any = {}
      if (title !== undefined) updateData.title = title
      if (description !== undefined) updateData.description = description
      if (isActive !== undefined) updateData.is_active = isActive
      if (isAnonymous !== undefined) updateData.is_anonymous = isAnonymous
      if (assignmentType !== undefined) updateData.assignment_type = assignmentType

      const { error } = await this.supabase
        .from('questionnaires')
        .update(updateData)
        .eq('id', id)

      if (error) {
        throw new CustomError('Failed to update questionnaire', 500, error.message)
      }
    }

    // Handle assignment updates
    if (assignmentType !== undefined || assignmentIds !== undefined) {
      // Clear existing assignments if needed
      await this.supabase.from('questionnaire_assignments').delete().eq('questionnaire_id', id)

      // Add new assignments if type is SPECIFIC_STUDENTS
      if ((assignmentType === 'SPECIFIC_STUDENTS' || (assignmentType === undefined && assignmentIds !== undefined)) && assignmentIds && assignmentIds.length > 0) {
        const assignments = assignmentIds.map(stsId => ({
          questionnaire_id: id,
          student_teacher_subject_id: stsId
        }))
        
        // Batch insert assignments to handle large datasets
        const batchSize = 1000
        for (let i = 0; i < assignments.length; i += batchSize) {
          const batch = assignments.slice(i, i + batchSize)
          const { error } = await this.supabase
            .from('questionnaire_assignments')
            .insert(batch)
          
          if (error) {
            throw new CustomError(`Failed to assign questionnaire (batch ${Math.floor(i / batchSize) + 1})`, 500, error.message)
          }
        }
      }
    }

    // Handle questions update if provided
    if (questions) {
      // Get existing questions
      const { data: existingQuestions } = await this.supabase
        .from('questions')
        .select('id')
        .eq('questionnaire_id', id)

      const existingIds = existingQuestions?.map(q => q.id) || []
      const updatedIds = questions.filter(q => q.id).map(q => q.id!)
      const toDelete = existingIds.filter(id => !updatedIds.includes(id))

      // Delete removed questions
      if (toDelete.length > 0) {
        await this.supabase
          .from('questions')
          .delete()
          .in('id', toDelete)
      }

      // Update or create questions
      for (const question of questions) {
        if (question.id) {
          // Update existing question
          await this.supabase
            .from('questions')
            .update({
              text: question.text,
              type: question.type,
              required: question.required ?? false,
              order_index: question.orderIndex
            })
            .eq('id', question.id)

          // Handle options for multiple choice
          if (question.type === 'MULTIPLE_CHOICE' && question.options) {
            // Delete all existing options and recreate
            await this.supabase
              .from('question_options')
              .delete()
              .eq('question_id', question.id)

            const optionsToInsert = question.options.map(opt => ({
              question_id: question.id,
              text: opt.text,
              order_index: opt.orderIndex
            }))

            await this.supabase
              .from('question_options')
              .insert(optionsToInsert)
          }
        } else {
          // Create new question
          const { data: newQuestion } = await this.supabase
            .from('questions')
            .insert({
              questionnaire_id: id,
              text: question.text,
              type: question.type,
              required: question.required ?? false,
              order_index: question.orderIndex
            })
            .select()
            .single()

          if (newQuestion && question.type === 'MULTIPLE_CHOICE' && question.options) {
            const optionsToInsert = question.options.map(opt => ({
              question_id: newQuestion.id,
              text: opt.text,
              order_index: opt.orderIndex
            }))

            await this.supabase
              .from('question_options')
              .insert(optionsToInsert)
          }
        }
      }
    }

    return this.getQuestionnaire(id) as Promise<Questionnaire>
  }

  async deleteQuestionnaire(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('questionnaires')
      .delete()
      .eq('id', id)

    if (error) {
      throw new CustomError('Failed to delete questionnaire', 500, error.message)
    }

    return true
  }

  async deleteQuestionnaires(ids: string[]): Promise<boolean> {
    const { error } = await this.supabase
      .from('questionnaires')
      .delete()
      .in('id', ids)

    if (error) {
      throw new CustomError('Failed to delete questionnaires', 500, error.message)
    }

    return true
  }

  async duplicateQuestionnaire(id: string): Promise<Questionnaire> {
    // First, get the original questionnaire with all its data
    const original = await this.getQuestionnaire(id)
    if (!original) {
      throw new CustomError('Questionnaire not found', 404)
    }

    // Generate a new title with (kopie) suffix
    let newTitle = original.title
    const copyPattern = /^(.+?)\s*\(kopie(?:\s+(\d+))?\)$/
    const match = newTitle.match(copyPattern)
    
    if (match) {
      // Already has (kopie) or (kopie N), increment the number
      const baseName = match[1]
      const currentNumber = match[2] ? parseInt(match[2]) : 1
      newTitle = `${baseName} (kopie ${currentNumber + 1})`
    } else {
      // First copy
      newTitle = `${newTitle} (kopie)`
    }

    // Check if a questionnaire with this title already exists in the group
    let finalTitle = newTitle
    let counter = 2
    while (true) {
      const { data: existing } = await this.supabase
        .from('questionnaires')
        .select('id')
        .eq('group_id', original.group_id)
        .eq('title', finalTitle)
        .single()
      
      if (!existing) break
      
      // If title exists, keep incrementing
      if (!match) {
        finalTitle = `${original.title} (kopie ${counter})`
      } else {
        const baseName = match[1]
        finalTitle = `${baseName} (kopie ${counter})`
      }
      counter++
    }

    // Create the duplicate questionnaire
    const { data: newQuestionnaire, error: createError } = await this.supabase
      .from('questionnaires')
      .insert({
        group_id: original.group_id,
        title: finalTitle,
        description: original.description,
        is_active: false, // Start as inactive
        assignment_type: original.assignment_type || 'ALL_STUDENTS'
      })
      .select()
      .single()

    if (createError || !newQuestionnaire) {
      throw new CustomError('Failed to duplicate questionnaire', 500, createError?.message)
    }

    // Duplicate questions and their options
    if (original.questions && original.questions.length > 0) {
      for (const question of original.questions) {
        const { data: newQuestion, error: questionError } = await this.supabase
          .from('questions')
          .insert({
            questionnaire_id: newQuestionnaire.id,
            text: question.text,
            type: question.type,
            required: question.required,
            order_index: question.order_index
          })
          .select()
          .single()

        if (questionError || !newQuestion) {
          throw new CustomError('Failed to duplicate question', 500, questionError?.message)
        }

        // Duplicate options for multiple choice questions
        if (question.type === 'MULTIPLE_CHOICE' && question.options && question.options.length > 0) {
          const optionsToInsert = question.options.map((opt: any) => ({
            question_id: newQuestion.id,
            text: opt.text,
            order_index: opt.order_index
          }))

          const { error: optionsError } = await this.supabase
            .from('question_options')
            .insert(optionsToInsert)

          if (optionsError) {
            throw new CustomError('Failed to duplicate question options', 500, optionsError.message)
          }
        }
      }
    }

    // Duplicate assignments if it's SPECIFIC_STUDENTS type
    if (original.assignment_type === 'SPECIFIC_STUDENTS' && original.assignments && original.assignments.length > 0) {
      const assignmentsToInsert = original.assignments.map((assignment: any) => ({
        questionnaire_id: newQuestionnaire.id,
        student_teacher_subject_id: assignment.student_teacher_subject_id || assignment.id
      }))

      // Batch insert assignments
      const batchSize = 1000
      for (let i = 0; i < assignmentsToInsert.length; i += batchSize) {
        const batch = assignmentsToInsert.slice(i, i + batchSize)
        const { error: assignmentError } = await this.supabase
          .from('questionnaire_assignments')
          .insert(batch)

        if (assignmentError) {
          throw new CustomError(`Failed to duplicate assignments (batch ${Math.floor(i / batchSize) + 1})`, 500, assignmentError.message)
        }
      }
    }

    // Return the complete duplicated questionnaire
    return this.getQuestionnaire(newQuestionnaire.id) as Promise<Questionnaire>
  }

  async getStudentQuestionnaires(studentUserId: string): Promise<any[]> {
    // First, get the user's email from profiles
    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('email')
      .eq('id', studentUserId)
      .single()

    if (profileError || !profile) {
      throw new CustomError('User profile not found', 404, profileError?.message)
    }

    // Then get the student record by email
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id')
      .eq('email', profile.email)
      .single()

    if (studentError || !student) {
      throw new CustomError('Student not found', 404, studentError?.message)
    }

    // Get all active questionnaires
    const { data: questionnaires, error: questionnairesError } = await this.supabase
      .from('questionnaires')
      .select(`
        *,
        questions:questions(
          *,
          options:question_options(*)
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .order('order_index', { foreignTable: 'questions', ascending: true })
      .order('order_index', { foreignTable: 'questions.options', ascending: true })

    if (questionnairesError) {
      throw new CustomError('Failed to fetch questionnaires', 500, questionnairesError.message)
    }

    if (!questionnaires || questionnaires.length === 0) {
      return []
    }

    // Get all existing responses for this student to check submission status
    const { data: existingResponses } = await this.supabase
      .from('questionnaire_responses')
      .select('questionnaire_id, subject_id, teacher_id')
      .eq('student_email', profile.email)

    // Create a Set for quick lookup of submitted questionnaires
    const submittedSet = new Set(
      existingResponses?.map(r => `${r.questionnaire_id}-${r.subject_id}-${r.teacher_id || 'null'}`) || []
    )

    // Filter questionnaires based on assignment type and include subject/teacher info
    const availableQuestionnaires: any[] = []

    for (const questionnaire of questionnaires) {
      if (questionnaire.assignment_type === 'ALL_STUDENTS') {
        // For ALL_STUDENTS type, we need to get all student's subject-teacher combinations
        const { data: studentAssignments, error: studentAssignmentsError } = await this.supabase
          .from('student_teacher_subjects')
          .select(`
            id,
            subject:subjects(*),
            teacher:teachers(*)
          `)
          .eq('student_id', student.id)
          .eq('is_active', true)

        if (!studentAssignmentsError && studentAssignments && studentAssignments.length > 0) {
          // Create a questionnaire entry for each subject-teacher combination
          for (const assignment of studentAssignments) {
            const submissionKey = `${questionnaire.id}-${(assignment as any).subject.id}-${(assignment as any).teacher?.id || 'null'}`
            availableQuestionnaires.push({
              id: questionnaire.id,
              title: questionnaire.title,
              description: questionnaire.description,
              isAnonymous: questionnaire.is_anonymous,
              isSubmitted: submittedSet.has(submissionKey),
              created_at: questionnaire.created_at,
              questions: questionnaire.questions,
              subject: (assignment as any).subject,
              teacher: (assignment as any).teacher
            })
          }
        }
      } else if (questionnaire.assignment_type === 'SPECIFIC_STUDENTS') {
        // Check if this student has an assignment for this questionnaire
        const { data: assignments, error: assignmentError } = await this.supabase
          .from('questionnaire_assignments')
          .select(`
            student_teacher_subjects!inner(
              id,
              student_id,
              subject:subjects(*),
              teacher:teachers(*)
            )
          `)
          .eq('questionnaire_id', questionnaire.id)
          .eq('student_teacher_subjects.student_id', student.id)

        if (!assignmentError && assignments && assignments.length > 0) {
          // Add questionnaire with the specific subject-teacher info
          for (const assignment of assignments) {
            const submissionKey = `${questionnaire.id}-${(assignment.student_teacher_subjects as any).subject.id}-${(assignment.student_teacher_subjects as any).teacher?.id || 'null'}`
            availableQuestionnaires.push({
              id: questionnaire.id,
              title: questionnaire.title,
              description: questionnaire.description,
              isAnonymous: questionnaire.is_anonymous,
              isSubmitted: submittedSet.has(submissionKey),
              created_at: questionnaire.created_at,
              questions: questionnaire.questions,
              subject: (assignment.student_teacher_subjects as any).subject,
              teacher: (assignment.student_teacher_subjects as any).teacher
            })
          }
        }
      }
    }

    return availableQuestionnaires
  }

  async getAssignmentData(subjectId?: string, teacherId?: string): Promise<any> {
    // Fetch all base data in parallel for better performance
    const [subjectsResult, teachersResult, studentsResult] = await Promise.all([
      this.supabase.from('subjects').select('*').order('name'),
      this.supabase.from('teachers').select('*').order('name'),
      this.supabase.from('students').select('*').order('name')
    ])

    if (subjectsResult.error) throw new CustomError('Failed to fetch subjects', 500, subjectsResult.error.message)
    if (teachersResult.error) throw new CustomError('Failed to fetch teachers', 500, teachersResult.error.message)
    if (studentsResult.error) throw new CustomError('Failed to fetch students', 500, studentsResult.error.message)

    // Create maps for O(1) lookup performance
    const subjectsMap = new Map(subjectsResult.data.map(s => [s.id, s]))
    const teachersMap = new Map(teachersResult.data.map(t => [t.id, t]))
    const studentsMap = new Map(studentsResult.data.map(s => [s.id, s]))

    // Build query with filters
    let countQuery = this.supabase
      .from('student_teacher_subjects')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
    
    if (subjectId) {
      countQuery = countQuery.eq('subject_id', subjectId)
    }
    if (teacherId) {
      countQuery = countQuery.eq('teacher_id', teacherId)
    }

    // First get the total count
    const { count: totalCount, error: countError } = await countQuery

    if (countError) {
      throw new CustomError('Failed to count assignments', 500, countError.message)
    }

    const totalAssignments = totalCount || 0
    const allAssignments: any[] = []
    
    // Fetch all assignments in batches
    const batchSize = 1000 // Supabase seems to limit to 1000 anyway
    for (let offset = 0; offset < totalAssignments; offset += batchSize) {
      let query = this.supabase
        .from('student_teacher_subjects')
        .select('id, student_id, teacher_id, subject_id')
        .eq('is_active', true)
        .range(offset, Math.min(offset + batchSize - 1, totalAssignments - 1))
        .order('id')
      
      if (subjectId) {
        query = query.eq('subject_id', subjectId)
      }
      if (teacherId) {
        query = query.eq('teacher_id', teacherId)
      }

      const { data: batchAssignments, error: assignmentsError } = await query

      if (assignmentsError) {
        throw new CustomError('Failed to fetch assignments', 500, assignmentsError.message)
      }

      if (batchAssignments && batchAssignments.length > 0) {
        // Map assignments to full objects using our cached data
        const mapped = batchAssignments.map(a => ({
          id: a.id,
          student: studentsMap.get(a.student_id),
          teacher: a.teacher_id ? teachersMap.get(a.teacher_id) : null,
          subject: subjectsMap.get(a.subject_id)
        })).filter(a => a.student && a.subject)
        
        allAssignments.push(...mapped)
      }
    }

    return {
      subjects: subjectsResult.data || [],
      teachers: teachersResult.data || [],
      students: studentsResult.data || [],
      assignments: allAssignments
    }
  }
}