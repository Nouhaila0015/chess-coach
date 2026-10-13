import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Chess } from 'chess.js'
import { Stockfish } from './engine.js'
import type { Game, MoveRec } from './games.js'
import { analyseGame, moveAccuracy, winProb } from './review.js'

const engine = new Stockfish()
after(() => engine.quit())

function gameFrom(sans: string[], playerColor: 'w' | 'b' = 'w'): Game {
  const chess = new Chess()
  const moves: MoveRec[] = sans.map((san) => {
    const m = chess.move(san)
    return { san: m.san, from: m.from, to: m.to, promotion: m.promotion, fen: chess.fen() }
  })
  return { id: 1, playerColor, moves, fen: chess.fen() } as Game
}

test('chances de gain et précision', () => {
  assert.equal(winProb(0), 0.5)
  assert.ok(winProb(300) > 0.7 && winProb(-300) < 0.3)
  assert.ok(moveAccuracy(0) > 99.9)
  assert.ok(moveAccuracy(0.3) < 30)
})

test('classe les coups du piège de l’arche de Noé', async () => {
  const sans = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 d4 b5 Bb3 Nxd4 Nxd4 exd4 Qxd4 c5 Qd5 Be6 Qc6+ Bd7 Qd5 c4'.split(' ')
  const progress: number[] = []
  const review = await analyseGame(gameFrom(sans), engine, (r) => progress.push(r))
  assert.equal(review.moves.length, sans.length)
  assert.equal(progress.at(-1), 1)
  // Les premiers coups suivent la théorie.
  assert.equal(review.moves[0].category, 'book')
  assert.equal(review.moves[4].category, 'book')
  // 8. Dxd4 perd une pièce : c'est mon plus mauvais coup.
  const qxd4 = review.moves[14]
  assert.equal(qxd4.san, 'Qxd4')
  assert.ok(['mistake', 'blunder'].includes(qxd4.category), qxd4.category)
  assert.equal(review.worstPly, 14)
  assert.ok(qxd4.best && qxd4.best.san !== 'Qxd4')
  assert.equal(qxd4.playedLine[0], 'Qxd4')
  assert.equal(qxd4.mine, true)
  assert.equal(review.moves[15].mine, false)
  assert.ok(review.accuracy.me < review.accuracy.bot)
  assert.equal(review.counts.me.book + review.counts.bot.book >= 8, true)
})

test('une partie finie par un mat est analysée jusqu’au bout', async () => {
  const review = await analyseGame(gameFrom('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#'.split(' ')), engine)
  const last = review.moves.at(-1)!
  assert.equal(last.evalAfter.mate, 0)
  assert.ok(['best', 'great', 'excellent'].includes(last.category), last.category)
  // Les Noirs ont laissé le mat : gaffe.
  assert.equal(review.moves[5].category, 'blunder')
})
