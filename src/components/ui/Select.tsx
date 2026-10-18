import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  options: { value: string; label: string }[]
}

const Select = forwardRef<HTMLSelectElement, Props>(({ label, options, className, ...props }, ref) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-sm font-medium text-[var(--c-muted)]">{label}</label>}
    <select
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]',
        'px-3 py-2 text-sm text-[var(--c-text)]',
        'focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)] transition',
        className,
      )}
      {...props}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
))
Select.displayName = 'Select'
export default Select
