import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js'
import type { Color } from './games.js'
import type { Eval, MoveReview } from './review.js'
import { lineFr, sanFr } from './text.js'

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const MINE: Record<PieceSymbol, string> = { q: 'ta dame', r: 'ta tour', b: 'ton fou', n: 'ton cavalier', p: 'un pion', k: 'ton roi' }
const THEIRS: Record<PieceSymbol, string> = { q: 'sa dame', r: 'une tour', b: 'un fou', n: 'un cavalier', p: 'un pion', k: 'son roi' }

// Explication concrète d'un coup, tirée des suites de Stockfish (sans IA).
export interface Explanation {
  // Faits en français, transmis au tuteur IA.
  facts: string[]
  // Commentaire tout fait, utilisé sans IA.
  comment: string
}

interface Walk {
  moves: Move[]
  // Pièces prises par le camp qui joue le premier coup de la suite, et par l'adversaire.
  won: PieceSymbol[]
  lost: PieceSymbol[]
  // Bilan matériel pour le camp qui joue le premier coup, en points.
  net: number
}

function walk(fen: string, sans: string[]): Walk {
  const chess = new Chess(fen)
  const mover = chess.turn()
  const out: Walk = { moves: [], won: [], lost: [], net: 0 }
  for (const san of sans) {
    let m: Move
    try {
      m = chess.move(san)
    } catch {
      break
    }
    out.moves.push(m)
    const sign = m.color === mover ? 1 : -1
    if (m.captured) {
      ;(sign > 0 ? out.won : out.lost).push(m.captured)
      out.net += sign * VALUE[m.captured]
    }
    if (m.promotion) out.net += sign * (VALUE[m.promotion] - 1)
  }
  return out
}

const biggest = (pieces: PieceSymbol[]) => [...pieces].sort((a, b) => VALUE[b] - VALUE[a])[0]

// Mat du point de vue de `color` : positif si `color` mate, négatif s'il est maté.
function mateFor(e: Eval, color: Color): number | null {
  if (e.mate === null || e.mate === 0) return null
  return color === 'w' ? e.mate : -e.mate
}

function pawnsFor(e: Eval, color: Color): number {
  return ((color === 'w' ? 1 : -1) * e.cp) / 100
}

export function balance(pawns: number): string {
  const v = Math.abs(pawns).toFixed(1).replace('.', ',')
  if (Math.abs(pawns) >= 50) return pawns > 0 ? 'une position gagnante' : 'une position perdue'
  if (pawns >= 0.3) return `un avantage de ${v} pion${Math.abs(pawns) >= 2 ? 's' : ''}`
  if (pawns <= -0.3) return `un retard de ${v} pion${Math.abs(pawns) >= 2 ? 's' : ''}`
  return "l'égalité"
}

// « de » devant une évaluation : « d'un avantage », « de l'égalité ».
const from = (b: string) => (b.startsWith('un') ? `d'${b}` : `de ${b}`)

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Ce qu'accomplit un coup, en quelques mots (« tu prends un cavalier », « tu roques »...).
function whatItDoes(m: Move, ply: number): string | null {
  if (m.san.includes('#')) return 'tu donnes échec et mat'
  if (m.captured) return `tu prends ${THEIRS[m.captured]}${m.san.includes('+') ? ' avec échec' : ''}`
  if (m.isKingsideCastle() || m.isQueensideCastle()) return 'tu mets ton roi à l’abri en roquant'
  if (m.san.includes('+')) return 'tu mets son roi en échec'
  if (m.promotion) return `ton pion devient ${MINE[m.promotion]}`
  const backRank = m.color === 'w' ? '1' : '8'
  if (ply < 20 && m.piece !== 'p' && m.piece !== 'k' && m.piece !== 'q' && m.from[1] === backRank) return `tu développes ${MINE[m.piece]}`
  if (ply < 16 && m.piece === 'p' && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5'].includes(m.to)) return 'tu prends de la place au centre'
  return null
}

// Pièce de valeur laissée sans protection suffisante après le coup.
function hangingPiece(fenAfter: string, me: Color): { square: Square; type: PieceSymbol } | null {
  const chess = new Chess(fenAfter)
  const opp = me === 'w' ? 'b' : 'w'
  let found: { square: Square; type: PieceSymbol } | null = null
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== me || VALUE[p.type] < 3) continue
      const attackers = chess.attackers(p.square, opp)
      if (attackers.length === 0) continue
      const cheapest = Math.min(...attackers.map((sq) => VALUE[chess.get(sq)!.type]))
      const defended = chess.attackers(p.square, me).length > 0
      if ((!defended || cheapest < VALUE[p.type]) && (!found || VALUE[p.type] > VALUE[found.type])) found = { square: p.square, type: p.type }
    }
  }
  return found
}

