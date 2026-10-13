import type { DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, post } from '../api'
import Board from '../components/Board'
import Chip, { CATEGORIES, CATEGORY } from '../components/Chip'
import EvalBar, { whiteShare } from '../components/EvalBar'
import MoveList from '../components/MoveList'
import PlayerBar from '../components/PlayerBar'
import Tutor from '../components/Tutor'
import { sanFr } from '../format'
import { navigate } from '../router'
import { playMove } from '../sounds'
import { stop } from '../speech'
import { type Review as ReviewData, type ReviewState, START_FEN } from '../types'

const START_EVAL = { cp: 20, mate: null }
const GRAPH_COLORS: Record<string, string> = { blunder: '#ca3431', mistake: '#e58f2a', miss: '#ee6b55', brilliant: '#1baca6', great: '#5c8bb0' }

function EvalGraph({ review, ply, onSelect }: { review: ReviewData; ply: number; onSelect: (ply: number) => void }) {
  const W = 364
  const H = 60
  const n = review.moves.length
  const x = (i: number) => (i * W) / n
  const y = (share: number) => H - (share * H) / 100
  const points = [START_EVAL, ...review.moves.map((m) => m.evalAfter)].map((e, i) => `${x(i)},${y(whiteShare(e))}`)
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="eval-graph"
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect()
        onSelect(Math.max(1, Math.min(n, Math.round(((e.clientX - box.left) / box.width) * n))))
      }}
    >
      <polygon points={`0,${H} ${points.join(' ')} ${W},${H}`} fill="#fff" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#888" strokeWidth="1" />
      {review.moves.map(
        (m) =>
          ['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(m.category) && (
            <circle key={m.ply} cx={x(m.ply + 1)} cy={y(whiteShare(m.evalAfter))} r="3" fill={GRAPH_COLORS[m.category]} stroke="#262522" strokeWidth="0.75" />
          ),
      )}
      {ply > 0 && <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="#81b64c" strokeWidth="2" />}
    </svg>
  )
}

