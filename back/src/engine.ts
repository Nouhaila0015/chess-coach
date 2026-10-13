import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createRequire } from 'node:module'

export interface Line {
  // Coup au format UCI (« e2e4 », « e7e8q »).
  move: string
  // Évaluation en centipions, du point de vue du camp au trait. Un mat vaut ±(MATE − 100 × n).
  cp: number
  // Mat en n coups (positif : le camp au trait mate), sinon null.
  mate: number | null
  pv: string[]
}

export interface Engine {
  // Analyse une position et renvoie les meilleures lignes, de la meilleure à la moins bonne.
  analyse(fen: string, opts: AnalyseOptions): Promise<Line[]>
  quit(): void
}

export interface AnalyseOptions {
  depth: number
  multipv?: number
  // Durée maximale de calcul, en millisecondes.
  movetime?: number
}

export const MATE = 100000

export function mateToCp(mate: number): number {
  return mate > 0 ? MATE - 100 * mate : -MATE - 100 * mate
}

// Stockfish (WebAssembly) lancé dans un processus à part, piloté en UCI. Les analyses passent une par une.
export class Stockfish implements Engine {
  private child: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private onLine: ((line: string) => void) | null = null
  private queue: Promise<unknown> = Promise.resolve()

  private start() {
    const require = createRequire(import.meta.url)
    const path = (require('stockfish') as { findEngine: (name: string) => string }).findEngine('lite-single')
    const child = spawn(process.execPath, [path], { stdio: 'pipe' })
    child.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString()
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''
      for (const line of lines) this.onLine?.(line.trim())
    })
    child.stderr.on('data', () => {})
    child.on('exit', () => {
      if (this.child === child) this.child = null
    })
    child.stdin.write('uci\n')
    this.child = child
  }

  private send(cmd: string) {
    this.child!.stdin.write(cmd + '\n')
  }

  analyse(fen: string, { depth, multipv = 1, movetime }: AnalyseOptions): Promise<Line[]> {
    const run = () =>
      new Promise<Line[]>((resolve, reject) => {
        if (!this.child) this.start()
        const child = this.child!
        const lines = new Map<number, Line>()
        const fail = () => reject(new Error('Stockfish arrêté'))
        child.once('exit', fail)
        this.onLine = (line) => {
          if (line.startsWith('info ') && line.includes(' pv ')) {
            const score = line.match(/ score (cp|mate) (-?\d+)/)
            if (!score || / (lowerbound|upperbound)/.test(line)) return
            const idx = Number(line.match(/ multipv (\d+)/)?.[1] ?? 1)
            const pv = line.split(' pv ')[1].split(' ')
            const mate = score[1] === 'mate' ? Number(score[2]) : null
            lines.set(idx, { move: pv[0], cp: mate === null ? Number(score[2]) : mateToCp(mate), mate, pv })
          } else if (line.startsWith('bestmove')) {
            this.onLine = null
            child.off('exit', fail)
            resolve([...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]))
          }
        }
        this.send(`setoption name MultiPV value ${multipv}`)
        this.send(`position fen ${fen}`)
        this.send(`go depth ${depth}${movetime ? ` movetime ${movetime}` : ''}`)
      })
    const job = this.queue.then(run, run)
    this.queue = job.catch(() => {})
    return job
  }

  quit() {
    this.child?.stdin.write('quit\n')
    this.child = null
  }
}
