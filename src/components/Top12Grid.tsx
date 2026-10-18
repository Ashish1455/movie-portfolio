import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Top12Item, PortfolioEntry } from '@/types'
import { formatRating, isSpecial, cn } from '@/lib/utils'
import { Film, Star, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useApi } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

// ── Sortable slot ─────────────────────────────────────────────────────────────
function Slot({ item, rank, onRemove }: { item: Top12Item; rank: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.entryId })
  const special = isSpecial(item.rating)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative rounded-xl overflow-hidden border border-[var(--c-border)] bg-[var(--c-card)] aspect-[2/3]',
        isDragging && 'opacity-40 z-50 shadow-2xl',
        'cursor-grab active:cursor-grabbing',
      )}
      {...attributes}
      {...listeners}
    >
      {/* Poster */}
      {item.posterUrl
        ? <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        : (
          <div className="w-full h-full bg-[var(--c-surface)] flex items-center justify-center">
            <Film size={28} className="text-[var(--c-subtle)]" />
          </div>
        )
      }

      {/* Rank badge */}
      <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/70 text-white text-xs font-bold flex items-center justify-center">
        {rank}
      </div>

      {/* Rating */}
      {item.rating !== null && (
        <div className={cn(
          'absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold',
          special ? 'bg-[var(--c-star)] text-white' : 'bg-black/70 text-white',
        )}>
          <Star size={9} />
          {formatRating(item.rating)}
        </div>
      )}

      {/* Title overlay */}
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{item.title}</p>
        {item.year && <p className="text-white/60 text-xs">{item.year}</p>}
      </div>

      {/* Remove button */}
      <button
        onClick={e => { e.stopPropagation(); onRemove() }}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-auto"
        style={{ display: 'flex' }}
        onPointerDown={e => e.stopPropagation()}
      >
        <X size={10} />
      </button>
    </div>
  )
}

// ── Empty slot ────────────────────────────────────────────────────────────────
function EmptySlot({ rank, onAdd }: { rank: number; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="aspect-[2/3] rounded-xl border-2 border-dashed border-[var(--c-border)] flex flex-col items-center justify-center gap-1 hover:border-[var(--c-accent)] transition group"
    >
      <span className="text-xs text-[var(--c-subtle)] font-medium">#{rank}</span>
      <Plus size={20} className="text-[var(--c-border)] group-hover:text-[var(--c-accent)] transition" />
    </button>
  )
}

