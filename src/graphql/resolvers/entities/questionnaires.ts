import { IResolvers } from '@graphql-tools/utils'
import { Context } from '../../../types/context'
import { QuestionnaireService } from '../../../services/questionnaire.service'
import { ResponseService } from '../../../services/response.service'
import { ResultsService } from '../../../services/results.service'
import { requireAuth, requireAdmin } from '../../../utils/authorization'

const questionnaireResolvers: IResolvers<any, Context> = {
  Query: {
    listQuestionnaireGroups: async (_, args, context) => {
      requireAdmin(context)
      const { index = 0, nameFilter } = args
      const service = new QuestionnaireService()
      
      const result = await service.listGroups({
        offset: index * 20,
        limit: 20,
        name: nameFilter
      })

      return {
        data: result.items,
        total: result.total,
        hasMore: result.hasMore
      }
    },

    getQuestionnaireGroup: async (_, { id }, context) => {
      requireAdmin(context)
      const service = new QuestionnaireService()
      return await service.getGroup(id)
    },

    listQuestionnaires: async (_, args, context) => {
      requireAdmin(context)
      const { groupId, index = 0, titleFilter, isActive } = args
      const service = new QuestionnaireService()
      
      const result = await service.listQuestionnaires(groupId, {
        offset: index * 20,
        limit: 20,
        title: titleFilter,
        isActive
      })

      return {
        data: result.items,
        total: result.total,
        hasMore: result.hasMore
      }
    },

    getQuestionnaire: async (_, { id }, context) => {
      requireAuth(context)
      const service = new QuestionnaireService()
      
      // If student, verify they have access to this questionnaire
      if (context.user?.role === 'STUDENT') {
        const studentQuestionnaires = await service.getStudentQuestionnaires(context.user.id)
        const hasAccess = studentQuestionnaires.some(q => q.id === id)
        if (!hasAccess) {
          throw new Error('You do not have access to this questionnaire')
        }
      }
      
      return await service.getQuestionnaire(id)
    },

    getQuestionnaireAssignmentData: async (_, args, context) => {
      requireAdmin(context)
      const { subjectId, teacherId } = args
      const service = new QuestionnaireService()
      return await service.getAssignmentData(subjectId, teacherId)
    },

    getStudentQuestionnaires: async (_, __, context) => {
      requireAuth(context)
      if (context.user?.role !== 'STUDENT') {
        throw new Error('Only students can access this query')
      }
      const service = new QuestionnaireService()
      return await service.getStudentQuestionnaires(context.user.id)
    },

    getQuestionnaireResults: async (_, { questionnaireId }, context) => {
      requireAdmin(context)
      const resultsService = new ResultsService()
      return await resultsService.getQuestionnaireResults(questionnaireId)
    }
  },

  Mutation: {
    createQuestionnaireGroup: async (_, args, context) => {
      requireAdmin(context)
      const { name, description } = args
      const service = new QuestionnaireService()

      try {
        const group = await service.createGroup({ name, description })
        return {
          success: true,
          message: 'Skupina dotazníků byla úspěšně vytvořena',
          group
        }
      } catch (error: any) {
        return {
          success: false,
          message: error.message || 'Nepodařilo se vytvořit skupinu dotazníků',
          group: null
        }
      }
    },

    updateQuestionnaireGroup: async (_, args, context) => {
      requireAdmin(context)
      const { id, name, description } = args
      const service = new QuestionnaireService()

      try {
        const group = await service.updateGroup(id, { name, description })
        return {
          success: true,
          message: 'Skupina dotazníků byla úspěšně aktualizována',
          group
        }
      } catch (error: any) {
        return {
          success: false,
          message: error.message || 'Nepodařilo se aktualizovat skupinu dotazníků',
          group: null
        }
      }
    },

    deleteQuestionnaireGroup: async (_, { id }, context) => {
      requireAdmin(context)
      const service = new QuestionnaireService()

      try {
        await service.deleteGroup(id)
        return {
          success: true,
          message: 'Skupina dotazníků byla úspěšně smazána',
          group: null
        }
      } catch (error: any) {
        return {
          success: false,
          message: error.message || 'Nepodařilo se smazat skupinu dotazníků',
          group: null
        }
      }
    },

    createQuestionnaire: async (_, args, context) => {
      requireAdmin(context)
      const { groupId, title, description, isAnonymous, questions, assignmentType, assignmentIds } = args
      const service = new QuestionnaireService()

      try {
        const questionnaire = await service.createQuestionnaire({
          groupId,
          title,
          description,
          isAnonymous: isAnonymous ?? false,
          assignmentType: assignmentType || 'ALL_STUDENTS',
          assignmentIds,
          questions: questions?.map((q: any, index: number) => ({
            text: q.text,
            type: q.type,
            required: q.required ?? false,
            orderIndex: q.orderIndex ?? index,
            options: q.options?.map((opt: any, optIndex: number) => ({
              text: opt.text,
              orderIndex: opt.orderIndex ?? optIndex
            }))
          }))
        })

        return {
          success: true,
          message: 'Dotazník byl úspěšně vytvořen',
          questionnaire
        }
      } catch (error: any) {
        return {
          success: false,
          message: error.message || 'Nepodařilo se vytvořit dotazník',
          questionnaire: null
        }
      }
    },

    updateQuestionnaire: async (_, args, context) => {
      requireAdmin(context)
      const { id, title, description, isActive, isAnonymous, questions, assignmentType, assignmentIds } = args
      const service = new QuestionnaireService()

      try {
        const questionnaire = await service.updateQuestionnaire(id, {
          title,
          description,
          isActive,
          isAnonymous,
          assignmentType,
          assignmentIds,
          questions: questions?.map((q: any, index: number) => ({
            id: q.id,
            text: q.text,
            type: q.type,
            required: q.required ?? false,
            orderIndex: q.orderIndex ?? index,
            options: q.options?.map((opt: any, optIndex: number) => ({
              id: opt.id,
              text: opt.text,
              orderIndex: opt.orderIndex ?? optIndex
            }))
          }))
        })

        return {
          success: true,
          message: 'Dotazník byl úspěšně aktualizován',
          questionnaire
        }
      } catch (error: any) {
        return {
          success: false,
          message: error.message || 'Nepodařilo se aktualizovat dotazník',
          questionnaire: null
        }
      }
    },

    deleteQuestionnaire: async (_, { id }, context) => {
      requireAdmin(context)
      const service = new QuestionnaireService()

      try {
        await service.deleteQuestionnaire(id)
        return {
          success: true,
          message: 'Dotazník byl úspěšně smazán',
          questionnaire: null
        }
      } catch (error: any) {
        return {
          success: false,
          message: error.message || 'Nepodařilo se smazat dotazník',
          questionnaire: null
        }
      }
    },

    deleteQuestionnaires: async (_, { ids }, context) => {
      requireAdmin(context)
      const service = new QuestionnaireService()

      try {
        await service.deleteQuestionnaires(ids)
        return {
          success: true,
          message: `${ids.length} dotazníků bylo úspěšně smazáno`,
          questionnaire: null
        }
      } catch (error: any) {
        return {
          success: false,
          message: error.message || 'Nepodařilo se smazat dotazníky',
          questionnaire: null
        }
      }
    },

    duplicateQuestionnaire: async (_, { id }, context) => {
      requireAdmin(context)
      const service = new QuestionnaireService()

      try {
        const questionnaire = await service.duplicateQuestionnaire(id)
        return {
          success: true,
          message: 'Dotazník byl úspěšně zduplikován',
          questionnaire
        }
      } catch (error: any) {
        return {
          success: false,
          message: error.message || 'Nepodařilo se zduplikovat dotazník',
          questionnaire: null
        }
      }
    },

    submitQuestionnaireResponse: async (_, { input }, context) => {
      requireAuth(context)
      if (context.user?.role !== 'STUDENT') {
        throw new Error('Only students can submit questionnaire responses')
      }

      const responseService = new ResponseService()
      try {
        const result = await responseService.submitResponse(context.user.id, input)
        return result
      } catch (error: any) {
        return {
          success: false,
          message: error.message || 'Nepodařilo se odeslat odpovědi',
          responseId: null
        }
      }
    }
  },

  // Field resolvers to match GraphQL schema
  QuestionnaireGroup: {
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at
  },

  Questionnaire: {
    groupId: (parent: any) => parent.group_id,
    isActive: (parent: any) => parent.is_active,
    isAnonymous: (parent: any) => parent.is_anonymous ?? false,
    assignmentType: (parent: any) => parent.assignment_type || 'ALL_STUDENTS',
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at
  },

  Question: {
    questionnaireId: (parent: any) => parent.questionnaire_id,
    orderIndex: (parent: any) => parent.order_index,
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at
  },

  QuestionOption: {
    questionId: (parent: any) => parent.question_id,
    orderIndex: (parent: any) => parent.order_index,
    createdAt: (parent: any) => parent.created_at,
    updatedAt: (parent: any) => parent.updated_at
  },

  StudentQuestionnaire: {
    isAnonymous: (parent: any) => parent.is_anonymous ?? false,
    isSubmitted: (parent: any) => parent.isSubmitted ?? false,
    createdAt: (parent: any) => parent.created_at
  },

  TextResponse: {
    submittedAt: (parent: any) => parent.submittedAt || parent.submitted_at
  }
}

export default questionnaireResolvers