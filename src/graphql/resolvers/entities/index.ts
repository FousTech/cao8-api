import { subjectQueries, subjectMutations } from './subjects';
import { studentQueries, studentMutations } from './students';
import { teacherQueries, teacherMutations } from './teachers';
import questionnaireResolvers from './questionnaires';

export const entityResolvers = {
  Query: {
    ...subjectQueries,
    ...studentQueries,
    ...teacherQueries,
    ...questionnaireResolvers.Query
  },
  Mutation: {
    ...subjectMutations,
    ...studentMutations,
    ...teacherMutations,
    ...questionnaireResolvers.Mutation
  },
  QuestionnaireGroup: questionnaireResolvers.QuestionnaireGroup,
  Questionnaire: questionnaireResolvers.Questionnaire,
  Question: questionnaireResolvers.Question,
  QuestionOption: questionnaireResolvers.QuestionOption,
  StudentQuestionnaire: questionnaireResolvers.StudentQuestionnaire,
  TextResponse: questionnaireResolvers.TextResponse
};