import { execSync } from 'node:child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Build identity, stamped in at build time.
 *
 * Nothing here is hand-maintained: a number somebody has to remember to bump
 * is a number that silently goes stale, and then the badge is worse than no
 * badge because it is confidently wrong. On Vercel these come from the build
 * environment; locally they come from git; if both fail the app says "dev"
 * rather than inventing something.
 */
function git(command: string): string {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

const sha = process.env.VERCEL_GIT_COMMIT_SHA || git('git rev-parse HEAD')
const ref = process.env.VERCEL_GIT_COMMIT_REF || git('git rev-parse --abbrev-ref HEAD')
const message = process.env.VERCEL_GIT_COMMIT_MESSAGE || git('git log -1 --pretty=%s')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_SHA__: JSON.stringify(sha),
    __BUILD_REF__: JSON.stringify(ref || 'local'),
    __BUILD_MESSAGE__: JSON.stringify(message),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
