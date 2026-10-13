import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { type Db, getElo } from './db.js'
import {
  type Game,
  GameError,
  botMove,
  createGame,
  getCurrentGame,
  getGame,
  getPendingGame,
  playerMove,
  randomBot,
} from './games.js'

export interface AppOptions {
  db: Db
  // Dossier du front buildé, servi par le BFF en production.
  frontDir?: string
  // Choix du coup de l'ordi (remplaçable dans les tests).
  bot?: (game: Game) => Promise<string>
}

// Ce que le front reçoit d'une partie : jamais d'évaluation ni de meilleur coup.
function publicGame(game: Game) {
  return game
}

export function createApp({ db, frontDir, bot = randomBot }: AppOptions) {
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
      pending: pending ? { gameId: pending.id, step: pending.flow } : null,
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
