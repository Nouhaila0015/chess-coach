import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Chess } from 'chess.js'
import { createBot, levelFor, pickMove } from './bot.js'
import { Stockfish } from './engine.js'
import type { Game } from './games.js'

const engine = new Stockfish()
after(() => engine.quit())

const game = (fen: string, botElo: number) => ({ fen, botElo }) as Game

test('le niveau dépend de la tranche d’Elo', () => {
  assert.equal(levelFor(200).depth, 4)
  assert.equal(levelFor(251).depth, 5)
  assert.equal(levelFor(3000).temperature, 0)
})

test('à température nulle, le meilleur coup est toujours choisi', () => {
  const lines = [
    { move: 'a', cp: 50, mate: null, pv: [] },
    { move: 'b', cp: -900, mate: null, pv: [] },
  ]
  assert.equal(pickMove(lines, levelFor(3000), () => 0.99), 'a')
  // À 200 Elo, un tirage élevé tombe sur le coup faible.
  assert.equal(pickMove(lines, levelFor(200), () => 0.99), 'b')
})

test('Stockfish trouve un mat en un', async () => {
  const lines = await engine.analyse('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', { depth: 8 })
  assert.equal(lines[0].move, 'd1d8')
  assert.equal(lines[0].mate, 1)
})

test('l’ordi joue toujours un coup légal, à tous les niveaux', async () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3'
  for (const elo of [200, 600, 1500, 2500]) {
    for (let i = 0; i < 5; i++) {
      const uci = await createBot(engine)(game(fen, elo))
      assert.doesNotThrow(() => new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }))
    }
  }
})

test('à 200 Elo, l’ordi répond en moins de 3 secondes', async () => {
  const start = Date.now()
  await createBot(engine, () => 0.5)(game('r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 8', 200))
  assert.ok(Date.now() - start < 3000)
})
