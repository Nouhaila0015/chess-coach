import { Chess } from 'chess.js'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import 'chessground/assets/chessground.base.css'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import type { Color } from '../types'
import './board.css'

export interface Badge {
  square: string
  node: ReactNode
}

interface Props {
  fen: string
  orientation: Color
  lastMove?: [string, string]
  // Vrai si je peux jouer le camp au trait.
  interactive?: boolean
  onMove?: (from: string, to: string) => void
  shapes?: DrawShape[]
  badges?: Badge[]
  // À changer pour forcer la remise en place des pièces (promotion annulée, coup refusé).
  nonce?: number
  children?: ReactNode
}

const FILES = 'abcdefgh'

// Coin haut-gauche d'une case, en pourcentage du plateau.
export function squarePos(square: string, orientation: Color) {
  const f = FILES.indexOf(square[0])
  const r = Number(square[1])
  return orientation === 'w' ? { left: f * 12.5, top: (8 - r) * 12.5 } : { left: (7 - f) * 12.5, top: (r - 1) * 12.5 }
}

export default function Board({ fen, orientation, lastMove, interactive, onMove, shapes, badges, nonce, children }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  const info = useMemo(() => {
    const chess = new Chess(fen)
    const dests = new Map<Key, Key[]>()
    for (const m of chess.moves({ verbose: true })) {
      dests.set(m.from, [...(dests.get(m.from) ?? []), m.to])
    }
    return { turn: chess.turn() === 'w' ? ('white' as const) : ('black' as const), check: chess.inCheck(), dests }
  }, [fen])

  useEffect(() => {
    api.current = Chessground(el.current!, {
      coordinates: false,
      animation: { duration: 200 },
      premovable: { enabled: false },
      drawable: { enabled: false, visible: true },
      movable: { free: false, events: { after: (from, to) => onMoveRef.current?.(from, to) } },
    })
    return () => api.current?.destroy()
  }, [])

  useEffect(() => {
    api.current?.set({
      fen,
      orientation: orientation === 'w' ? 'white' : 'black',
      turnColor: info.turn,
      check: info.check,
      lastMove: lastMove as Key[] | undefined,
      selected: undefined,
      viewOnly: !interactive,
      movable: { color: interactive ? info.turn : undefined, dests: interactive ? info.dests : new Map() },
    })
  }, [fen, orientation, lastMove, interactive, info, nonce])

  useEffect(() => {
    api.current?.setAutoShapes(shapes ?? [])
  }, [shapes, fen])

  const files = orientation === 'w' ? FILES : [...FILES].reverse().join('')
  return (
    <div className="board">
      <div ref={el} />
      {[...files].map((f, i) => (
        <span key={f} className={`coord file ${i % 2 === 0 ? 'on-dark' : 'on-light'}`} style={{ left: `${i * 12.5}%`, top: '87.5%' }}>
          {f}
        </span>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className={`coord ${i % 2 === 0 ? 'on-light' : 'on-dark'}`} style={{ left: 0, top: `${i * 12.5}%` }}>
          {orientation === 'w' ? 8 - i : i + 1}
        </span>
      ))}
      {badges?.map((b) => {
        const p = squarePos(b.square, orientation)
        return (
          <span key={b.square} className="badge" style={{ left: `${p.left + 11.5}%`, top: `${p.top + 1}%` }}>
            {b.node}
          </span>
        )
      })}
      {children}
    </div>
  )
}
