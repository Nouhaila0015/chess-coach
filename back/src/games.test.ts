import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openDb } from './db.js'
import { GameError, botMove, createGame, getCurrentGame, getGame, offerDraw, playerMove, resign } from './games.js'

const play = (db: ReturnType<typeof openDb>, id: number, mine: string[], theirs: string[]) => {
  const uci = (s: string) => ({ from: s.slice(0, 2), to: s.slice(2, 4), promotion: s[4] })
  return (async () => {
    for (let i = 0; i < mine.length; i++) {
      playerMove(db, id, uci(mine[i]))
      if (theirs[i]) await botMove(db, id, async () => theirs[i])
    }
    return getGame(db, id)
  })()
}

test('crée une partie avec la couleur choisie et refuse une deuxième partie', () => {
  const db = openDb(':memory:')
  const g = createGame(db, 'b')
  assert.equal(g.playerColor, 'b')
  assert.equal(g.botElo, 200)
  assert.equal(getCurrentGame(db)?.id, g.id)
  assert.throws(() => createGame(db, 'w'), GameError)
})

test('le tirage aléatoire donne les deux couleurs', () => {
  assert.equal(createGame(openDb(':memory:'), 'random', () => 0.1).playerColor, 'w')
  assert.equal(createGame(openDb(':memory:'), 'random', () => 0.9).playerColor, 'b')
})

test('refuse un coup illégal ou joué hors de son tour', () => {
  const db = openDb(':memory:')
  const g = createGame(db, 'w')
  assert.throws(() => playerMove(db, g.id, { from: 'e2', to: 'e5' }), /illégal/)
  playerMove(db, g.id, { from: 'e2', to: 'e4' })
  assert.throws(() => playerMove(db, g.id, { from: 'd2', to: 'd4' }), /tour/)
})

test('détecte le mat et termine la partie', async () => {
  const db = openDb(':memory:')
  const g = createGame(db, 'w')
  // Mat du berger : trop court pour une revue (moins de 5 coups).
  const end = await play(db, g.id, ['e2e4', 'd1h5', 'f1c4', 'h5f7'], ['e7e5', 'b8c6', 'g8f6'])
  assert.equal(end.status, 'finished')
  assert.equal(end.result, 'win')
  assert.equal(end.reason, 'checkmate')
  assert.equal(end.flow, 'done')
  assert.equal(end.moves.at(-1)?.san, 'Qxf7#')
})

test('détecte la nulle par répétition', async () => {
  const db = openDb(':memory:')
  const g = createGame(db, 'w')
  const end = await play(db, g.id, ['g1f3', 'f3g1', 'g1f3', 'f3g1'], ['g8f6', 'f6g8', 'g8f6', 'f6g8'])
  assert.equal(end.result, 'draw')
  assert.equal(end.reason, 'repetition')
})

test('l’abandon compte comme une défaite', () => {
  const db = openDb(':memory:')
  const g = createGame(db, 'w')
  const end = resign(db, g.id)
  assert.equal(end.result, 'loss')
  assert.equal(end.reason, 'resign')
  assert.equal(getCurrentGame(db), null)
})

test('la nulle est refusée avant 20 coups, puis limitée à une proposition tous les 10 coups', async () => {
  const db = openDb(':memory:')
  const g = createGame(db, 'w')
  const first = await offerDraw(db, g.id, async () => 0)
  assert.equal(first.accepted, false)
  await assert.rejects(offerDraw(db, g.id, async () => 0), /tous les 10 coups/)
})

test('après 20 coups, la nulle dépend de l’évaluation', async () => {
  const db = openDb(':memory:')
  const g = createGame(db, 'w')
  // 20 coups complets sans capture ni répétition : les pions avancent, puis les pièces sortent.
  const mine = ['a2a3', 'b2b3', 'c2c3', 'd2d3', 'e2e3', 'f2f3', 'g2g3', 'h2h3', 'a3a4', 'b3b4', 'c3c4', 'd3d4', 'e3e4', 'f3f4', 'g3g4', 'h3h4', 'c1b2', 'f1g2', 'b1c3', 'g1f3']
  const theirs = ['a7a6', 'b7b6', 'c7c6', 'd7d6', 'e7e6', 'f7f6', 'g7g6', 'h7h6', 'a6a5', 'b6b5', 'c6c5', 'd6d5', 'e6e5', 'f6f5', 'g6g5', 'h6h5', 'c8b7', 'f8g7', 'b8c6', 'g8f6']
  const mid = await play(db, g.id, mine, theirs)
  assert.equal(mid.status, 'playing')
  assert.equal(mid.moves.length, 40)
  // Je suis nettement moins bien : l'ordi refuse.
  assert.equal((await offerDraw(db, g.id, async () => -300)).accepted, false)
  db.prepare('UPDATE games SET last_draw_offer_ply = NULL WHERE id = ?').run(g.id)
  const ok = await offerDraw(db, g.id, async () => 20)
  assert.equal(ok.accepted, true)
  assert.equal(ok.game.reason, 'agreement')
})
