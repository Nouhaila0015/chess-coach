import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createBot } from './bot.js'
import { type Db, getElo } from './db.js'
import { getProgress } from './elo.js'
import type { Engine } from './engine.js'
import {
  type Game,
  GameError,
  botMove,
  createGame,
  getCurrentGame,
  getGame,
  getPendingGame,
  offerDraw,
  playerMove,
  resign,
  setFlow,
} from './games.js'
import { type Lesson, MAX_ATTEMPTS, checkAttempt, getLesson, listLessons } from './lessons.js'
import { ReviewRunner } from './reviews.js'
import type { Tutor } from './tutor.js'

export interface AppOptions {
  db: Db
  // Dossier du front buildé, servi par le BFF en production.
  frontDir?: string
  engine: Engine
  tutor: Tutor
}

// Ce que le front reçoit d'une partie : jamais d'évaluation ni de meilleur coup.
function publicGame(game: Game) {
  return game
}

// La solution et les indices de l'exercice restent côté BFF : ils sont donnés au fil des essais.
function publicLesson(lesson: Lesson) {
  const { accepted: _accepted, best: _best, bestLine: _bestLine, hints: _hints, ...rest } = lesson
  return rest
}

export function createApp({ db, frontDir, engine, tutor }: AppOptions) {
  const bot = createBot(engine)
  const reviews = new ReviewRunner(db, engine, tutor)
  const app = express()
  app.use(express.json())

  const id = (req: Request) => Number(req.params.id)
  // Une seule réflexion de l'ordi à la fois par partie.
  const thinking = new Map<number, Promise<Game>>()

  app.get('/api/state', (_req, res) => {
    const current = getCurrentGame(db)
    const pending = getPendingGame(db)
    res.json({
      elo: getElo(db),
      game: current ? publicGame(current) : null,
      pending: pending ? { gameId: pending.id, step: pending.flow, lessonId: reviews.state(pending.id).review?.lessonId ?? null } : null,
    })
  })

  app.post('/api/games', (req, res) => {
    const color = req.body?.color
    if (color !== 'w' && color !== 'b' && color !== 'random') throw new GameError('Couleur invalide')
    res.status(201).json(publicGame(createGame(db, color)))
  })

  app.get('/api/games/:id', (req, res) => {
    res.json(publicGame(getGame(db, id(req))))
  })

  app.post('/api/games/:id/move', (req, res) => {
    const { from, to, promotion } = req.body ?? {}
    if (typeof from !== 'string' || typeof to !== 'string') throw new GameError('Coup invalide')
    res.json(publicGame(playerMove(db, id(req), { from, to, promotion })))
  })

  app.post('/api/games/:id/bot', async (req, res) => {
    const gameId = id(req)
    let job = thinking.get(gameId)
    if (!job) {
      job = botMove(db, gameId, bot).finally(() => thinking.delete(gameId))
      thinking.set(gameId, job)
    }
    res.json(publicGame(await job))
  })

  app.post('/api/games/:id/resign', (req, res) => {
    res.json(publicGame(resign(db, id(req))))
  })

  app.post('/api/games/:id/draw', async (req, res) => {
    const evaluate = async (fen: string) => (await engine.analyse(fen, { depth: 12, movetime: 1500 }))[0].cp
    const { accepted, game } = await offerDraw(db, id(req), evaluate)
    res.json({ accepted, game: publicGame(game) })
  })

  app.post('/api/games/:id/review', (req, res) => {
    void reviews.start(id(req))
    res.json(reviews.state(id(req)))
  })

  app.get('/api/games/:id/review', (req, res) => {
    res.json({ ...reviews.state(id(req)), game: publicGame(getGame(db, id(req))) })
  })

  app.post('/api/games/:id/flow', (req, res) => {
    const step = req.body?.step
    if (step !== 'lesson' && step !== 'done') throw new GameError('Étape invalide')
    res.json(publicGame(setFlow(db, id(req), step)))
  })

  app.get('/api/lessons', (_req, res) => {
    res.json(listLessons(db).map(publicLesson))
  })

  app.get('/api/lessons/:id', (req, res) => {
    res.json(publicLesson(getLesson(db, id(req))))
  })

  app.post('/api/lessons/:id/attempt', (req, res) => {
    const { uci, attempt } = req.body ?? {}
    if (typeof uci !== 'string' || !Number.isInteger(attempt) || attempt < 1 || attempt > MAX_ATTEMPTS) {
      throw new GameError('Essai invalide')
    }
    res.json(checkAttempt(db, id(req), uci, attempt))
  })

  app.get('/api/progress', (_req, res) => {
    res.json(getProgress(db))
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Route inconnue' })
  })

  if (frontDir && existsSync(frontDir)) {
    app.use(express.static(frontDir))
    app.get('/{*path}', (_req, res) => res.sendFile(join(frontDir, 'index.html')))
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof GameError) {
      res.status(400).json({ error: err.message })
      return
    }
    console.error(err)
    res.status(500).json({ error: 'Erreur interne' })
  })

  return app
}
