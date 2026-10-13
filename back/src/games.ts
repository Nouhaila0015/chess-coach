import { Chess } from 'chess.js'
import type { Db } from './db.js'
import { getElo } from './db.js'
import { newElo } from './elo.js'

export type Color = 'w' | 'b'
export type Result = 'win' | 'loss' | 'draw'
export type Reason = 'checkmate' | 'resign' | 'stalemate' | 'repetition' | 'fifty' | 'material' | 'agreement'

export interface MoveRec {
  san: string
  from: string
  to: string
  promotion?: string
  // Position après le coup.
  fen: string
}

export interface Game {
  id: number
  playerColor: Color
  eloBefore: number
  botElo: number
  moves: MoveRec[]
  fen: string
  turn: Color
  status: 'playing' | 'finished'
  result: Result | null
  reason: Reason | null
  eloAfter: number | null
  flow: 'playing' | 'review' | 'lesson' | 'done'
  lastDrawOfferPly: number | null
}

export class GameError extends Error {}

// En dessous de ce nombre de coups joués par moi, la partie n'a ni revue ni leçon.
export const MIN_PLAYER_MOVES_FOR_REVIEW = 5

interface Row {
  id: number
  player_color: Color
  elo_before: number
  bot_elo: number
  moves: string
  status: 'playing' | 'finished'
  result: Result | null
  reason: Reason | null
  elo_after: number | null
  flow: Game['flow']
  last_draw_offer_ply: number | null
}

function toGame(row: Row): Game {
  const moves = JSON.parse(row.moves) as MoveRec[]
  const fen = moves.length ? moves[moves.length - 1].fen : new Chess().fen()
  return {
    id: row.id,
    playerColor: row.player_color,
    eloBefore: row.elo_before,
    botElo: row.bot_elo,
    moves,
    fen,
    turn: fen.split(' ')[1] as Color,
    status: row.status,
    result: row.result,
    reason: row.reason,
    eloAfter: row.elo_after,
    flow: row.flow,
    lastDrawOfferPly: row.last_draw_offer_ply,
  }
}

export function getGame(db: Db, id: number): Game {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id) as Row | undefined
  if (!row) throw new GameError('Partie introuvable')
  return toGame(row)
}

export function getCurrentGame(db: Db): Game | null {
  const row = db.prepare("SELECT * FROM games WHERE status = 'playing' ORDER BY id DESC LIMIT 1").get() as Row | undefined
  return row ? toGame(row) : null
}

// Dernière partie dont la revue ou la leçon n'est pas terminée.
export function getPendingGame(db: Db): Game | null {
  const row = db
    .prepare("SELECT * FROM games WHERE status = 'finished' AND flow IN ('review', 'lesson') ORDER BY id DESC LIMIT 1")
    .get() as Row | undefined
  return row ? toGame(row) : null
}

export function createGame(db: Db, color: Color | 'random', random: () => number = Math.random): Game {
  if (getCurrentGame(db)) throw new GameError('Une partie est déjà en cours')
  const playerColor: Color = color === 'random' ? (random() < 0.5 ? 'w' : 'b') : color
  const elo = getElo(db)
  // Les anciennes revues non terminées sont abandonnées : une seule suite « revue → leçon » à la fois.
  db.prepare("UPDATE games SET flow = 'done' WHERE status = 'finished' AND flow != 'done'").run()
  const info = db
    .prepare('INSERT INTO games (created_at, player_color, elo_before, bot_elo) VALUES (?, ?, ?, ?)')
    .run(new Date().toISOString(), playerColor, elo, elo)
  return getGame(db, Number(info.lastInsertRowid))
}

// Rejoue la partie pour retrouver l'état complet (répétitions, règle des 50 coups).
export function replay(game: Game): Chess {
  const chess = new Chess()
  for (const m of game.moves) chess.move({ from: m.from, to: m.to, promotion: m.promotion })
  return chess
}

function drawReason(chess: Chess): Reason | null {
  if (chess.isStalemate()) return 'stalemate'
  if (chess.isInsufficientMaterial()) return 'material'
  if (chess.isThreefoldRepetition()) return 'repetition'
  if (chess.isDrawByFiftyMoves()) return 'fifty'
  return null
}