export function explain(fenBefore: string, m: MoveReview, prev?: MoveReview): Explanation {
  const me = m.color
  const move = lineFr(m.ply, [m.san])
  const played = walk(fenBefore, m.playedLine)
  const first = played.moves[0]
  const facts: string[] = []
  const does = first ? whatItDoes(first, m.ply) : null
  if (does) facts.push(`Avec ce coup, ${does}.`)

  // Ce que vaut le meilleur coup, quand ce n'est pas le coup joué.
  let bestPhrase = ''
  if (m.best) {
    const best = walk(fenBefore, m.bestLine)
    const name = sanFr(m.best.san)
    const mate = mateFor(m.evalBefore, me)
    const firstBest = best.moves[0]
    if (mate !== null && mate > 0) bestPhrase = `${name}, qui donnait mat en ${mate}`
    else if (best.net >= 2 && best.won.length) bestPhrase = `${name}, qui gagnait ${THEIRS[biggest(best.won)]}`
    else if (firstBest?.captured) bestPhrase = `${name}, qui prenait ${THEIRS[firstBest.captured]}`
    else if (firstBest?.san.includes('+')) bestPhrase = `${name}, avec échec`
    else bestPhrase = name
    facts.push(`Meilleur coup : ${bestPhrase}. Suite attendue : ${lineFr(m.ply, m.bestLine)}.`)
  }

  // Pourquoi le coup joué est faible.
  let why = ''
  const weak = ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(m.category)
  if (weak && first) {
    const mated = mateFor(m.evalAfter, me)
    const reply = m.playedLine[1] ? lineFr(m.ply + 1, [m.playedLine[1]]) : ''
    const hanging = hangingPiece(first.after, me)
    if (mated !== null && mated < 0) {
      why = `après ce coup, l'ordi peut te mater en ${-mated} coup${mated < -1 ? 's' : ''} (${lineFr(m.ply, m.playedLine)})`
    } else if (played.net <= -2 && played.lost.length) {
      const lost = biggest(played.lost)
      if (hanging && hanging.type === lost) {
        const fem = lost === 'q' || lost === 'r'
        why = `${MINE[lost]} en ${hanging.square} n'est plus assez protégé${fem ? 'e' : ''} et l'ordi peut ${fem ? 'la' : 'le'} gagner : ${lineFr(m.ply, m.playedLine)}`
      } else {
        why = `l'ordi répond ${reply} et tu perds ${MINE[lost]} : ${lineFr(m.ply, m.playedLine)}`
      }
    } else if (hanging) {
      why = `${MINE[hanging.type]} en ${hanging.square} devient une cible`
    } else {
      // Pas de perte immédiate : on regarde ce qui est menacé à la fin de la suite.
      const last = played.moves.at(-1)
      const target = last ? hangingPiece(last.after, me) : null
      const drop = `Stockfish estime que tu passes ${from(balance(pawnsFor(m.evalBefore, me)))} à ${balance(pawnsFor(m.evalAfter, me))}`
      why = target
        ? `après ${lineFr(m.ply, m.playedLine)}, ${MINE[target.type]} en ${target.square} est attaqué${target.type === 'q' || target.type === 'r' ? 'e' : ''} et ne peut plus être sauvé${target.type === 'q' || target.type === 'r' ? 'e' : ''} sans perte (${drop})`
        : `${drop} : ${lineFr(m.ply, m.playedLine)}`
    }
    facts.push(`Problème du coup joué : ${why}.`)
  }
  facts.push(`Évaluation : avant le coup, ${balance(pawnsFor(m.evalBefore, me))} ; après le coup, ${balance(pawnsFor(m.evalAfter, me))}.`)

  if (m.category === 'miss' && prev) {
    facts.push(`Le coup précédent de l'ordi (${lineFr(prev.ply, [prev.san])}) était une erreur que tu n'as pas punie.`)
  }

  // Le titre de la revue donne déjà le coup et sa catégorie : le commentaire va droit à l'explication.
  const doesSentence = does ? `${cap(does)}.` : ''
  let comment: string
  switch (m.category) {
    case 'book':
      comment = doesSentence ? `${doesSentence} Ce coup fait partie de la théorie des ouvertures.` : 'Tu suis une ouverture connue : ce coup fait partie de la théorie.'
      break
    case 'brilliant':
      comment = `Tu sacrifies ${first ? MINE[first.piece] : 'du matériel'}, et c'est pourtant le meilleur coup : bravo !`
      break
    case 'great':
      comment = `C'était le seul bon coup dans cette position. ${doesSentence}`
      break
    case 'best':
      comment = doesSentence ? `${doesSentence} C'est le coup que Stockfish aurait joué.` : "C'est le coup que Stockfish aurait joué."
      break
    case 'excellent':
      comment = `${doesSentence} Presque aussi fort que le meilleur coup.`
      break
    case 'good':
      comment = `${doesSentence || 'Coup correct.'}${bestPhrase ? ` Un peu plus précis : ${bestPhrase}.` : ''}`
      break
    case 'inaccuracy':
      comment = `${cap(why)}. Mieux valait ${bestPhrase}.`
      break
    case 'miss':
      comment = `L'ordi venait de se tromper et ${bestPhrase || 'un autre coup'} en profitait. Avec ${move}, ${why.replace(/^Stockfish estime que /, '')}.`
      break
    case 'mistake':
    case 'blunder':
      comment = `${cap(why)}. Il fallait jouer ${bestPhrase}.`
      break
  }
  return { facts, comment: cap(comment.trim()) }
}
