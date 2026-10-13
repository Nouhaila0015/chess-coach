import { type ReactNode, useEffect, useRef } from 'react'
import { sanFr } from '../format'
import type { MoveRec } from '../types'

interface Props {
  moves: MoveRec[]
  // Nombre de demi-coups affichés sur le plateau (0 = position de départ).
  ply: number
  onSelect: (ply: number) => void
  // Pastille affichée devant un coup (revue).
  chip?: (index: number) => ReactNode
}

export default function MoveList({ moves, ply, onSelect, chip }: Props) {
  const current = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest' })
  }, [ply, moves.length])

  const rows: number[] = []
  for (let i = 0; i < moves.length; i += 2) rows.push(i)

  const cell = (i: number) =>
    moves[i] && (
      <button ref={ply === i + 1 ? current : undefined} className={ply === i + 1 ? 'cur' : ''} onClick={() => onSelect(i + 1)}>
        {chip?.(i)}
        {sanFr(moves[i].san)}
      </button>
    )

  return (
    <div className="moves">
      {rows.map((i) => (
        <div key={i} className="move-row">
          <i>{i / 2 + 1}.</i>
          <span>{cell(i)}</span>
          <span>{cell(i + 1)}</span>
        </div>
      ))}
    </div>
  )
}
