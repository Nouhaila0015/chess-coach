import { pieceUrl } from '../pieces'
import type { Color } from '../types'

const START: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }

// Pièces manquantes de chaque camp, d'après la position.
function missing(fen: string) {
  const board = fen.split(' ')[0]
  const out = { w: [] as string[], b: [] as string[], score: { w: 0, b: 0 } }
  for (const color of ['w', 'b'] as const) {
    for (const p of ['q', 'r', 'b', 'n', 'p']) {
      const letter = color === 'w' ? p.toUpperCase() : p
      const count = board.split(letter).length - 1
      for (let i = count; i < START[p]; i++) out[color].push(p)
      out.score[color] += count * VALUE[p]
    }
  }
  return out
}

interface Props {
  name: string
  elo: number
  color: Color
  fen: string
  bot?: boolean
}

export default function PlayerBar({ name, elo, color, fen, bot }: Props) {
  const m = missing(fen)
  const other = color === 'w' ? 'b' : 'w'
  const advantage = m.score[color] - m.score[other]
  return (
    <div className="player">
      <div className="avatar">{bot ? '🤖' : '🙂'}</div>
      <span className="name">{name}</span>
      <span className="rating">({elo})</span>
      <span className="captured">
        {m[other].map((p, i) => (
          <img key={i} src={pieceUrl[other + p]} alt="" className={i > 0 && m[other][i - 1] === p ? 'same' : ''} />
        ))}
        {advantage > 0 && <span className="adv">+{advantage}</span>}
      </span>
    </div>
  )
}
