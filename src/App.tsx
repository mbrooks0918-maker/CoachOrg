import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Home from './pages/Home'
import SignUp from './pages/SignUp'
import Login from './pages/Login'
import CreateOrg from './pages/CreateOrg'
import JoinProgram from './pages/JoinProgram'
import AuthCallback from './pages/AuthCallback'
import AppShell from './components/AppShell'
import RosterPage from './pages/RosterPage'
import TasksPage from './pages/TasksPage'
import GameDayPage from './pages/GameDayPage'
import EquipmentPage from './pages/EquipmentPage'
import EventDetailPage from './pages/EventDetailPage'

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
      {/* Google returns here; the page then routes exactly as an email login does. */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/create-org"
        element={
          <RequireAuth>
            <CreateOrg />
          </RequireAuth>
        }
      />
      <Route
        path="/join"
        element={
          <RequireAuth>
            <JoinProgram />
          </RequireAuth>
        }
      />

      {/* Everything inside a program shares the navigation shell, which loads
          the program and the viewer's role once for all four sections. */}
      <Route
        path="/program/:programId"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="roster" replace />} />
        <Route path="roster" element={<RosterPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="equipment" element={<EquipmentPage />} />
        <Route path="game-day" element={<GameDayPage />} />
        <Route path="game-day/:eventId" element={<EventDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
