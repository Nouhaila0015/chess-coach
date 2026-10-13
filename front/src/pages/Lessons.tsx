import { useEffect, useState } from 'react'
import { get } from '../api'
import MiniBoard from '../components/MiniBoard'
import type { Lesson } from '../types'

const STATUS = {
  ok: { label: 'Réussie', className: 'ok' },
  retry: { label: 'À revoir', className: 'retry' },
  new: { label: 'Exercice à faire', className: 'retry' },
}

const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Lessons() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    get<Lesson[]>('/api/lessons').then(setLessons, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="page error">{error}</p>
  if (!lessons) return null
  return (
    <div className="page">
      <h2>Mes leçons</h2>
      <p>Une leçon par partie. Ouvre une leçon pour relire l'explication et refaire l'exercice.</p>
      {lessons.length === 0 && <p className="muted">Ton carnet est vide : la première leçon arrivera après la revue de ta prochaine partie.</p>}
      <div className="cards">
        {lessons.map((l) => (
          <a key={l.id} className="card" href={`#/lecon/${l.id}`}>
            <MiniBoard fen={l.fen} orientation={l.orientation} />
            <div className="card-body">
              <h3>{l.title}</h3>
              <p>{l.principle}</p>
              <div className="card-foot">
                <span className={`tag ${STATUS[l.status].className}`}>{STATUS[l.status].label}</span>
                <span className="muted">{date.format(new Date(l.createdAt))}</span>
                <span className="open">Relire et refaire l'exercice →</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
