import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openDb } from './db.js'
import { GameError, botMove, createGame, getCurrentGame, getGame, playerMove } from './games.js'

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