export function finishGame(db: Db, game: Game, result: Result, reason: Reason): Game {
  const playerMoves = game.moves.filter((_, i) => (i % 2 === 0) === (game.playerColor === 'w')).length
  const flow = playerMoves >= MIN_PLAYER_MOVES_FOR_REVIEW ? 'review' : 'done'
  // L'Elo est mis à jour dès la fin de la partie, que la revue soit faite ou non.
  const eloAfter = newElo(getElo(db), game.botElo, result)
  db.prepare(
    "UPDATE games SET status = 'finished', ended_at = ?, result = ?, reason = ?, flow = ?, elo_after = ? WHERE id = ?",
  ).run(new Date().toISOString(), result, reason, flow, eloAfter, game.id)
  db.prepare('UPDATE profile SET elo = ? WHERE id = 1').run(eloAfter)
  return getGame(db, game.id)
}

function applyMove(db: Db, game: Game, input: { from: string; to: string; promotion?: string }): Game {
  const chess = replay(game)
  let move
  try {
    move = chess.move({ from: input.from, to: input.to, promotion: input.promotion })
  } catch {
    throw new GameError('Coup illégal')
  }
  const moves = [...game.moves, { san: move.san, from: move.from, to: move.to, promotion: move.promotion, fen: chess.fen() }]
  db.prepare('UPDATE games SET moves = ? WHERE id = ?').run(JSON.stringify(moves), game.id)
  const updated = getGame(db, game.id)
  if (chess.isCheckmate()) {
    return finishGame(db, updated, move.color === game.playerColor ? 'win' : 'loss', 'checkmate')
  }
  const reason = drawReason(chess)
  return reason ? finishGame(db, updated, 'draw', reason) : updated
}

export function playerMove(db: Db, id: number, input: { from: string; to: string; promotion?: string }): Game {
  const game = getGame(db, id)
  if (game.status !== 'playing') throw new GameError('La partie est terminée')
  if (game.turn !== game.playerColor) throw new GameError("Ce n'est pas ton tour")
  return applyMove(db, game, input)
}

// Coup de l'ordi, choisi par `choose` (coup au format UCI, par exemple « e7e5 » ou « e7e8q »).
export async function botMove(db: Db, id: number, choose: (game: Game) => Promise<string>): Promise<Game> {
  const game = getGame(db, id)
  if (game.status !== 'playing' || game.turn === game.playerColor) return game
  const uci = await choose(game)
  // La partie a pu changer pendant le calcul (abandon) : on relit avant d'appliquer.
  const fresh = getGame(db, id)
  if (fresh.status !== 'playing' || fresh.moves.length !== game.moves.length) return fresh
  return applyMove(db, fresh, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
}

export function resign(db: Db, id: number): Game {
  const game = getGame(db, id)
  if (game.status !== 'playing') throw new GameError('La partie est terminée')
  return finishGame(db, game, 'loss', 'resign')
}

// Nombre de coups complets à jouer avant que l'ordi puisse accepter la nulle, et entre deux propositions.
export const DRAW_MIN_MOVES = 20
export const DRAW_COOLDOWN_MOVES = 10
// L'ordi accepte si je ne suis pas en moins bonne posture que ce seuil (en centipions, de mon point de vue).
const DRAW_MAX_DEFICIT = 50

// Proposition de nulle : `evaluate` donne l'évaluation de la position pour le camp au trait.
export async function offerDraw(
  db: Db,
  id: number,
  evaluate: (fen: string) => Promise<number>,
): Promise<{ accepted: boolean; game: Game }> {
  const game = getGame(db, id)
  if (game.status !== 'playing') throw new GameError('La partie est terminée')
  if (game.turn !== game.playerColor) throw new GameError('Tu peux proposer nulle à ton tour')
  const ply = game.moves.length
  if (game.lastDrawOfferPly !== null && ply - game.lastDrawOfferPly < DRAW_COOLDOWN_MOVES * 2) {
    throw new GameError(`Une seule proposition de nulle tous les ${DRAW_COOLDOWN_MOVES} coups`)
  }
  db.prepare('UPDATE games SET last_draw_offer_ply = ? WHERE id = ?').run(ply, id)
  if (ply < DRAW_MIN_MOVES * 2 || (await evaluate(game.fen)) < -DRAW_MAX_DEFICIT) {
    return { accepted: false, game: getGame(db, id) }
  }
  return { accepted: true, game: finishGame(db, getGame(db, id), 'draw', 'agreement') }
}
