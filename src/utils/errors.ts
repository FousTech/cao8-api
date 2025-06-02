import { GraphQLError } from 'graphql';

export class CustomError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public details?: string
  ) {
    super(message);
    this.name = 'CustomError';
  }
}

export function createGraphQLError(message: string, code: string = 'INTERNAL_SERVER_ERROR'): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code }
  });
}

export function handleDatabaseError(error: any, operation: string): never {
  throw createGraphQLError(`Failed to ${operation}: ${error.message}`);
}

export function wrapError(error: any, defaultMessage: string): never {
  if (error instanceof GraphQLError) {
    throw error;
  }
  throw createGraphQLError(`${defaultMessage}: ${error.message || error}`);
}