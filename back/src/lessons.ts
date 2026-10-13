import { Chess } from 'chess.js'
import type { Db } from './db.js'
import type { Engine } from './engine.js'
import { type Color, type Game, GameError } from './games.js'
import { type Review, toSan, winProb } from './review.js'
import type { LessonFacts, TutorTexts } from './tutor.js'

// Un coup est accepté dans l'exercice s'il perd au plus cette part de chances de gain face au meilleur.
const ACCEPT_LOSS = 0.03
export const MAX_ATTEMPTS = 3

export interface Lesson extends LessonFacts {
  id: number
  gameId: number
  createdAt: string
  orientation: Color
  title: string
  explanation: string
  principle: string
  hints: string[]
  ai: boolean
  status: 'new' | 'ok' | 'retry'
}

// Faits de la leçon : position avant mon plus mauvais coup, suite qui le punit, coups acceptés.
export async function buildLessonFacts(game: Game, review: Review, engine: Engine): Promise<LessonFacts> {
  const ply = review.worstPly
  const worst = review.moves[ply]
  const fen = ply === 0 ? new Chess().fen() : game.moves[ply - 1].fen
  const m = game.moves[ply]
  const played = m.from + m.to + (m.promotion ?? '')
  const lines = await engine.analyse(fen, { depth: 14, multipv: 5, movetime: 2500 })
  const top = winProb(lines[0].cp)
  let accepted = lines.filter((l) => top - winProb(l.cp) <= ACCEPT_LOSS).map((l) => l.move)
  // Mon coup n'est pas une solution, sauf s'il était réellement presque aussi bon.
  if (worst.loss > ACCEPT_LOSS) accepted = accepted.filter((u) => u !== played)
  if (accepted.length === 0) accepted = [lines[0].move]
  return {
    ply,
    fen,
    played: { san: m.san, uci: played },
    best: { san: toSan(fen, [accepted[0]])[0], uci: accepted[0] },
    accepted,
    punishLine: worst.playedLine,
    bestLine: toSan(fen, lines.find((l) => l.move === accepted[0])!.pv, 6),
  }
}

interface Row {
  id: number
  game_id: number
  created_at: string
  data: string
  status: Lesson['status']
}

const toLesson = (row: Row): Lesson => ({
  ...(JSON.parse(row.data) as Omit<Lesson, 'id' | 'gameId' | 'createdAt' | 'status'>),
  id: row.id,
  gameId: row.game_id,
  createdAt: row.created_at,
  status: row.status,
})

export function saveLesson(db: Db, game: Game, facts: LessonFacts, texts: TutorTexts['lesson'], ai: boolean): number {
  const data = { ...facts, ...texts, ai, orientation: game.playerColor }
  const info = db
    .prepare('INSERT INTO lessons (game_id, created_at, data) VALUES (?, ?, ?)')
    .run(game.id, new Date().toISOString(), JSON.stringify(data))
  return Number(info.lastInsertRowid)
}

export function getLesson(db: Db, id: number): Lesson {
  const row = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as Row | undefined
  if (!row) throw new GameError('Leçon introuvable')
  return toLesson(row)
}

// De la plus récente à la plus ancienne.
export function listLessons(db: Db): Lesson[] {
  return (db.prepare('SELECT * FROM lessons ORDER BY id DESC').all() as unknown as Row[]).map(toLesson)
}

export interface AttemptResult {
  correct: boolean
  // Indice après un échec, tant qu'il reste des essais.
  hint?: string
  // Solution, donnée après une réussite ou après le dernier échec.
  solution?: { san: string; uci: string }
  status: Lesson['status']
}

// Vérifie un essai de l'exercice. `attempt` est le numéro de l'essai (1 à 3).
export function checkAttempt(db: Db, id: number, uci: string, attempt: number): AttemptResult {
  const lesson = getLesson(db, id)
  const setStatus = (status: Lesson['status']) => {
    db.prepare('UPDATE lessons SET status = ? WHERE id = ?').run(status, id)
    return status
  }
  if (lesson.accepted.includes(uci)) {
    return { correct: true, solution: lesson.best, status: setStatus('ok') }
  }
  if (attempt >= MAX_ATTEMPTS) {
    return { correct: false, solution: lesson.best, status: setStatus('retry') }
  }
  return { correct: false, hint: lesson.hints[Math.min(attempt, lesson.hints.length) - 1], status: lesson.status }
}
