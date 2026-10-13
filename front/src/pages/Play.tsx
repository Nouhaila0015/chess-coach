import { Chess } from 'chess.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { post } from '../api'
import Board from '../components/Board'
import MoveList from '../components/MoveList'
import PlayerBar from '../components/PlayerBar'
import PromotionPicker from '../components/PromotionPicker'
import { REASONS } from '../format'
import { pieceUrl } from '../pieces'
import { navigate } from '../router'
import { play, playMove } from '../sounds'
import { type AppState, type Color, type Game, START_FEN } from '../types'

interface Props {
  state: AppState
  refresh: () => void
}

const TITLES = { win: 'Tu as gagné !', loss: 'Tu as perdu', draw: 'Partie nulle' }

export default function Play({ state, refresh }: Props) {
  const [game, setGame] = useState<Game | null>(state.game)
  const [choice, setChoice] = useState<Color | 'random'>('w')
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  const [nonce, setNonce] = useState(0)
  const [error, setError] = useState('')
  const [modalClosed, setModalClosed] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const [notice, setNotice] = useState('')
  const busy = useRef(false)
  const sounded = useRef({ id: game?.id, count: game?.moves.length ?? 0 })

  const fail = useCallback((e: Error) => {
    setError(e.message)
    setNonce((n) => n + 1)
    play('error')
  }, [])

  const start = async () => {
    setError('')
    try {
      const g = await post<Game>('/api/games', { color: choice })
      sounded.current = { id: g.id, count: 0 }
      setGame(g)
      setViewPly(null)
      setModalClosed(false)
      play('start')
      refresh()
    } catch (e) {
      fail(e as Error)
    }
  }

  // Sons : un par nouveau coup, puis le son de fin de partie.
  useEffect(() => {
    if (!game) return
    const s = sounded.current
    if (s.id === game.id && game.moves.length > s.count) {
      playMove(game.moves[game.moves.length - 1].san)
      if (game.status === 'finished') window.setTimeout(() => play('end'), 400)
    }
    sounded.current = { id: game.id, count: game.moves.length }
  }, [game])

  // Tour de l'ordi : on lui demande son coup, avec un délai pour garder un rythme naturel.
  useEffect(() => {
    if (!game || game.status !== 'playing' || game.turn === game.playerColor || busy.current) return
    busy.current = true
    const wait = 500 + Math.random() * 1000
    const started = Date.now()
    post<Game>(`/api/games/${game.id}/bot`)
      .then(async (g) => {
        await new Promise((r) => window.setTimeout(r, Math.max(0, wait - (Date.now() - started))))
        setGame((cur) => (cur && cur.id === g.id && cur.moves.length <= g.moves.length ? g : cur))
        setViewPly(null)
      }, fail)
      .finally(() => {
        busy.current = false
      })
  }, [game, fail])

  useEffect(() => {
    if (game?.status === 'finished') refresh()
  }, [game?.status, refresh])

  const send = async (from: string, to: string, promo?: string) => {
    if (!game) return
    setError('')
    setNotice('')
    // Affichage immédiat du coup, confirmé ensuite par le BFF.
    const chess = new Chess(game.fen)
    const m = chess.move({ from, to, promotion: promo })
    const fen = chess.fen()
    setGame({ ...game, moves: [...game.moves, { san: m.san, from, to, promotion: promo, fen }], fen, turn: chess.turn() })
    try {
      const g = await post<Game>(`/api/games/${game.id}/move`, { from, to, promotion: promo })
      sounded.current = { id: g.id, count: g.moves.length }
      setGame(g)
    } catch (e) {
      sounded.current = { id: game.id, count: game.moves.length }
      setGame(game)
      fail(e as Error)
    }
  }

  const resign = async () => {
    if (!game) return
    setConfirmResign(false)
    try {
      setGame(await post<Game>(`/api/games/${game.id}/resign`))
      play('end')
    } catch (e) {
      fail(e as Error)
    }
  }

  const offerDraw = async () => {
    if (!game) return
    setError('')
    try {
      const r = await post<{ accepted: boolean; game: Game }>(`/api/games/${game.id}/draw`)
      setGame(r.game)
      if (r.accepted) play('end')
      else {
        setNotice("L'ordi refuse la nulle.")
        play('error')
      }
    } catch (e) {
      fail(e as Error)
    }
  }

  const onMove = (from: string, to: string) => {
    if (!game) return
    const piece = new Chess(game.fen).get(from as never)
    if (piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) setPromotion({ from, to })
    else void send(from, to)
  }

  const total = game?.moves.length ?? 0
  const ply = viewPly ?? total
  const step = useCallback(
    (delta: number) => {
      setViewPly((v) => {
        const next = Math.min(total, Math.max(0, (v ?? total) + delta))
        return next === total ? null : next
      })
    },
    [total],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const me: Color = game?.playerColor ?? (choice === 'b' ? 'b' : 'w')
  const bot: Color = me === 'w' ? 'b' : 'w'
  const fen = !game ? START_FEN : ply === 0 ? START_FEN : game.moves[ply - 1].fen
  const last = game && ply > 0 ? game.moves[ply - 1] : null
  const myTurn = !!game && game.status === 'playing' && game.turn === game.playerColor
  const live = viewPly === null
  const myElo = game?.eloBefore ?? state.elo
  const finished = game?.status === 'finished'
  const delta = game && game.eloAfter !== null ? game.eloAfter - game.eloBefore : null

  const leave = () => {
    setGame(null)
    setViewPly(null)
    refresh()
  }

  return (
    <div className="game-layout">
      <div>
        <PlayerBar name="Ordi" elo={game?.botElo ?? state.elo} color={bot} fen={fen} bot />
        <Board
          fen={fen}
          orientation={me}
          lastMove={last ? [last.from, last.to] : undefined}
          interactive={myTurn && live && !promotion}
          onMove={onMove}
          nonce={nonce}
        >
          {promotion && (
            <PromotionPicker
              square={promotion.to}
              color={me}
              orientation={me}
              onPick={(p) => {
                setPromotion(null)
                void send(promotion.from, promotion.to, p)
              }}
              onCancel={() => {
                setPromotion(null)
                setNonce((n) => n + 1)
              }}
            />
          )}
        </Board>
        <PlayerBar name="Moi" elo={finished && game.eloAfter !== null ? game.eloAfter : myElo} color={me} fen={fen} />
      </div>

      {!game ? (
        <div className="panel side">
          <h2>Nouvelle partie</h2>
          <p>Tu joues contre un ordi de ton niveau.</p>
          <div className="elo-cards">
            <div className="me">
              Mon Elo<b>{state.elo}</b>
            </div>
            <div>
              Ordi<b>{state.elo}</b>
            </div>
          </div>
          <h3>Je joue avec</h3>
          <div className="choice">
            <button className={choice === 'w' ? 'on' : ''} onClick={() => setChoice('w')}>
              <img src={pieceUrl.wk} alt="" />
              Blancs
            </button>
            <button className={choice === 'random' ? 'on' : ''} onClick={() => setChoice('random')}>
              <span className="dice">🎲</span>
              Aléatoire
            </button>
            <button className={choice === 'b' ? 'on' : ''} onClick={() => setChoice('b')}>
              <img src={pieceUrl.bk} alt="" />
              Noirs
            </button>
          </div>
          <button className="btn" onClick={start}>
            Jouer
          </button>
          {error && <p className="error">{error}</p>}
          <div className="spacer" />
          <p className="muted">Pas de pendule. Aucune aide pendant la partie : la revue et la leçon viennent après.</p>
        </div>
      ) : (
        <div className="panel side">
          <h2>{finished ? 'Partie terminée' : 'Partie en cours'}</h2>
          <p className="status-line">
            {error ? (
              <span className="error">{error}</span>
            ) : finished ? (
              `${TITLES[game.result!]} ${REASONS[game.reason!]}`
            ) : notice ? (
              notice
            ) : myTurn ? (
              'À toi de jouer.'
            ) : (
              "L'ordi réfléchit…"
            )}
          </p>
          <MoveList moves={game.moves} ply={ply} onSelect={(p) => setViewPly(p === total ? null : p)} />
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn grey" onClick={() => step(-1)} disabled={ply === 0} aria-label="Coup précédent">
              ◀
            </button>
            <button className="btn grey" onClick={() => step(1)} disabled={live} aria-label="Coup suivant">
              ▶
            </button>
          </div>
          {finished ? (
            <button className="btn small" onClick={() => setModalClosed(false)}>
              Voir le résultat
            </button>
          ) : (
            <div className="row">
              <button className="btn grey" onClick={offerDraw} disabled={!myTurn}>
                ½ Proposer nulle
              </button>
              <button className="btn grey" onClick={() => setConfirmResign(true)}>
                ⚑ Abandonner
              </button>
            </div>
          )}
        </div>
      )}

      {confirmResign && (
        <div className="overlay">
          <div className="modal">
            <div className="head">
              <h2>Abandonner ?</h2>
              <p>L'abandon compte comme une défaite.</p>
            </div>
            <div className="body">
              <button className="btn" onClick={() => setConfirmResign(false)}>
                Continuer la partie
              </button>
              <button className="btn grey" onClick={resign}>
                Oui, j'abandonne
              </button>
            </div>
          </div>
        </div>
      )}

      {game && finished && !modalClosed && (
        <div className="overlay">
          <div className="modal">
            <div className="head">
              <h2>{TITLES[game.result!]}</h2>
              <p>{REASONS[game.reason!]}</p>
            </div>
            <div className="body">
              {delta !== null && (
                <>
                  <p>Nouvel Elo</p>
                  <div className="elo-change">
                    {game.eloAfter}
                    <small className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>
                      {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '±0'}
                    </small>
                  </div>
                </>
              )}
              {game.flow === 'review' ? (
                <>
                  <p>Le tuteur prépare la revue de ta partie.</p>
                  <button className="btn" onClick={() => navigate(`revue/${game.id}`)}>
                    Lancer la revue
                  </button>
                </>
              ) : (
                <>
                  <p>Partie trop courte pour une revue.</p>
                  <button className="btn" onClick={leave}>
                    Nouvelle partie
                  </button>
                </>
              )}
              <button className="btn grey" onClick={() => setModalClosed(true)}>
                Regarder le plateau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
