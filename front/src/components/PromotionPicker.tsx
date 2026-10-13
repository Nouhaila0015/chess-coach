import { pieceUrl } from '../pieces'
import type { Color } from '../types'
import { squarePos } from './Board'

interface Props {
  square: string
  color: Color
  orientation: Color
  onPick: (piece: 'q' | 'r' | 'b' | 'n') => void
  onCancel: () => void
}

// Fenêtre de choix de la pièce de promotion, posée sur la case d'arrivée.
export default function PromotionPicker({ square, color, orientation, onPick, onCancel }: Props) {
  const pos = squarePos(square, orientation)
  const down = pos.top > 0
  return (
    <>
      <div className="promotion-veil" onClick={onCancel} />
      <div className={`promotion ${down ? 'down' : ''}`} style={{ left: `${pos.left}%`, [down ? 'bottom' : 'top']: 0 }}>
        {(['q', 'n', 'r', 'b'] as const).map((p) => (
          <button key={p} onClick={() => onPick(p)} aria-label={`Promotion ${p}`}>
            <img src={pieceUrl[color + p]} alt="" />
          </button>
        ))}
        <button className="cancel" onClick={onCancel} aria-label="Annuler">
          ✕
        </button>
      </div>
    </>
  )
}
