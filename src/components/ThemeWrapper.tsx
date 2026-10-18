import { useEffect } from 'react'
import type { Theme } from '@/types'

interface Props {
  theme: Theme
  children: React.ReactNode
}

export default function ThemeWrapper({ theme, children }: Props) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [theme])

  return <div data-theme={theme} style={{ minHeight: '100dvh', background: 'var(--c-bg)', color: 'var(--c-text)' }}>{children}</div>
}
