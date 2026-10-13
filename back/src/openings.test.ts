import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Chess } from 'chess.js'
import { OPENING_LINES, isBook } from './openings.js'

test('toutes les lignes de la table sont des suites de coups légaux', () => {
  for (const line of OPENING_LINES) {
    const chess = new Chess()
    for (const san of line) {
      let played
      try {
        played = chess.move(san).san
      } catch {
        assert.fail(`Coup illégal « ${san} » dans la ligne : ${line.join(' ')}`)
      }
      assert.equal(played, san, `Notation inexacte dans la ligne : ${line.join(' ')}`)
    }
  }
})

test('reconnaît un coup théorique et un coup hors théorie', () => {
  assert.equal(isBook(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']), true)
  assert.equal(isBook(['e4', 'e5', 'Ke2']), false)
  assert.equal(isBook(['a4', 'a5']), false)
})
