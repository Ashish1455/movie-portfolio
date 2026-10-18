import { Link } from 'react-router-dom'
import { Film } from 'lucide-react'

export default function NotFound() {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center"
      style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}
    >
      <Film size={48} style={{ color: 'var(--c-subtle)' }} />
      <h1 className="text-4xl font-bold">404</h1>
      <p style={{ color: 'var(--c-muted)' }}>This page doesn't exist.</p>
      <Link
        to="/"
        className="mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
        style={{ background: 'var(--c-accent)' }}
      >
        Go home
      </Link>
    </div>
  )
}
