import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { openDb } from './db.js'

const PORT = 4300
const backDir = join(dirname(fileURLToPath(import.meta.url)), '..')

// La clé API du tuteur est lue dans back/.env (fichier non versionné).
try {
  process.loadEnvFile(join(backDir, '.env'))
} catch {
  // Pas de .env : le tuteur utilisera ses phrases toutes faites.
}

const db = openDb(join(backDir, 'data', 'chess-coach.db'))
const app = createApp({ db, frontDir: join(backDir, '..', 'front', 'dist') })

app.listen(PORT, () => {
  console.log(`Chess Coach lancé sur http://localhost:${PORT}`)
})
