import { useCallback, useMemo, useState, type ReactNode } from 'react'
import * as authService from './authService'
import { AuthContext } from './context'

export function AuthProvider({ children, initialUser }: { children: ReactNode, initialUser?: authService.User | null }) {
  const [user, setUser] = useState<authService.User | null>(() =>
    initialUser !== undefined ? initialUser : authService.getCurrentUser(),
  )

  const signIn = useCallback(async (email: string, otp: string) => {
    const next = await authService.signIn(email, otp)
    setUser(next)
    return next
  }, [])

  const signOut = useCallback(async () => {
    await authService.signOut()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
