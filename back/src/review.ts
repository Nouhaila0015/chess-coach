import { Chess, type Square } from 'chess.js'
import { type Engine, type Line, MATE } from './engine.js'
import type { Color, Game } from './games.js'
import { isBook } from './openings.js'

export type Category =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'

export const CATEGORIES: Category[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
]

// Évaluation du point de vue des Blancs : centipions, ou mat en n coups (n > 0 : les Blancs matent).
export interface Eval {
  cp: number
  mate: number | null
}

export interface MoveReview {
  // Rang du demi-coup dans la partie (0 = premier coup des Blancs).
  ply: number
  san: string
  color: Color
  mine: boolean
  category: Category
  // Perte de chances de gain (0 à 1) par rapport au meilleur coup.
  loss: number
  accuracy: number
  evalBefore: Eval
  evalAfter: Eval
  // Meilleur coup de la position, s'il diffère du coup joué.
  best: { uci: string; san: string } | null
  // Suite attendue après le meilleur coup, puis après le coup joué (notation anglaise).
  bestLine: string[]
  playedLine: string[]
  comment?: string
}

export interface Review {
  moves: MoveReview[]
  accuracy: { me: number; bot: number }
  counts: { me: Record<Category, number>; bot: Record<Category, number> }
  // Rang du coup retenu pour la leçon (mon plus mauvais coup).
  worstPly: number
  summary: string
  // Vrai si les textes ont été rédigés par Claude, faux si ce sont les phrases toutes faites.
  ai: boolean
  lessonId: number | null
}

// Seuils de perte de chances de gain, repris de la classification de chess.com.
const EXCELLENT = 0.02
const GOOD = 0.05
const INACCURACY = 0.1
const MISTAKE = 0.2

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

// Chances de gain (0 à 1) pour une évaluation en centipions.
export function winProb(cp: number): number {
  return 1 / (1 + Math.exp(-0.00368208 * cp))
}

export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-4.354 * loss) - 3.1669))
}

interface Pos {
  // Évaluation pour le camp au trait.
  cp: number
  mate: number | null
  lines: Line[]
}

// Convertit une suite de coups UCI en notation algébrique, à partir d'une position.
export function toSan(fen: string, ucis: string[], max = ucis.length): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const uci of ucis.slice(0, max)) {
    try {
      out.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san)
    } catch {
      break
    }
  }
  return out
}

function terminal(fen: string): Pos | null {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return { cp: -MATE, mate: 0, lines: [] }
  if (chess.moves().length === 0) return { cp: 0, mate: null, lines: [] }
  return null
}

// Le coup laisse-t-il une pièce en prise de façon volontaire (sacrifice) ?
function isSacrifice(fenBefore: string, uci: string): boolean {
  const chess = new Chess(fenBefore)
  const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  if (move.piece === 'p' || move.piece === 'k' || move.promotion) return false
  const me = move.color
  const opp = me === 'w' ? 'b' : 'w'
  const attackers = chess.attackers(move.to as Square, opp)
  if (attackers.length === 0) return false
  const offered = VALUE[move.piece] - (move.captured ? VALUE[move.captured] : 0)
  if (offered < 2) return false
  const cheapest = Math.min(...attackers.map((sq) => VALUE[chess.get(sq)!.type]))
  const defended = chess.attackers(move.to as Square, me).length > 0
  return !defended || cheapest < VALUE[move.piece]
}

function emptyCounts(): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>
}

export const ANALYSIS_DEPTH = 12

