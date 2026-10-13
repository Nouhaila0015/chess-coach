import { Chess } from 'chess.js'
import type { Engine, Line } from './engine.js'
import type { Game } from './games.js'

export interface Level {
  // Elo maximal de la tranche.
  upTo: number
  // Profondeur de calcul de Stockfish.
  depth: number
  // Probabilité de jouer un coup légal totalement au hasard.
  random: number
  // « Température » en centipions : plus elle est haute, plus l'ordi choisit des coups faibles.
  temperature: number
  // Nombre de coups candidats évalués par Stockfish (Infinity : tous les coups légaux).
  candidates: number
}

// Réglage du niveau de l'ordi, par tranche d'Elo. À ajuster ici si l'ordi est trop fort ou trop faible.
export const LEVELS: Level[] = [
  { upTo: 250, depth: 4, random: 0.2, temperature: 350, candidates: Infinity },
  { upTo: 400, depth: 5, random: 0.12, temperature: 250, candidates: Infinity },
  { upTo: 600, depth: 6, random: 0.07, temperature: 170, candidates: Infinity },
  { upTo: 800, depth: 7, random: 0.04, temperature: 110, candidates: 12 },
  { upTo: 1000, depth: 8, random: 0.02, temperature: 70, candidates: 10 },
  { upTo: 1300, depth: 9, random: 0.01, temperature: 40, candidates: 8 },
  { upTo: 1600, depth: 10, random: 0, temperature: 20, candidates: 5 },
  { upTo: 2000, depth: 12, random: 0, temperature: 8, candidates: 3 },
  { upTo: Infinity, depth: 14, random: 0, temperature: 0, candidates: 1 },
]

export function levelFor(elo: number): Level {
  return LEVELS.find((l) => elo <= l.upTo)!
}

// Tire un coup parmi les lignes de Stockfish : chaque coup pèse exp(−perte / température).
export function pickMove(lines: Line[], level: Level, random: () => number): string {
  if (level.temperature <= 0 || lines.length === 1) return lines[0].move
  const best = lines[0].cp
  // Au-delà de 15 pions de perte, tous les coups se valent (sinon un mat écraserait tout).
  const weights = lines.map((l) => Math.exp(-Math.min(best - l.cp, 1500) / level.temperature))
  let r = random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < lines.length; i++) {
    r -= weights[i]
    if (r <= 0) return lines[i].move
  }
  return lines[0].move
}

export function createBot(engine: Engine, random: () => number = Math.random) {
  return async (game: Game): Promise<string> => {
    const level = levelFor(game.botElo)
    const legal = new Chess(game.fen).moves({ verbose: true })
    if (random() < level.random) {
      const m = legal[Math.floor(random() * legal.length)]
      return m.from + m.to + (m.promotion ?? '')
    }
    const multipv = Math.min(legal.length, level.candidates)
    const lines = await engine.analyse(game.fen, { depth: level.depth, multipv, movetime: 2000 })
    return pickMove(lines, level, random)
  }
}
