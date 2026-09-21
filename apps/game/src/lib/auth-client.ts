import { createAuthClient } from 'better-auth/react'
import { anonymousClient } from 'better-auth/client/plugins'

/**
 * Client-side Better Auth (browser only — never import server `auth` here).
 * Base URL defaults to `/api/auth` (same origin).
 *
 * Use `authClient.useSession()`, `authClient.signIn.*`, `authClient.signUp.*`,
 * `authClient.signOut()` at call sites (destructuring breaks type portability).
 */
export const authClient = createAuthClient({
  plugins: [anonymousClient()],
})
