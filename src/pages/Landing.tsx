import { Link } from 'react-router-dom'
import { Film, Star, List, Users } from 'lucide-react'

const features = [
  { icon: Film,  title: 'Your collection',   desc: 'Track every movie, series, anime and documentary you\'ve watched.' },
  { icon: Star,  title: 'Personal ratings',  desc: '1–10 scale plus five special slots for your all-time favourites.' },
  { icon: List,  title: 'Top 12',            desc: 'Curate and rank your twelve favourites with drag-and-drop.' },
  { icon: Users, title: 'Public profiles',   desc: 'Share your portfolio at /u/yourname — on your own terms.' },
]

export default function Landing() {
  return (
    <div style={{ background: 'var(--c-bg)', color: 'var(--c-text)', minHeight: '100dvh' }}>
      {/* Nav */}
      <header className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <Film size={20} style={{ color: 'var(--c-accent)' }} />
          MovieFolio
        </span>
        <div className="flex gap-3">
          <Link
            to="/sign-in"
            className="px-4 py-1.5 text-sm rounded-lg border font-medium transition"
            style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
          >
            Sign in
          </Link>
          <Link
            to="/sign-up"
            className="px-4 py-1.5 text-sm rounded-lg font-medium text-white transition"
            style={{ background: 'var(--c-accent)' }}
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1
          className="text-4xl sm:text-5xl font-bold leading-tight mb-5"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Your movies,<br />your ratings.
        </h1>
        <p className="text-lg mb-8" style={{ color: 'var(--c-muted)' }}>
          Build a beautiful, shareable portfolio of everything you've watched. No ads, no algorithmic recommendations — just your personal film record.
        </p>
        <Link
          to="/sign-up"
          className="inline-block px-7 py-3 rounded-xl text-base font-semibold text-white transition hover:opacity-90"
          style={{ background: 'var(--c-accent)' }}
        >
          Create your portfolio →
        </Link>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-4 pb-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map(f => (
            <div
              key={f.title}
              className="rounded-xl p-5 border"
              style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}
            >
              <f.icon size={22} className="mb-3" style={{ color: 'var(--c-accent)' }} />
              <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--c-text)' }}>{f.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--c-muted)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center pb-8 text-xs" style={{ color: 'var(--c-subtle)' }}>
        MovieFolio · For film fans, by film fans
      </footer>
    </div>
  )
}
