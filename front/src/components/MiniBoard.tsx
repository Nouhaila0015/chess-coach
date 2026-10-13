import { pieceUrl } from '../pieces'
import type { Color } from '../types'

// Aperçu statique d'une position (carnet de leçons).
export default function MiniBoard({ fen, orientation }: { fen: string; orientation: Color }) {
  const rows = fen.split(' ')[0].split('/')
  const cells: (string | null)[] = []
  for (const row of rows) {
    for (const c of row) {
      if (/\d/.test(c)) for (let i = 0; i < Number(c); i++) cells.push(null)
      else cells.push((c === c.toUpperCase() ? 'w' : 'b') + c.toLowerCase())
    }
  }
  if (orientation === 'b') cells.reverse()
  return (
    <div className="mini-board">
      {cells.map((piece, i) => (
        <span key={i}>{piece && <img src={pieceUrl[piece]} alt="" />}</span>
      ))}
    </div>
  )
}
