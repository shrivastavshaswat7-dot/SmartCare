import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch role from profiles table for a given user id
  const fetchRole = async (userId) => {
    if (!userId) { setRole(null); return }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
      setRole(data?.role || 'patient')
    } catch {
      setRole('patient')
    }
  }

  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) await fetchRole(currentUser.id)
      setLoading(false)
    })

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (currentUser) await fetchRole(currentUser.id)
        else setRole(null)
      }
    )

    // Cleanup listener on unmount
    return () => subscription.unsubscribe()
  }, [])

  const signUp = async ({ email, password, name, phone }) => {
    // Create the auth user (email confirmation disabled — session is immediate)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, phone } },
    })
    if (error) return { data, error }

    // Immediately update context so ProtectedRoute sees the user
    // before the caller navigates away from /register
    if (data.user) {
      setUser(data.user)
    }

    // Create profile row now (user has an active session)
    if (data.user) {
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: data.user.id,
        name,
        email,
        phone,
        role: 'patient',
      })
      if (profileErr) {
        console.warn('Profile insert after signup:', profileErr.message)
      }
    }

    // Set role for newly registered patient
    if (data.user) setRole('patient')

    return { data, error }
  }

  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) return { data, error }

    // Immediately update context so ProtectedRoute sees the user
    // before the caller navigates away from /login
    if (data.user) {
      setUser(data.user)
    }

    // On first login, create the profile row if it doesn't exist yet
    const authUser = data.user
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authUser.id)
      .single()

    if (!existingProfile) {
      const meta = authUser.user_metadata
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: authUser.id,
        name: meta.name || '',
        email: authUser.email,
        phone: meta.phone || '',
        role: 'patient',
      })
      if (profileErr) {
        console.warn('Profile insert after login:', profileErr.message)
      }
      setRole('patient')
    } else {
      setRole(existingProfile.role || 'patient')
    }

    return { data, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    setRole(null)
    return { error }
  }

  const value = { user, role, loading, signUp, signIn, signOut }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