// Analyse toute la partie avec Stockfish et classe chaque coup. Aucun texte ici : voir tutor.ts.
export async function analyseGame(game: Game, engine: Engine, onProgress: (ratio: number) => void = () => {}): Promise<Review> {
  const start = new Chess().fen()
  const fens = [start, ...game.moves.map((m) => m.fen)]
  const positions: Pos[] = []
  for (let i = 0; i < fens.length; i++) {
    const end = terminal(fens[i])
    if (end) positions.push(end)
    else {
      const lines = await engine.analyse(fens[i], { depth: ANALYSIS_DEPTH, multipv: 2, movetime: 1000 })
      positions.push({ cp: lines[0].cp, mate: lines[0].mate, lines })
    }
    onProgress((i + 1) / fens.length)
  }

  const white = (i: number): Eval => {
    const sign = fens[i].split(' ')[1] === 'w' ? 1 : -1
    const p = positions[i]
    return { cp: sign * p.cp, mate: p.mate === null ? null : p.mate === 0 ? 0 : sign * p.mate }
  }

  const moves: MoveReview[] = []
  for (let i = 0; i < game.moves.length; i++) {
    const m = game.moves[i]
    const color: Color = i % 2 === 0 ? 'w' : 'b'
    const before = positions[i]
    const after = positions[i + 1]
    const uci = m.from + m.to + (m.promotion ?? '')
    const bestLine = before.lines[0]
    const isBest = bestLine.move === uci
    const wpBefore = winProb(before.cp)
    const wpAfter = winProb(-after.cp)
    const loss = isBest ? 0 : Math.max(0, wpBefore - wpAfter)

    const prev = moves[i - 1]
    const recapture = !!prev && prev.san.includes('x') && game.moves[i - 1].to === m.to
    const second = before.lines[1]
    const onlyMove = !!second && wpBefore - winProb(second.cp) >= 0.15
    const sacrifice = loss <= EXCELLENT && wpBefore < 0.97 && wpAfter >= 0.45 && isSacrifice(fens[i], uci)

    // Occasion manquée : l'adversaire venait de se tromper et mon coup lui rend ce qu'il avait donné, sans plus.
    const wpBeforeTheirMove = i > 0 ? 1 - winProb(positions[i - 1].cp) : 0.5
    const missed = !!prev && prev.loss > INACCURACY && wpAfter >= wpBeforeTheirMove - 0.05

    let category: Category
    if (isBook(game.moves.slice(0, i + 1).map((x) => x.san))) category = 'book'
    else if (sacrifice) category = 'brilliant'
    else if (isBest || loss < 0.002) category = onlyMove && !recapture ? 'great' : 'best'
    else if (loss <= EXCELLENT) category = 'excellent'
    else if (loss <= GOOD) category = 'good'
    else if (loss <= INACCURACY) category = 'inaccuracy'
    else if (missed) category = 'miss'
    else if (loss <= MISTAKE) category = 'mistake'
    else category = 'blunder'

    moves.push({
      ply: i,
      san: m.san,
      color,
      mine: color === game.playerColor,
      category,
      loss,
      accuracy: category === 'book' ? 100 : moveAccuracy(loss),
      evalBefore: white(i),
      evalAfter: white(i + 1),
      best: isBest ? null : { uci: bestLine.move, san: toSan(fens[i], [bestLine.move])[0] },
      // Suites assez longues pour voir le matériel gagné ou perdu.
      bestLine: toSan(fens[i], bestLine.pv, 8),
      playedLine: [m.san, ...toSan(fens[i + 1], after.lines[0]?.pv ?? [], 7)],
    })
  }

  const mean = (list: MoveReview[]) => (list.length ? list.reduce((s, x) => s + x.accuracy, 0) / list.length : 100)
  const mine = moves.filter((x) => x.mine)
  const theirs = moves.filter((x) => !x.mine)
  const counts = { me: emptyCounts(), bot: emptyCounts() }
  for (const x of moves) counts[x.mine ? 'me' : 'bot'][x.category]++
  // Mon plus mauvais coup ; à égalité, le plus ancien.
  const worst = mine.reduce((a, b) => (b.loss > a.loss ? b : a), mine[0])

  return {
    moves,
    accuracy: { me: Math.round(mean(mine) * 10) / 10, bot: Math.round(mean(theirs) * 10) / 10 },
    counts,
    worstPly: worst.ply,
    summary: '',
    ai: false,
    lessonId: null,
  }
}
