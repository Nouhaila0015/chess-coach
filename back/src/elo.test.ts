import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getElo, openDb } from './db.js'
import { getProgress, newElo } from './elo.js'
import { createGame, resign } from './games.js'

test('à Elo égal : +16 pour une victoire, 0 pour une nulle, −16 pour une défaite', () => {
  assert.equal(newElo(200, 200, 'win'), 216)
  assert.equal(newElo(200, 200, 'draw'), 200)
  assert.equal(newElo(200, 200, 'loss'), 184)
})

test('l’Elo ne descend jamais sous 100', () => {
  assert.equal(newElo(104, 104, 'loss'), 100)
  assert.equal(newElo(100, 100, 'loss'), 100)
})

test('la fin de partie met à jour l’Elo et la progression', () => {
  const db = openDb(':memory:')
  resign(db, createGame(db, 'w').id)
  assert.equal(getElo(db), 184)
  const second = createGame(db, 'w')
  assert.equal(second.botElo, 184)
  const end = resign(db, second.id)
  assert.equal(end.eloAfter, 168)
  assert.deepEqual(getProgress(db), { elo: 168, best: 200, games: 2, wins: 0, draws: 0, losses: 2, history: [200, 184, 168] })
})
