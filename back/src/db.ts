import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const START_ELO = 200

export type Db = DatabaseSync

// Ouvre la base (fichier ou ':memory:' pour les tests) et crée les tables si besoin.
export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      elo INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      ended_at TEXT,
      player_color TEXT NOT NULL,
      elo_before INTEGER NOT NULL,
      bot_elo INTEGER NOT NULL,
      moves TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'playing',
      result TEXT,
      reason TEXT,
      elo_after INTEGER,
      last_draw_offer_ply INTEGER,
      flow TEXT NOT NULL DEFAULT 'playing',
      review_status TEXT NOT NULL DEFAULT 'none',
      review_progress REAL NOT NULL DEFAULT 0,
      review TEXT
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id),
      created_at TEXT NOT NULL,
      data TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new'
    );
  `)
  db.prepare('INSERT OR IGNORE INTO profile (id, elo) VALUES (1, ?)').run(START_ELO)
  return db
}

export function getElo(db: Db): number {
  return (db.prepare('SELECT elo FROM profile WHERE id = 1').get() as { elo: number }).elo
}
