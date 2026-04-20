'use client'
import { getSupabase } from './supabase'
import type { UserProfile } from './types'

export async function getUser() {
  const sb = getSupabase()
  const { data: { user } } = await sb.auth.getUser()
  return user
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const sb = getSupabase()
  const { data } = await sb
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

export async function signIn(email: string, password: string) {
  const sb = getSupabase()
  return sb.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  const sb = getSupabase()
  return sb.auth.signOut()
}

export async function getCurrentUserWithProfile(): Promise<{
  user: any
  profile: UserProfile | null
} | null> {
  const user = await getUser()
  if (!user) return null
  const profile = await getUserProfile(user.id)
  return { user, profile }
}