export default function Review({ gameId }: { gameId: number }) {
  const [state, setState] = useState<ReviewState | null>(null)
  const [error, setError] = useState('')
  // 0 : résumé de la revue ; k ≥ 1 : coup numéro k.
  const [ply, setPly] = useState(0)

  // Lance la préparation si besoin, puis suit son avancement.
  useEffect(() => {
    let alive = true
    let timer = 0
    const poll = async () => {
      try {
        let s = await get<ReviewState>(`/api/games/${gameId}/review`)
        if (s.status === 'none' || s.status === 'error') {
          await post(`/api/games/${gameId}/review`)
          s = await get<ReviewState>(`/api/games/${gameId}/review`)
        }
        if (!alive) return
        setState(s)
        if (s.status === 'running') timer = window.setTimeout(poll, 600)
      } catch (e) {
        if (alive) setError((e as Error).message)
      }
    }
    void poll()
    return () => {
      alive = false
      window.clearTimeout(timer)
      stop()
    }
  }, [gameId])

  const review = state?.review ?? null
  const game = state?.game
  const total = review?.moves.length ?? 0

  // Le rang courant est aussi gardé dans une référence : les appuis rapides au clavier ne se perdent pas.
  const plyRef = useRef(0)
  const go = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(total, next))
      if (target === plyRef.current) return
      plyRef.current = target
      if (target > 0 && review) playMove(review.moves[target - 1].san)
      setPly(target)
    },
    [total, review],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(plyRef.current - 1)
      if (e.key === 'ArrowRight') go(plyRef.current + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const move = review && ply > 0 ? review.moves[ply - 1] : null
  const shapes = useMemo<DrawShape[]>(
    () => (move?.best ? [{ orig: move.best.uci.slice(0, 2) as Key, dest: move.best.uci.slice(2, 4) as Key, brush: 'green' }] : []),
    [move],
  )

  if (error) return <p className="page error">{error}</p>
  if (!state || !game) return null

  const me = game.playerColor
  const bot = me === 'w' ? 'b' : 'w'
  const rec = ply > 0 ? game.moves[ply - 1] : null
  const fen = rec ? rec.fen : START_FEN
  const myElo = game.eloAfter ?? game.eloBefore

  const toLesson = async () => {
    if (!review?.lessonId) return
    try {
      await post(`/api/games/${gameId}/flow`, { step: 'lesson' })
      navigate(`lecon/${review.lessonId}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="game-layout">
      <div>
        <PlayerBar name="Ordi" elo={game.botElo} color={bot} fen={fen} bot />
        <div className="board-row">
          {review && <EvalBar value={move ? move.evalAfter : START_EVAL} orientation={me} />}
          <Board
            fen={fen}
            orientation={me}
            lastMove={rec ? [rec.from, rec.to] : undefined}
            shapes={shapes}
            badges={move && rec ? [{ square: rec.to, node: <Chip category={move.category} fill /> }] : undefined}
          />
        </div>
        <PlayerBar name="Moi" elo={myElo} color={me} fen={fen} />
      </div>

      {!review ? (
        <div className="panel side">
          <h2>Revue de la partie</h2>
          <p>{state.phase === 'writing' ? 'Le tuteur rédige ses commentaires…' : 'Stockfish analyse tes coups…'}</p>
          <div className="progress">
            <div style={{ width: `${Math.round(state.progress * 100)}%` }} />
          </div>
          <p className="muted">Cela prend moins d'une minute.</p>
        </div>
      ) : ply === 0 ? (
        <div className="panel side">
          <h2>Revue de la partie</h2>
          <div className="scroll">
            <Tutor text={review.summary} />
            {!review.ai && <div className="notice">Tuteur IA indisponible : les commentaires sont des phrases automatiques.</div>}
            <div className="elo-cards">
              <div className="me">
                Ma précision<b>{review.accuracy.me.toFixed(1).replace('.', ',')}</b>
              </div>
              <div>
                Ordi<b>{review.accuracy.bot.toFixed(1).replace('.', ',')}</b>
              </div>
            </div>
            <EvalGraph review={review} ply={0} onSelect={go} />
            <table className="review-table">
              <thead>
                <tr>
                  <th />
                  <th>Moi</th>
                  <th />
                  <th>Ordi</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((c) => (
                  <tr key={c}>
                    <td>{CATEGORY[c].label}</td>
                    <td className="n">{review.counts.me[c]}</td>
                    <td className="c">
                      <Chip category={c} />
                    </td>
                    <td className="n">{review.counts.bot[c]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn small" onClick={() => go(1)}>
            Commencer la revue
          </button>
        </div>
      ) : (
        move && (
          <div className="panel side">
            <h2 className="verdict">
              <Chip category={move.category} />
              {Math.floor(move.ply / 2) + 1}. {move.color === 'b' && '… '}
              {sanFr(move.san)} {CATEGORY[move.category].verdict}
            </h2>
            {move.mine ? (
              <Tutor text={move.comment ?? ''} />
            ) : (
              <p className="muted">
                Coup de l'ordi.{move.best && ` Le meilleur coup était ${sanFr(move.best.san)}.`}
              </p>
            )}
            <EvalGraph review={review} ply={ply} onSelect={go} />
            <MoveList moves={game.moves} ply={ply} onSelect={go} chip={(i) => <Chip category={review.moves[i].category} />} />
            <div className="row">
              <button className="btn grey" onClick={() => go(ply - 1)}>
                ◀ Précédent
              </button>
              {ply < total ? (
                <button className="btn small" onClick={() => go(ply + 1)}>
                  Suivant ▶
                </button>
              ) : (
                <button className="btn small" onClick={toLesson}>
                  Voir la leçon
                </button>
              )}
            </div>
          </div>
        )
      )}
    </div>
  )
}
