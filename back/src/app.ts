import express from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { type Db, getElo } from './db.js'

export interface AppOptions {
  db: Db
  // Dossier du front buildé, servi par le BFF en production.
  frontDir?: string
}

export function createApp({ db, frontDir }: AppOptions) {
  const app = express()
  app.use(express.json())

  app.get('/api/state', (_req, res) => {
    res.json({ elo: getElo(db) })
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Route inconnue' })
  })

  if (frontDir && existsSync(frontDir)) {
    app.use(express.static(frontDir))
    app.get('/{*path}', (_req, res) => res.sendFile(join(frontDir, 'index.html')))
  }

  return app
}
