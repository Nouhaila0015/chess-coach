import { useEffect, useState } from 'react'
import { get } from '../api'

interface ProgressData {
  elo: number
  best: number
  games: number
  wins: number
  draws: number
  losses: number
  history: number[]
}

const W = 900
const H = 360
const PAD = { left: 44, right: 20, top: 16, bottom: 30 }

function Curve({ history }: { history: number[] }) {
  const min = Math.floor((Math.min(...history) - 20) / 50) * 50
  const max = Math.ceil((Math.max(...history) + 20) / 50) * 50
  const n = Math.max(history.length - 1, 1)
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / n
  const y = (v: number) => PAD.top + ((max - v) * (H - PAD.top - PAD.bottom)) / (max - min)
  const ticks: number[] = []
  const stepY = (max - min) / 50 > 8 ? 100 : 50
  for (let v = min; v <= max; v += stepY) ticks.push(v)
  const stepX = Math.ceil(history.length / 16)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="curve" role="img" aria-label="Courbe de mon Elo">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#3c3a37" />
          <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <polyline fill="none" stroke="#81b64c" strokeWidth="3" strokeLinejoin="round" points={history.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      {history.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={history.length > 60 ? 2.5 : 5} fill={i > 0 && v < history[i - 1] ? '#ca3431' : '#81b64c'}>
            <title>{i === 0 ? `Départ : ${v}` : `Partie ${i} : ${v}`}</title>
          </circle>
          {i > 0 && i % stepX === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle">
              {i}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

export default function Progress() {
  const [data, setData] = useState<ProgressData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    get<ProgressData>('/api/progress').then(setData, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="page error">{error}</p>
  if (!data) return null
  return (
    <div className="page">
      <h2>Progression</h2>
      <div className="stats">
        <div>
          Elo actuel<b>{data.elo}</b>
        </div>
        <div>
          Meilleur Elo<b>{data.best}</b>
        </div>
        <div>
          Parties jouées<b>{data.games}</b>
        </div>
        <div>
          Victoires / Nulles / Défaites
          <b>
            {data.wins} / {data.draws} / {data.losses}
          </b>
        </div>
      </div>
      <div className="panel">
        <h3>Mon Elo, partie après partie</h3>
        {data.games === 0 ? <p>Joue une première partie pour voir ta courbe.</p> : <Curve history={data.history} />}
      </div>
    </div>
  )
}
