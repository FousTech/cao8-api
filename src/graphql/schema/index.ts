import { readFileSync } from 'fs'
import { join } from 'path'
import gql from 'graphql-tag'

const schemaPath = join(__dirname, 'schema.graphql')
export const typeDefs = gql(readFileSync(schemaPath, 'utf8'))