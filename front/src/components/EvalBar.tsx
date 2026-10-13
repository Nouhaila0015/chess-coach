import type { Color, Eval } from '../types'

// Part des Blancs dans la barre, d'après les chances de gain.
export function whiteShare(e: Eval): number {
  if (e.mate !== null) return e.mate > 0 || (e.mate === 0 && e.cp > 0) ? 100 : 0
  return 100 / (1 + Math.exp(-0.00368208 * e.cp))
}

export function evalLabel(e: Eval): string {
  if (e.mate !== null) return e.mate === 0 ? '#' : `M${Math.abs(e.mate)}`
  const pawns = Math.abs(e.cp) / 100
  return pawns.toFixed(1).replace('.', ',')
}

// Barre d'évaluation verticale, mon camp en bas.
export default function EvalBar({ value, orientation }: { value: Eval; orientation: Color }) {
  const white = whiteShare(value)
  const whiteAhead = white >= 50
  const whiteAtBottom = orientation === 'w'
  return (
    <div className="evalbar" title="Évaluation de Stockfish">
      <div className="white" style={{ height: `${white}%`, [whiteAtBottom ? 'bottom' : 'top']: 0 }} />
      <span className={`${whiteAhead ? 'dark' : 'light'} ${whiteAhead === whiteAtBottom ? 'low' : 'high'}`}>{evalLabel(value)}</span>
    </div>
  )
}
