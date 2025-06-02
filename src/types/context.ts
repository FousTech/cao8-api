export interface Context {
  user?: {
    id: string
    email: string
    role: 'ADMIN' | 'STUDENT'
  }
  token?: string
}