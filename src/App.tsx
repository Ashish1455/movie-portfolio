import { Routes, Route, Navigate } from 'react-router-dom'
import { SignIn, SignUp, useAuth } from '@clerk/clerk-react'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import type { User } from '@/types'
import Landing from '@/pages/Landing'
import Onboarding from '@/pages/Onboarding'
import Dashboard from '@/pages/Dashboard'
import Profile from '@/pages/Profile'
import NotFound from '@/pages/NotFound'

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--c-bg)' }}>
      <div className="w-8 h-8 rounded-full border-2 border-[var(--c-border)] border-t-[var(--c-accent)] animate-spin" />
    </div>
  )
}

// ── Route guards ──────────────────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) return <Spinner />
  if (!isSignedIn) return <Navigate to="/sign-in" replace />
  return <>{children}</>
}

function RequireOnboarded({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const api = useApi()
  const { data: me, isLoading } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/me'),
    enabled: !!isSignedIn,
  })

  if (!isLoaded || isLoading) return <Spinner />
  if (!isSignedIn) return <Navigate to="/sign-in" replace />
  if (!me?.ageConfirmed || !me?.onboardingCompleted) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) return <Spinner />

  return (
    <Routes>
      <Route
        path="/"
        element={isSignedIn ? <Navigate to="/dashboard" replace /> : <Landing />}
      />

      <Route
        path="/sign-in/*"
        element={<SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/dashboard" />}
      />
      <Route
        path="/sign-up/*"
        element={<SignUp routing="path" path="/sign-up" fallbackRedirectUrl="/onboarding" />}
      />

      <Route
        path="/onboarding"
        element={<RequireAuth><Onboarding /></RequireAuth>}
      />

      <Route
        path="/dashboard"
        element={<RequireOnboarded><Dashboard /></RequireOnboarded>}
      />

      <Route path="/u/:username" element={<Profile />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
