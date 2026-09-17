/**
 * Server entry point.
 */

import { GameServer } from './GameServer.js'

const PORT = parseInt(process.env['PORT'] ?? '3001', 10)

const server = new GameServer(PORT)

server.start().catch((err) => {
  console.error('❌ Server failed to start:', err)
  process.exit(1)
})

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down…')
  server.stop()
  process.exit(0)
})
