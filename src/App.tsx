import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Home from './pages/Home'
import SignUp from './pages/SignUp'
import Login from './pages/Login'
import CreateOrg from './pages/CreateOrg'
import ProgramDashboard from './pages/ProgramDashboard'

/**
 * Waits for the initial session check before deciding. Without the `loading`
 * gate a signed-in user gets bounced to /login on every hard refresh, because
 * the session is restored asynchronously.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6">
        <p className="font-body text-muted">Loading…</p>
      </main>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/create-org"
        element={
          <RequireAuth>
            <CreateOrg />
          </RequireAuth>
        }
      />
      <Route
        path="/program/:programId"
        element={
          <RequireAuth>
            <ProgramDashboard />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
