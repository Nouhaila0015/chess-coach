import type { Db } from './db.js'
import type { Engine } from './engine.js'
import { GameError, MIN_PLAYER_MOVES_FOR_REVIEW, getGame } from './games.js'
import { buildLessonFacts, saveLesson } from './lessons.js'
import { type Review, analyseGame } from './review.js'
import { type Tutor, fallbackTexts } from './tutor.js'

export interface ReviewState {
  status: 'none' | 'running' | 'done' | 'error'
  // Avancement de 0 à 1 et étape en cours, pendant la préparation.
  progress: number
  phase: 'analysis' | 'writing' | null
  review: Review | null
}

// Prépare les revues en tâche de fond : analyse Stockfish, leçon, puis textes du tuteur.
export class ReviewRunner {
  private running = new Map<number, { progress: number; phase: 'analysis' | 'writing' }>()

  constructor(
    private db: Db,
    private engine: Engine,
    private tutor: Tutor,
  ) {}

  state(gameId: number): ReviewState {
    const row = this.db.prepare('SELECT review_status, review FROM games WHERE id = ?').get(gameId) as
      | { review_status: string; review: string | null }
      | undefined
    if (!row) throw new GameError('Partie introuvable')
    const job = this.running.get(gameId)
    if (job) return { status: 'running', progress: job.progress, phase: job.phase, review: null }
    if (row.review_status === 'done' && row.review) {
      return { status: 'done', progress: 1, phase: null, review: JSON.parse(row.review) as Review }
    }
    return { status: row.review_status === 'error' ? 'error' : 'none', progress: 0, phase: null, review: null }
  }

  // Lance la préparation si elle n'est ni faite ni en cours. Renvoie la promesse du travail lancé.
  start(gameId: number): Promise<void> {
    const game = getGame(this.db, gameId)
    if (game.status !== 'finished') throw new GameError("La partie n'est pas terminée")
    const mine = game.moves.filter((_, i) => (i % 2 === 0) === (game.playerColor === 'w')).length
    if (mine < MIN_PLAYER_MOVES_FOR_REVIEW) throw new GameError('Partie trop courte pour une revue')
    if (this.running.has(gameId) || this.state(gameId).status === 'done') return Promise.resolve()

    const job = { progress: 0, phase: 'analysis' as 'analysis' | 'writing' }
    this.running.set(gameId, job)
    return (async () => {
      try {
        // L'analyse compte pour 85 % de la barre, la rédaction pour le reste.
        const review = await analyseGame(game, this.engine, (r) => (job.progress = r * 0.85))
        const facts = await buildLessonFacts(game, review, this.engine)
        job.phase = 'writing'
        job.progress = 0.9
        const ctx = { game, review, lesson: facts }
        const written = await this.tutor(ctx)
        const texts = written ?? fallbackTexts(ctx)
        review.ai = written !== null
        review.summary = texts.summary
        for (const m of review.moves) if (m.mine) m.comment = texts.comments[m.ply]
        review.lessonId = saveLesson(this.db, game, facts, texts.lesson, review.ai)
        this.db.prepare("UPDATE games SET review = ?, review_status = 'done' WHERE id = ?").run(JSON.stringify(review), gameId)
      } catch (error) {
        console.error('Revue : échec de la préparation', error)
        this.db.prepare("UPDATE games SET review_status = 'error' WHERE id = ?").run(gameId)
      } finally {
        this.running.delete(gameId)
      }
    })()
  }
}
