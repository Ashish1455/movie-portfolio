import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

type Props = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }

const Input = forwardRef<HTMLInputElement, Props>(({ label, error, className, ...props }, ref) => (
  <div className="flex flex-col gap-1">
    {label && (
      <label className="text-sm font-medium text-[var(--c-muted)]">{label}</label>
    )}
    <input
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]',
        'px-3 py-2 text-sm text-[var(--c-text)] placeholder:text-[var(--c-subtle)]',
        'focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)] transition',
        error && 'border-red-500',
        className,
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
))
Input.displayName = 'Input'
export default Input
