import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Home from './pages/Home'
import SignUp from './pages/SignUp'
import Login from './pages/Login'
import CreateOrg from './pages/CreateOrg'
import JoinProgram from './pages/JoinProgram'
import AppShell from './components/AppShell'
import RosterPage from './pages/RosterPage'
import TasksPage from './pages/TasksPage'
import ComingSoon from './pages/ComingSoon'

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
        <Route
          path="equipment"
          element={
            <ComingSoon
              title="Equipment"
              tagline="Check gear out to a player, see who still has what, and stop chasing helmets in August."
              bullets={[
                'Check items out to a player and back in again',
                'See everything one player is holding, in one place',
                'A list of what is still outstanding before the season ends',
                'Flag damaged or missing gear without a spreadsheet',
              ]}
            />
          }
        />
        <Route
          path="game-day"
          element={
            <ComingSoon
              title="Game-Day Ops"
              tagline="The running order for a game day: who is travelling, what time the bus leaves, and who still has not checked in."
              bullets={[
                'A travel roster with availability for each game',
                'Departure and arrival times pushed to families',
                'Check players in as they arrive',
                'Share the day\u2019s plan without a group text',
              ]}
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
