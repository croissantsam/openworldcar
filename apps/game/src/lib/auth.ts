import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous } from 'better-auth/plugins/anonymous'
import { db } from './db.js'

/**
 * Better Auth — World Drive.
 *
 * - email/password for permanent accounts (no email verification in V1:
 *   no SMTP is configured, so sign-up signs in directly)
 * - `anonymous()` plugin for one-click guest accounts (auto-created on
 *   first launch, convertible to a permanent account later)
 *
 * Session cookies are httpOnly; the client talks to /api/auth/* only.
 */
export const auth = betterAuth({
  appName: 'World Drive',
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  plugins: [anonymous()],
  trustedOrigins: ['http://localhost:5173'],
})

export type Session = typeof auth.$Infer.Session