// ── Add-from-collection picker ────────────────────────────────────────────────
function PickerModal({ entries, current, onPick, onClose }: {
  entries: PortfolioEntry[]
  current: string[]
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const available = entries.filter(e =>
    !current.includes(e.id) &&
    e.title.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl w-full max-w-sm flex flex-col max-h-[70dvh] shadow-2xl">
        <div className="px-4 py-3 border-b border-[var(--c-border)] flex items-center justify-between">
          <span className="font-semibold text-sm text-[var(--c-text)]">Add to Top 12</span>
          <button onClick={onClose} className="text-[var(--c-muted)] hover:text-[var(--c-text)]"><X size={16} /></button>
        </div>
        <div className="px-4 py-2 border-b border-[var(--c-border)]">
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full text-sm bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-1.5 text-[var(--c-text)] focus:outline-none"
          />
        </div>
        <ul className="overflow-y-auto flex-1 py-1">
          {available.length === 0 && (
            <li className="px-4 py-3 text-sm text-[var(--c-subtle)]">No titles available.</li>
          )}
          {available.map(e => (
            <li key={e.id}>
              <button
                onClick={() => { onPick(e.id); onClose() }}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[var(--c-surface)] text-left"
              >
                <div className="w-8 h-11 rounded overflow-hidden bg-[var(--c-surface)] shrink-0">
                  {e.posterUrl
                    ? <img src={e.posterUrl} alt={e.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Film size={12} className="text-[var(--c-subtle)]" /></div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--c-text)] truncate">{e.title}</p>
                  <p className="text-xs text-[var(--c-muted)]">{e.year}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Main Top12Grid ────────────────────────────────────────────────────────────
interface Props {
  items: Top12Item[]
  allEntries?: PortfolioEntry[]
  readOnly?: boolean
  onUpdate?: (ordered: string[]) => void
}

export default function Top12Grid({ items, allEntries = [], readOnly, onUpdate }: Props) {
  const api = useApi()
  const qc = useQueryClient()
  const [localItems, setLocalItems] = useState(items)
  const [picker, setPicker] = useState(false)

  // Keep in sync when props change
  if (items !== localItems && items.length !== localItems.length) setLocalItems(items)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function persist(ordered: Top12Item[]) {
    await api.put('/top12', { entryIds: ordered.map(i => i.entryId) })
    qc.invalidateQueries({ queryKey: ['top12'] })
    onUpdate?.(ordered.map(i => i.entryId))
  }

  function handleDragEnd(ev: DragEndEvent) {
    const { active, over } = ev
    if (!over || active.id === over.id) return
    const oldIdx = localItems.findIndex(i => i.entryId === active.id)
    const newIdx = localItems.findIndex(i => i.entryId === over.id)
    const reordered = arrayMove(localItems, oldIdx, newIdx).map((item, i) => ({ ...item, rank: i + 1 }))
    setLocalItems(reordered)
    persist(reordered)
  }

  async function remove(entryId: string) {
    const next = localItems.filter(i => i.entryId !== entryId).map((item, i) => ({ ...item, rank: i + 1 }))
    setLocalItems(next)
    await persist(next)
  }

  async function add(entryId: string) {
    if (localItems.length >= 12) return
    const entry = allEntries.find(e => e.id === entryId)
    if (!entry) return
    const newItem: Top12Item = {
      rank: localItems.length + 1,
      entryId: entry.id,
      title: entry.title,
      year: entry.year,
      posterUrl: entry.posterUrl,
      category: entry.category,
      rating: entry.rating,
      isSeries: entry.isSeries,
    }
    const next = [...localItems, newItem]
    setLocalItems(next)
    await persist(next)
  }

  const slots = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={readOnly ? undefined : handleDragEnd}
      >
        <SortableContext
          items={localItems.map(i => i.entryId)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-6 lg:grid-cols-6 gap-2">
            {slots.map(rank => {
              const item = localItems.find(i => i.rank === rank)
              if (item) {
                return readOnly
                  ? (
                    <div key={rank} className="relative rounded-xl overflow-hidden border border-[var(--c-border)] bg-[var(--c-card)] aspect-[2/3] group">
                      {item.posterUrl
                        ? <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full bg-[var(--c-surface)] flex items-center justify-center"><Film size={24} className="text-[var(--c-subtle)]" /></div>
                      }
                      <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/70 text-white text-xs font-bold flex items-center justify-center">{rank}</div>
                      {item.rating !== null && (
                        <div className={cn('absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold', isSpecial(item.rating) ? 'bg-[var(--c-star)] text-white' : 'bg-black/70 text-white')}>
                          <Star size={9} />{formatRating(item.rating)}
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                        <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{item.title}</p>
                      </div>
                    </div>
                  )
                  : <Slot key={rank} item={item} rank={rank} onRemove={() => remove(item.entryId)} />
              }
              return readOnly
                ? (
                  <div key={rank} className="aspect-[2/3] rounded-xl border border-dashed border-[var(--c-border)] flex items-center justify-center">
                    <span className="text-xs text-[var(--c-subtle)]">#{rank}</span>
                  </div>
                )
                : <EmptySlot key={rank} rank={rank} onAdd={() => {
                  if (localItems.length >= 12) {
                    alert('Top 12 is full. Remove an entry first.')
                    return
                  }
                  setPicker(true)
                }} />
            })}
          </div>
        </SortableContext>
      </DndContext>

      {picker && (
        <PickerModal
          entries={allEntries}
          current={localItems.map(i => i.entryId)}
          onPick={add}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  )
}
