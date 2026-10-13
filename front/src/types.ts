export type Color = 'w' | 'b'
export type Result = 'win' | 'loss' | 'draw'
export type Reason = 'checkmate' | 'resign' | 'stalemate' | 'repetition' | 'fifty' | 'material' | 'agreement'

export interface MoveRec {
  san: string
  from: string
  to: string
  promotion?: string
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

export interface AppState {
  elo: number
  game: Game | null
  pending: { gameId: number; step: 'review' | 'lesson' } | null
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
