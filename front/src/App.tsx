import { useCallback, useEffect, useState } from 'react'
import { get } from './api'
import { useRoute } from './router'

interface AppState {
  elo: number
}

const LINKS = [
  { path: '', label: 'Jouer' },
  { path: 'progression', label: 'Progression' },
  { path: 'lecons', label: 'Leçons' },
]

export default function App() {
  const route = useRoute()
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    get<AppState>('/api/state').then(setState, (e: Error) => setError(e.message))
  }, [])
  useEffect(refresh, [refresh])

  const section = route[0] ?? ''

  return (
    <div className="layout">
      <nav className="nav">
        <div className="logo">
          Chess<b>Coach</b>
        </div>
        {LINKS.map((l) => (
          <a key={l.path} href={`#/${l.path}`} className={section === l.path ? 'on' : ''}>
            {l.label}
          </a>
        ))}
        <div className="elo">
          Mon Elo<b>{state?.elo ?? '…'}</b>
        </div>
      </nav>
      <main className="content">
        {error && <p className="page error">{error}</p>}
        <div className="page">
          <h2>{LINKS.find((l) => l.path === section)?.label ?? 'Jouer'}</h2>
          <p>Écran en cours de construction.</p>
        </div>
      </main>
    </div>
  )
}
