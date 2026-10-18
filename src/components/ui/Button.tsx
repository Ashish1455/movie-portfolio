import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'outline'
type Size    = 'sm' | 'md' | 'lg'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-[var(--c-accent)] hover:bg-[var(--c-accent-h)] text-white',
  ghost:   'bg-transparent hover:bg-[var(--c-surface)] text-[var(--c-text)]',
  danger:  'bg-red-600 hover:bg-red-700 text-white',
  outline: 'bg-transparent border border-[var(--c-border)] hover:bg-[var(--c-surface)] text-[var(--c-text)]',
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

const Button = forwardRef<HTMLButtonElement, Props>(({
  variant = 'primary', size = 'md', loading, disabled, className, children, ...props
}, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none',
      'disabled:opacity-50 disabled:pointer-events-none',
      variantStyles[variant],
      sizeStyles[size],
      className,
    )}
    {...props}
  >
    {loading && (
      <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
    )}
    {children}
  </button>
))
Button.displayName = 'Button'
export default Button
