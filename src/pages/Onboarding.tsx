import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import type { User } from '@/types'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Film, ShieldCheck, User as UserIcon } from 'lucide-react'

type Step = 'age' | 'profile'

export default function Onboarding() {
  const api = useApi()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: me } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/me'),
  })

  // Determine starting step from existing DB state
  const [step, setStep] = useState<Step>('age')
  useEffect(() => {
    if (me?.ageConfirmed && !me?.onboardingCompleted) setStep('profile')
    if (me?.onboardingCompleted) navigate('/dashboard', { replace: true })
  }, [me, navigate])

  // ── Step 1: age ───────────────────────────────────────────────────────────
  const [ageChecked, setAgeChecked] = useState(false)
  const [ageLoading, setAgeLoading] = useState(false)
  const [ageError, setAgeError] = useState('')

  async function confirmAge() {
    if (!ageChecked) { setAgeError('You must check the box to continue.'); return }
    setAgeLoading(true)
    try {
      await api.post('/me/onboarding', { ageConfirmed: true })
      setStep('profile')
    } catch (e: unknown) {
      setAgeError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setAgeLoading(false)
    }
  }

  // ── Step 2: profile ───────────────────────────────────────────────────────
  const [username, setUsername] = useState('')
  const [preferredName, setPreferredName] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')

  // Debounced username check
  useEffect(() => {
    const u = username.toLowerCase().trim()
    if (!u) { setUsernameStatus('idle'); return }
    if (!/^[a-z0-9_-]{3,20}$/.test(u)) { setUsernameStatus('invalid'); return }
    setUsernameStatus('checking')
    const t = setTimeout(async () => {
      try {
        const res = await api.get<{ available: boolean }>(`/me/check-username/${u}`)
        setUsernameStatus(res.available ? 'ok' : 'taken')
      } catch { setUsernameStatus('idle') }
    }, 400)
    return () => clearTimeout(t)
  }, [username])

  async function finishProfile() {
    if (usernameStatus !== 'ok') { setProfileError('Choose a valid, available username.'); return }
    setProfileLoading(true)
    try {
      await api.post('/me/onboarding', {
        ageConfirmed: true,
        username: username.toLowerCase().trim(),
        preferredName: preferredName.trim() || username.trim(),
      })
      qc.invalidateQueries({ queryKey: ['me'] })
      navigate('/dashboard', { replace: true })
    } catch (e: unknown) {
      setProfileError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setProfileLoading(false)
    }
  }

  const statusMsg: Record<string, { text: string; color: string }> = {
    idle:     { text: '', color: '' },
    checking: { text: 'Checking…', color: 'var(--c-muted)' },
    ok:       { text: '✓ Available', color: '#16a34a' },
    taken:    { text: '✗ Already taken', color: '#dc2626' },
    invalid:  { text: '3-20 characters: letters, numbers, _ or -', color: '#dc2626' },
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--c-bg)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <Film size={22} style={{ color: 'var(--c-accent)' }} />
        <span className="font-semibold text-lg" style={{ color: 'var(--c-text)' }}>MovieFolio</span>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-3 mb-8">
        {(['age', 'profile'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: step === s ? 'var(--c-accent)' : (s === 'age' && step === 'profile') ? 'var(--c-accent)' : 'var(--c-surface)',
                color: (step === s || (s === 'age' && step === 'profile')) ? 'white' : 'var(--c-muted)',
              }}
            >
              {i + 1}
            </div>
            {i === 0 && <div className="w-8 h-0.5" style={{ background: step === 'profile' ? 'var(--c-accent)' : 'var(--c-border)' }} />}
          </div>
        ))}
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl border p-8"
        style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}
      >
        {step === 'age' ? (
          <div className="flex flex-col gap-5">
            <div className="text-center">
              <ShieldCheck size={36} className="mx-auto mb-3" style={{ color: 'var(--c-accent)' }} />
              <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>Age confirmation</h1>
              <p className="text-sm" style={{ color: 'var(--c-muted)' }}>
                MovieFolio is for adults only.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ageChecked}
                onChange={e => { setAgeChecked(e.target.checked); setAgeError('') }}
                className="mt-0.5 accent-[var(--c-accent)] w-4 h-4"
              />
              <span className="text-sm" style={{ color: 'var(--c-text)' }}>
                I confirm I am <strong>18 or older</strong>
              </span>
            </label>

            {ageError && <p className="text-sm" style={{ color: '#dc2626' }}>{ageError}</p>}

            <Button onClick={confirmAge} loading={ageLoading} className="w-full justify-center">
              Continue
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="text-center">
              <UserIcon size={36} className="mx-auto mb-3" style={{ color: 'var(--c-accent)' }} />
              <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>Set up your profile</h1>
              <p className="text-sm" style={{ color: 'var(--c-muted)' }}>
                Your profile will be at <strong>/u/yourname</strong>
              </p>
            </div>

            <div>
              <Input
                label="Username (your unique link)"
                value={username}
                onChange={e => { setUsername(e.target.value); setProfileError('') }}
                placeholder="e.g. filmfan_42"
                autoFocus
              />
              {usernameStatus !== 'idle' && (
                <p className="text-xs mt-1" style={{ color: statusMsg[usernameStatus].color }}>
                  {statusMsg[usernameStatus].text}
                </p>
              )}
            </div>

            <Input
              label="Display name (how visitors see you)"
              value={preferredName}
              onChange={e => setPreferredName(e.target.value)}
              placeholder="e.g. Alex, Film Nerd…"
            />

            {profileError && <p className="text-sm" style={{ color: '#dc2626' }}>{profileError}</p>}

            <Button
              onClick={finishProfile}
              loading={profileLoading}
              disabled={usernameStatus !== 'ok'}
              className="w-full justify-center"
            >
              Create my portfolio
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
