import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { openDb } from './db.js'
import { Stockfish } from './engine.js'
import { botMove, createGame, getGame, playerMove, resign, setFlow } from './games.js'
import { checkAttempt, getLesson, listLessons } from './lessons.js'
import { ReviewRunner } from './reviews.js'
import type { Tutor } from './tutor.js'

const engine = new Stockfish()
after(() => engine.quit())

// Partie du piège de l'arche de Noé, jouée avec les Blancs, puis abandon.
async function playedGame() {
  const db = openDb(':memory:')
  const g = createGame(db, 'w')
  const mine = ['e2e4', 'g1f3', 'f1b5', 'b5a4', 'd2d4', 'a4b3', 'f3d4', 'd1d4', 'd4d5', 'd5c6', 'c6d5']
  const theirs = ['e7e5', 'b8c6', 'a7a6', 'd7d6', 'b7b5', 'c6d4', 'e5d4', 'c7c5', 'c8e6', 'e6d7', 'c5c4']
  for (let i = 0; i < mine.length; i++) {
    playerMove(db, g.id, { from: mine[i].slice(0, 2), to: mine[i].slice(2, 4) })
    await botMove(db, g.id, async () => theirs[i])
  }
  resign(db, g.id)
  return { db, id: g.id }
}

test('sans tuteur IA, la revue utilise les phrases toutes faites et crée la leçon', async () => {
  const { db, id } = await playedGame()
  const runner = new ReviewRunner(db, engine, async () => null)
  assert.equal(runner.state(id).status, 'none')
  const job = runner.start(id)
  assert.equal(runner.state(id).status, 'running')
  await job
  const { status, review } = runner.state(id)
  assert.equal(status, 'done')
  assert.equal(review!.ai, false)
  assert.ok(review!.summary.includes('Tu as perdu'))
  // Chacun de mes coups est commenté, ceux de l'ordi ne le sont pas.
  for (const m of review!.moves) assert.equal(typeof m.comment === 'string' && m.comment.length > 0, m.mine)

  const lesson = getLesson(db, review!.lessonId!)
  assert.equal(lesson.played.san, 'Qxd4')
  assert.equal(lesson.orientation, 'w')
  assert.equal(lesson.punishLine[0], 'Qxd4')
  assert.ok(!lesson.accepted.includes('d1d4'))
  assert.equal(lesson.hints.length, 2)
  assert.equal(lesson.status, 'new')
  assert.equal(listLessons(db).length, 1)

  // Relancer ne refait rien.
  await runner.start(id)
  assert.equal(listLessons(db).length, 1)
})

test('avec le tuteur IA, ses textes sont enregistrés', async () => {
  const { db, id } = await playedGame()
  const tutor: Tutor = async ({ review }) => ({
    summary: 'Résumé du tuteur.',
    comments: Object.fromEntries(review.moves.filter((m) => m.mine).map((m) => [m.ply, `Commentaire ${m.ply}`])),
    lesson: { title: 'Le fou enfermé', explanation: 'Explication.', principle: 'Principe.', hints: ['Indice 1', 'Indice 2'] },
  })
  const runner = new ReviewRunner(db, engine, tutor)
  await runner.start(id)
  const review = runner.state(id).review!
  assert.equal(review.ai, true)
  assert.equal(review.summary, 'Résumé du tuteur.')
  assert.equal(review.moves[14].comment, 'Commentaire 14')
  assert.equal(getLesson(db, review.lessonId!).title, 'Le fou enfermé')
})

test('exercice : indices après un échec, solution après trois, statut mis à jour', async () => {
  const { db, id } = await playedGame()
  const runner = new ReviewRunner(db, engine, async () => null)
  await runner.start(id)
  const lesson = getLesson(db, runner.state(id).review!.lessonId!)

  const first = checkAttempt(db, lesson.id, 'd1d4', 1)
  assert.deepEqual([first.correct, first.hint, first.solution], [false, lesson.hints[0], undefined])
  assert.equal(checkAttempt(db, lesson.id, 'a2a3', 2).hint, lesson.hints[1])
  const third = checkAttempt(db, lesson.id, 'h2h4', 3)
  assert.deepEqual(third.solution, lesson.best)
  assert.equal(getLesson(db, lesson.id).status, 'retry')

  const good = checkAttempt(db, lesson.id, lesson.accepted[0], 1)
  assert.equal(good.correct, true)
  assert.equal(getLesson(db, lesson.id).status, 'ok')
})

test('une partie trop courte n’a pas de revue ; le parcours avance vers la leçon puis se termine', async () => {
  const db = openDb(':memory:')
  const short = createGame(db, 'w')
  resign(db, short.id)
  const runner = new ReviewRunner(db, engine, async () => null)
  assert.throws(() => runner.start(short.id), /trop courte/)

  const { db: db2, id } = await playedGame()
  assert.equal(getGame(db2, id).flow, 'review')
  assert.equal(setFlow(db2, id, 'lesson').flow, 'lesson')
  assert.equal(setFlow(db2, id, 'done').flow, 'done')
})
