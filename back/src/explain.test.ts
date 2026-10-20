import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Chess } from 'chess.js'
import { Stockfish } from './engine.js'
import { balance, explain } from './explain.js'
import type { Game, MoveRec } from './games.js'
import { analyseGame } from './review.js'

const engine = new Stockfish()
after(() => engine.quit())

async function reviewed(sans: string, playerColor: 'w' | 'b') {
  const chess = new Chess()
  const moves: MoveRec[] = sans.split(' ').map((san) => {
    const m = chess.move(san)
    return { san: m.san, from: m.from, to: m.to, promotion: m.promotion, fen: chess.fen() }
  })
  const game = { id: 1, playerColor, moves, fen: chess.fen() } as Game
  const review = await analyseGame(game, engine)
  const at = (ply: number) => explain(ply === 0 ? new Chess().fen() : moves[ply - 1].fen, review.moves[ply], review.moves[ply - 1])
  return { review, at }
}

test('évaluation en mots', () => {
  assert.equal(balance(0.1), "l'égalité")
  assert.equal(balance(2.4), 'un avantage de 2,4 pions')
  assert.equal(balance(-0.5), 'un retard de 0,5 pion')
})

test('une gaffe sans perte immédiate nomme la pièce qui va être perdue', async () => {
  const { at } = await reviewed('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 d4 b5 Bb3 Nxd4 Nxd4 exd4 Qxd4 c5 Qd5 Be6 Qc6+ Bd7 Qd5 c4', 'w')
  const qxd4 = at(14)
  assert.match(qxd4.comment, /^Après 8\. Dxd4 .*ton fou en b3/)
  assert.match(qxd4.comment, /Il fallait jouer /)
  // Les coups simples disent ce qu'ils accomplissent.
  assert.match(at(2).comment, /^Tu développes ton cavalier\./)
})

test('une gaffe qui permet un mat le dit, avec la suite', async () => {
  const { at } = await reviewed('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#', 'b')
  const fxd1 = at(9)
  assert.match(fxd1.comment, /l'ordi peut te mater en 2 coups/)
  assert.match(fxd1.comment, /Cd5#/)
  assert.ok(fxd1.facts.some((f) => f.startsWith('Meilleur coup : ')))
})
