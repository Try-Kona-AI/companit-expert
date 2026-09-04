import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Loading } from './ui'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { email, loading } = useAuth()
  if (loading) return <Loading />
  if (!email) return <Navigate to="/login" replace />
  return <>{children}</>
}
