export interface QuestionnaireGroup {
  id: string
  name: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Questionnaire {
  id: string
  group_id: string
  title: string
  description?: string
  is_active: boolean
  is_anonymous?: boolean
  assignment_type?: 'ALL_STUDENTS' | 'SPECIFIC_STUDENTS'
  created_at: string
  updated_at: string
  questions?: Question[]
  assignments?: any[]
}

export interface Question {
  id: string
  questionnaire_id: string
  text: string
  type: 'MULTIPLE_CHOICE' | 'FREE_TEXT' | 'RATING' | 'YES_NO'
  required: boolean
  order_index: number
  created_at: string
  updated_at: string
  options?: QuestionOption[]
}

export interface QuestionOption {
  id: string
  question_id: string
  text: string
  order_index: number
  created_at: string
  updated_at: string
}