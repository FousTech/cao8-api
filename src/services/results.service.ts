import { getDbClient } from '../utils/database'
import { CustomError } from '../utils/errors'

export class ResultsService {
  private supabase = getDbClient()

  async getQuestionnaireResults(questionnaireId: string) {
    // First get the questionnaire with its questions
    const { data: questionnaire, error: questionnaireError } = await this.supabase
      .from('questionnaires')
      .select(`
        *,
        questions:questions(
          *,
          options:question_options(*)
        )
      `)
      .eq('id', questionnaireId)
      .order('order_index', { foreignTable: 'questions', ascending: true })
      .order('order_index', { foreignTable: 'questions.options', ascending: true })
      .single()

    if (questionnaireError || !questionnaire) {
      throw new CustomError('Questionnaire not found', 404, questionnaireError?.message)
    }

    // Get total assigned count based on assignment type
    let totalAssigned = 0
    
    if (questionnaire.assignment_type === 'ALL_STUDENTS') {
      // Count all active student-teacher-subject relationships
      const { count } = await this.supabase
        .from('student_teacher_subjects')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
      
      totalAssigned = count || 0
    } else {
      // Count specific assignments
      const { count } = await this.supabase
        .from('questionnaire_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('questionnaire_id', questionnaireId)
      
      totalAssigned = count || 0
    }

    // Get all responses for this questionnaire with student info
    const { data: responses, error: responsesError } = await this.supabase
      .from('questionnaire_responses')
      .select(`
        *,
        question_responses:question_responses(
          *,
          option:question_options(*)
        )
      `)
      .eq('questionnaire_id', questionnaireId)

    if (responsesError) {
      throw new CustomError('Failed to fetch responses', 500, responsesError.message)
    }

    const totalResponded = responses?.length || 0
    const responseRate = totalAssigned > 0 ? (totalResponded / totalAssigned) * 100 : 0

    // Get student info for non-anonymous questionnaires
    const studentMap = new Map()
    if (!questionnaire.is_anonymous && responses) {
      for (const response of responses) {
        if (response.student_email) {
          const { data: student } = await this.supabase
            .from('students')
            .select('name')
            .eq('email', response.student_email)
            .single()
          
          if (student) {
            studentMap.set(response.id, student.name)
          }
        }
      }
    }

    // Process results for each question
    const questionResults = await Promise.all(
      (questionnaire.questions || []).map(async (question: any) => {
        const questionResponses = responses?.flatMap(r => 
          r.question_responses
            .filter((qr: any) => qr.question_id === question.id)
            .map((qr: any) => ({
              ...qr,
              responseId: r.id,
              studentEmail: r.student_email,
              studentName: studentMap.get(r.id),
              submittedAt: r.submitted_at
            }))
        ) || []

        const totalResponses = questionResponses.length

        let result: any = {
          question,
          totalResponses
        }

        switch (question.type) {
          case 'MULTIPLE_CHOICE':
            const optionCounts = question.options.map((option: any) => {
              const count = questionResponses.filter(r => r.answer_option_id === option.id).length
              return {
                option,
                count,
                percentage: totalResponses > 0 ? (count / totalResponses) * 100 : 0
              }
            })
            result.optionCounts = optionCounts
            
            // Include individual responses if not anonymous
            if (!questionnaire.is_anonymous) {
              result.optionResponses = questionResponses
                .filter(r => r.answer_option_id)
                .map(r => ({
                  id: r.id,
                  option: question.options.find((o: any) => o.id === r.answer_option_id),
                  respondentInfo: r.studentName || r.studentEmail || null,
                  submittedAt: r.submittedAt || r.created_at
                }))
            }
            break

          case 'RATING':
            const ratings = questionResponses
              .map(r => r.answer_rating)
              .filter(r => r !== null)
            
            const sum = ratings.reduce((acc, rating) => acc + rating, 0)
            const averageRating = ratings.length > 0 ? sum / ratings.length : 0

            const ratingDistribution = [1, 2, 3, 4, 5].map(rating => {
              const count = ratings.filter(r => r === rating).length
              return {
                rating,
                count,
                percentage: totalResponses > 0 ? (count / totalResponses) * 100 : 0
              }
            })

            result.averageRating = averageRating
            result.ratingDistribution = ratingDistribution
            
            // Include individual responses if not anonymous
            if (!questionnaire.is_anonymous) {
              result.ratingResponses = questionResponses
                .filter(r => r.answer_rating !== null)
                .map(r => ({
                  id: r.id,
                  rating: r.answer_rating,
                  respondentInfo: r.studentName || r.studentEmail || null,
                  submittedAt: r.submittedAt || r.created_at
                }))
            }
            break

          case 'YES_NO':
            const yesCount = questionResponses.filter(r => r.answer_boolean === true).length
            const noCount = questionResponses.filter(r => r.answer_boolean === false).length
            
            result.yesCount = yesCount
            result.noCount = noCount
            
            // Include individual responses if not anonymous
            if (!questionnaire.is_anonymous) {
              result.yesNoResponses = questionResponses
                .filter(r => r.answer_boolean !== null && r.answer_boolean !== undefined)
                .map(r => ({
                  id: r.id,
                  answer: r.answer_boolean,
                  respondentInfo: r.studentName || r.studentEmail || null,
                  submittedAt: r.submittedAt || r.created_at
                }))
            }
            break

          case 'FREE_TEXT':
            const textResponses = await Promise.all(
              questionResponses
                .filter(r => r.answer_text)
                .map(async (response: any) => {
                  // Get respondent info if not anonymous
                  let respondentInfo = null
                  if (!questionnaire.is_anonymous) {
                    const { data: responseData } = await this.supabase
                      .from('questionnaire_responses')
                      .select('student_email, submitted_at')
                      .eq('id', response.response_id)
                      .single()
                    
                    if (responseData?.student_email) {
                      // Get student name
                      const { data: student } = await this.supabase
                        .from('students')
                        .select('name')
                        .eq('email', responseData.student_email)
                        .single()
                      
                      respondentInfo = student?.name || responseData.student_email
                    }
                    
                    return {
                      id: response.id,
                      text: response.answer_text,
                      respondentInfo,
                      submittedAt: responseData?.submitted_at || response.created_at
                    }
                  }
                  
                  return {
                    id: response.id,
                    text: response.answer_text,
                    respondentInfo: null,
                    submittedAt: response.created_at
                  }
                })
            )
            
            result.textResponses = textResponses
            break
        }

        return result
      })
    )

    return {
      questionnaire,
      totalAssigned,
      totalResponded,
      responseRate,
      questionResults
    }
  }
}