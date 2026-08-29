import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'
import { registerServiceWorker } from './lib/push'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Registered after render so it never delays first paint. This only installs
// the worker; it does not prompt for permission -- that needs a user gesture,
// which the Enable Notifications button provides.
registerServiceWorker()
