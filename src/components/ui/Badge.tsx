import { cn } from '@/lib/utils'

type Color = 'gray' | 'blue' | 'purple' | 'green' | 'yellow' | 'red'

interface Props {
  children: React.ReactNode
  color?: Color
  className?: string
}

const colors: Record<Color, string> = {
  gray:   'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  blue:   'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  green:  'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red:    'bg-red-100 text-red-700',
}

export default function Badge({ children, color = 'gray', className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colors[color],
        className,
      )}
    >
      {children}
    </span>
  )
}
