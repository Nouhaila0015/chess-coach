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
  pending: { gameId: number; step: 'review' | 'lesson'; lessonId: number | null } | null
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export type Category = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder'

// Évaluation du point de vue des Blancs.
export interface Eval {
  cp: number
  mate: number | null
}

export interface MoveReview {
  ply: number
  san: string
  color: Color
  mine: boolean
  category: Category
  loss: number
  accuracy: number
  evalBefore: Eval
  evalAfter: Eval
  best: { uci: string; san: string } | null
  bestLine: string[]
  playedLine: string[]
  comment?: string
}

export interface Review {
  moves: MoveReview[]
  accuracy: { me: number; bot: number }
  counts: { me: Record<Category, number>; bot: Record<Category, number> }
  worstPly: number
  summary: string
  ai: boolean
  lessonId: number | null
}

export interface ReviewState {
  status: 'none' | 'running' | 'done' | 'error'
  progress: number
  phase: 'analysis' | 'writing' | null
  review: Review | null
  game: Game
}

export interface Lesson {
  id: number
  gameId: number
  createdAt: string
  orientation: Color
  ply: number
  fen: string
  played: { san: string; uci: string }
  best: { san: string; uci: string }
  accepted: string[]
  punishLine: string[]
  bestLine: string[]
  title: string
  explanation: string
  principle: string
  hints: string[]
  ai: boolean
  status: 'new' | 'ok' | 'retry'
}
