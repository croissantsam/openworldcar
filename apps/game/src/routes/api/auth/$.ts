import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../lib/auth.js'

/**
 * Better Auth catch-all: /api/auth/sign-up/email, /sign-in/anonymous,
 * /sign-out, /get-session, /ok, … — handled entirely by `auth.handler`.
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
})
