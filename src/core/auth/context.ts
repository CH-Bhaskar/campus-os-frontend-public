import { createContext } from 'react'
import type { User } from './authService'

export interface AuthContextValue {
  user: User | null
  signIn: (email: string, otp: string) => Promise<User>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
