// New modular imports
import { authResolvers } from './auth/index'
import { adminResolvers } from './admin/index'
import { entityResolvers } from './entities/index'
import { importExportResolvers } from './import-export/index'

export const resolvers = {
  Query: {
    ...authResolvers.Query,
    ...adminResolvers.Query,
    ...entityResolvers.Query,
    ...importExportResolvers.Query
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...adminResolvers.Mutation,
    ...entityResolvers.Mutation,
    ...importExportResolvers.Mutation
  },
  // Include type resolvers from entityResolvers
  ...(entityResolvers.QuestionnaireGroup && { QuestionnaireGroup: entityResolvers.QuestionnaireGroup }),
  ...(entityResolvers.Questionnaire && { Questionnaire: entityResolvers.Questionnaire }),
  ...(entityResolvers.Question && { Question: entityResolvers.Question }),
  ...(entityResolvers.QuestionOption && { QuestionOption: entityResolvers.QuestionOption }),
  ...(entityResolvers.StudentQuestionnaire && { StudentQuestionnaire: entityResolvers.StudentQuestionnaire }),
  ...(entityResolvers.TextResponse && { TextResponse: entityResolvers.TextResponse })
}