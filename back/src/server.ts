import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { openDb } from './db.js'
import { Stockfish } from './engine.js'
import { createClaudeTutor } from './tutor.js'

// Port fixe de l'app. PORT et CHESS_COACH_DB ne servent qu'aux essais sur une base à part.
const PORT = Number(process.env.PORT) || 4300
const backDir = join(dirname(fileURLToPath(import.meta.url)), '..')

// La clé API du tuteur est lue dans back/.env (fichier non versionné).
try {
  process.loadEnvFile(join(backDir, '.env'))
} catch {
  // Pas de .env : le tuteur utilisera ses phrases toutes faites.
}

const db = openDb(process.env.CHESS_COACH_DB || join(backDir, 'data', 'chess-coach.db'))
const engine = new Stockfish()
const app = createApp({ db, engine, tutor: createClaudeTutor(), frontDir: join(backDir, '..', 'front', 'dist') })

app.listen(PORT, () => {
  console.log(`Chess Coach lancé sur http://localhost:${PORT}`)
})

process.on('exit', () => engine.quit())
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => process.exit(0))
