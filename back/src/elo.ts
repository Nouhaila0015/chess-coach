import type { Db } from './db.js'
import { START_ELO } from './db.js'
import type { Result } from './games.js'

export const K = 32
export const MIN_ELO = 100

const SCORE: Record<Result, number> = { win: 1, draw: 0.5, loss: 0 }

// Formule Elo classique, à partir du résultat seul.
export function newElo(elo: number, opponent: number, result: Result): number {
  const expected = 1 / (1 + 10 ** ((opponent - elo) / 400))
  return Math.max(MIN_ELO, Math.round(elo + K * (SCORE[result] - expected)))
}

export interface Progress {
  elo: number
  best: number
  games: number
  wins: number
  draws: number
  losses: number
  // Elo de départ, puis Elo après chaque partie terminée.
  history: number[]
}

export function getProgress(db: Db): Progress {
  const rows = db
    .prepare("SELECT result, elo_after FROM games WHERE status = 'finished' AND elo_after IS NOT NULL ORDER BY id")
    .all() as { result: Result; elo_after: number }[]
  const history = [START_ELO, ...rows.map((r) => r.elo_after)]
  const count = (r: Result) => rows.filter((g) => g.result === r).length
  return {
    elo: history[history.length - 1],
    best: Math.max(...history),
    games: rows.length,
    wins: count('win'),
    draws: count('draw'),
    losses: count('loss'),
    history,
  }
}
