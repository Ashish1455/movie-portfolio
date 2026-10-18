import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRating(rating: number | null): string {
  if (rating === null) return '—'
  if (rating >= 11) return `★${rating}`
  return String(rating)
}

export function isSpecial(rating: number | null): boolean {
  return rating !== null && rating >= 11
}

export function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    movie: 'Movie', tv_series: 'TV Series', anime: 'Anime', documentary: 'Documentary',
  }
  return map[cat] ?? cat
}

export function whereWatchedLabel(w: string): string {
  const map: Record<string, string> = {
    theater: 'Theater', ott: 'Streaming', other: 'Other',
  }
  return map[w] ?? w
}

export function siteLabel(site: string): string {
  const map: Record<string, string> = {
    imdb: 'IMDb', letterboxd: 'Letterboxd', rotten_tomatoes: 'Rotten Tomatoes',
  }
  return map[site] ?? site
}

export function detectSite(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    if (host === 'imdb.com') return 'imdb'
    if (host === 'letterboxd.com') return 'letterboxd'
    if (host === 'rottentomatoes.com') return 'rotten_tomatoes'
    return null
  } catch { return null }
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
