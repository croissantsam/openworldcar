import { createFileRoute } from '@tanstack/react-router'
import App from '../App.js'

export const Route = createFileRoute('/')({
  component: GamePage,
})

function GamePage() {
  return <App />
}
