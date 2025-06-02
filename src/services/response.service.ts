import { getDbClient } from '../utils/database'
import { CustomError } from '../utils/errors'

interface QuestionAnswer {
  questionId: string
  answerText?: string
  answerOptionId?: string
  answerRating?: number
  answerBoolean?: boolean
}

interface ResponseInput {
  questionnaireId: string
  subjectId: string
  teacherId?: string
  answers: QuestionAnswer[]
}

export class ResponseService {
  private supabase = getDbClient()

  async submitResponse(studentUserId: string, input: ResponseInput) {
    const { questionnaireId, subjectId, teacherId, answers } = input

    // Get student email from profiles
    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('email')
      .eq('id', studentUserId)
      .single()

    if (profileError || !profile) {
      throw new CustomError('User profile not found', 404, profileError?.message)
    }

    // Verify student exists
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id')
      .eq('email', profile.email)
      .single()

    if (studentError || !student) {
      throw new CustomError('Student not found', 404, studentError?.message)
    }

    // Get questionnaire to check if it's anonymous and active
    const { data: questionnaire, error: questionnaireError } = await this.supabase
      .from('questionnaires')
      .select('is_anonymous, is_active, assignment_type')
      .eq('id', questionnaireId)
      .single()

    if (questionnaireError || !questionnaire) {
      throw new CustomError('Questionnaire not found', 404, questionnaireError?.message)
    }

    if (!questionnaire.is_active) {
      throw new CustomError('Questionnaire is not active', 400)
    }

    // Verify student has access to this questionnaire
    if (questionnaire.assignment_type === 'SPECIFIC_STUDENTS') {
      const { data: assignment, error: assignmentError } = await this.supabase
        .from('questionnaire_assignments')
        .select(`
          student_teacher_subjects!inner(
            student_id,
            subject_id,
            teacher_id
          )
        `)
        .eq('questionnaire_id', questionnaireId)
        .eq('student_teacher_subjects.student_id', student.id)
        .eq('student_teacher_subjects.subject_id', subjectId)
        .eq('student_teacher_subjects.teacher_id', teacherId || null)
        .single()

      if (assignmentError || !assignment) {
        throw new CustomError('You do not have access to this questionnaire', 403)
      }
    }

    // Check for duplicate submission - ALWAYS use student email for tracking
    const { data: existingResponse } = await this.supabase
      .from('questionnaire_responses')
      .select('id')
      .eq('questionnaire_id', questionnaireId)
      .eq('student_email', profile.email)
      .eq('subject_id', subjectId)
      .eq('teacher_id', teacherId || null)
      .single()
    
    if (existingResponse) {
      throw new CustomError('You have already submitted a response for this questionnaire', 400)
    }

    // Start transaction by creating the main response
    // ALWAYS store student_email for tracking, but we won't expose it for anonymous questionnaires
    const { data: response, error: responseError } = await this.supabase
      .from('questionnaire_responses')
      .insert({
        questionnaire_id: questionnaireId,
        student_email: profile.email, // Always store email for tracking
        subject_id: subjectId,
        teacher_id: teacherId
      })
      .select()
      .single()

    if (responseError) {
      throw new CustomError('Failed to create response', 500, responseError.message)
    }

    // Validate and prepare answers
    const { data: questions, error: questionsError } = await this.supabase
      .from('questions')
      .select('id, type, required')
      .eq('questionnaire_id', questionnaireId)

    if (questionsError || !questions) {
      throw new CustomError('Failed to fetch questions', 500, questionsError?.message)
    }

    // Create a map for quick lookup
    const questionMap = new Map(questions.map(q => [q.id, q]))

    // Validate all required questions are answered
    for (const question of questions) {
      if (question.required) {
        const answer = answers.find(a => a.questionId === question.id)
        if (!answer || (!answer.answerText && !answer.answerOptionId && answer.answerRating === undefined && answer.answerBoolean === undefined)) {
          throw new CustomError(`Required question ${question.id} is not answered`, 400)
        }
      }
    }

    // Prepare question responses
    const questionResponses = answers.map(answer => {
      const question = questionMap.get(answer.questionId)
      if (!question) {
        throw new CustomError(`Invalid question ID: ${answer.questionId}`, 400)
      }

      // Validate answer type matches question type
      const answerData: any = {
        response_id: response.id,
        question_id: answer.questionId
      }

      switch (question.type) {
        case 'FREE_TEXT':
          if (!answer.answerText && answer.answerText !== '') {
            throw new CustomError(`Text answer required for question ${answer.questionId}`, 400)
          }
          answerData.answer_text = answer.answerText
          break
        case 'MULTIPLE_CHOICE':
          if (!answer.answerOptionId) {
            throw new CustomError(`Option selection required for question ${answer.questionId}`, 400)
          }
          answerData.answer_option_id = answer.answerOptionId
          break
        case 'RATING':
          if (answer.answerRating === undefined || answer.answerRating < 1 || answer.answerRating > 5) {
            throw new CustomError(`Valid rating (1-5) required for question ${answer.questionId}`, 400)
          }
          answerData.answer_rating = answer.answerRating
          break
        case 'YES_NO':
          if (answer.answerBoolean === undefined) {
            throw new CustomError(`Yes/No answer required for question ${answer.questionId}`, 400)
          }
          answerData.answer_boolean = answer.answerBoolean
          break
        default:
          throw new CustomError(`Unknown question type: ${question.type}`, 400)
      }

      return answerData
    })

    // Insert all question responses
    const { error: answersError } = await this.supabase
      .from('question_responses')
      .insert(questionResponses)

    if (answersError) {
      // Try to clean up the main response if answers fail
      await this.supabase
        .from('questionnaire_responses')
        .delete()
        .eq('id', response.id)
      
      throw new CustomError('Failed to save answers', 500, answersError.message)
    }

    return {
      success: true,
      message: 'Odpovědi byly úspěšně odeslány',
      responseId: response.id
    }
  }

  async hasStudentSubmitted(
    studentUserId: string, 
    questionnaireId: string, 
    subjectId: string, 
    teacherId?: string
  ): Promise<boolean> {
    // Get student email
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('email')
      .eq('id', studentUserId)
      .single()

    if (!profile) return false

    const { data: response } = await this.supabase
      .from('questionnaire_responses')
      .select('id')
      .eq('questionnaire_id', questionnaireId)
      .eq('student_email', profile.email)
      .eq('subject_id', subjectId)
      .eq('teacher_id', teacherId || null)
      .single()

    return !!response
  }
}