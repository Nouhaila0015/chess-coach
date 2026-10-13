import { Chess } from 'chess.js'
import type { DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import { useEffect, useMemo, useState } from 'react'
import { get, post } from '../api'
import Board from '../components/Board'
import Tutor from '../components/Tutor'
import { sanFr } from '../format'
import { navigate } from '../router'
import { play, playMove } from '../sounds'
import { stop } from '../speech'
import type { AttemptResult, Lesson as LessonData } from '../types'

const MAX_ATTEMPTS = 3

interface Step {
  fen: string
  last?: [string, string]
  san?: string
}

// Positions successives d'une suite de coups, à partir d'une position.
function lineSteps(fen: string, sans: string[]): Step[] {
  const chess = new Chess(fen)
  const steps: Step[] = [{ fen }]
  for (const san of sans) {
    try {
      const m = chess.move(san)
      steps.push({ fen: chess.fen(), last: [m.from, m.to], san: m.san })
    } catch {
      break
    }
  }
  return steps
}

function label(ply: number, san: string) {
  return `${Math.floor(ply / 2) + 1}.${ply % 2 === 1 ? ' …' : ''} ${sanFr(san)}`
}

export default function Lesson({ lessonId, onDone }: { lessonId: number; onDone: () => void }) {
  const [lesson, setLesson] = useState<LessonData | null>(null)
  const [error, setError] = useState('')
  const [stage, setStage] = useState<'explain' | 'exercise'>('explain')
  const [step, setStep] = useState(0)
  const [failed, setFailed] = useState(0)
  const [hint, setHint] = useState('')
  // Résultat final de l'exercice : coup trouvé, ou solution montrée après trois échecs.
  const [outcome, setOutcome] = useState<{ correct: boolean; shown: Step; solution: { san: string; uci: string } } | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    get<LessonData>(`/api/lessons/${lessonId}`).then(setLesson, (e: Error) => setError(e.message))
    return stop
  }, [lessonId])

  const steps = useMemo(() => (lesson ? lineSteps(lesson.fen, lesson.punishLine) : []), [lesson])

  const goStep = (next: number) => {
    const target = Math.max(0, Math.min(steps.length - 1, next))
    if (target === step) return
    if (target > 0) playMove(steps[target].san!)
    setStep(target)
  }

  const shapes = useMemo<DrawShape[]>(
    () =>
      outcome && !outcome.correct
        ? [{ orig: outcome.solution.uci.slice(0, 2) as Key, dest: outcome.solution.uci.slice(2, 4) as Key, brush: 'green' }]
        : [],
    [outcome],
  )

  if (error) return <p className="page error">{error}</p>
  if (!lesson) return null

  const attempt = async (from: string, to: string) => {
    const chess = new Chess(lesson.fen)
    const piece = chess.get(from as never)
    const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined
    const m = chess.move({ from, to, promotion })
    playMove(m.san)
    try {
      const r = await post<AttemptResult>(`/api/lessons/${lesson.id}/attempt`, {
        uci: from + to + (promotion ?? ''),
        attempt: failed + 1,
      })
      if (r.correct) {
        setOutcome({ correct: true, shown: { fen: chess.fen(), last: [from, to] }, solution: { san: m.san, uci: from + to } })
        setHint('')
        return
      }
      play('error')
      setFailed(failed + 1)
      if (r.solution) {
        const best = lineSteps(lesson.fen, [r.solution.san])[1]
        setOutcome({ correct: false, shown: best, solution: r.solution })
        setHint('')
      } else {
        setHint(r.hint ?? '')
        setNonce((n) => n + 1)
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const finish = async () => {
    stop()
    try {
      await post(`/api/games/${lesson.gameId}/flow`, { step: 'done' })
    } catch {
      // Le parcours de cette partie est peut-être déjà terminé (leçon refaite depuis le carnet).
    }
    onDone()
    navigate('')
  }

  const restart = () => {
    setFailed(0)
    setHint('')
    setOutcome(null)
    setNonce((n) => n + 1)
  }

  const shown: Step = stage === 'explain' ? steps[step] : (outcome?.shown ?? { fen: lesson.fen })
  const played = label(lesson.ply, lesson.played.san)

  return (
    <div className="game-layout">
      <div className="lesson-board">
        <Board
          fen={shown.fen}
          orientation={lesson.orientation}
          lastMove={shown.last}
          interactive={stage === 'exercise' && !outcome}
          onMove={attempt}
          shapes={shapes}
          nonce={nonce}
        />
      </div>

      {stage === 'explain' ? (
        <div className="panel side">
          <div className="kicker">La leçon de cette partie</div>
          <h2>{lesson.title}</h2>
          <div className="scroll">
            <Tutor text={`${lesson.explanation} À retenir : ${lesson.principle}`}>{lesson.explanation}</Tutor>
            <div className="principle">À retenir : {lesson.principle}</div>
            {!lesson.ai && <div className="notice">Tuteur IA indisponible : cette leçon utilise un texte automatique.</div>}
            <p className="muted">
              Suite rejouée sur le plateau :{' '}
              {steps.slice(1).map((s, i) => (
                <span key={i} className={i + 1 === step ? 'line-cur' : ''}>
                  {i === 0 || (lesson.ply + i) % 2 === 0 ? label(lesson.ply + i, s.san!) : sanFr(s.san!)}{' '}
                </span>
              ))}
            </p>
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn grey" onClick={() => goStep(step - 1)} disabled={step === 0} aria-label="Coup précédent">
              ◀
            </button>
            <button className="btn grey" onClick={() => goStep(step + 1)} disabled={step === steps.length - 1} aria-label="Coup suivant">
              ▶
            </button>
          </div>
          <button
            className="btn small"
            onClick={() => {
              stop()
              setStage('exercise')
            }}
          >
            Passer à l'exercice
          </button>
        </div>
      ) : (
        <div className="panel side">
          <div className="kicker">Exercice</div>
          <h2>{outcome ? (outcome.correct ? 'Bien joué !' : 'La solution') : 'À toi de jouer'}</h2>
          <div className="scroll">
            {!outcome && !hint && (
              <Tutor text={`Revoici la position avant ton coup. Trouve un meilleur coup que ${played}.`} />
            )}
            {!outcome && hint && <Tutor text={`Pas tout à fait. Indice : ${hint}`} />}
            {outcome?.correct && (
              <Tutor text={`Bravo ! ${sanFr(outcome.solution.san)} est un bon coup. Souviens-toi : ${lesson.principle}`} />
            )}
            {outcome && !outcome.correct && (
              <Tutor
                text={`Le bon coup était ${sanFr(outcome.solution.san)}. Tu pourras refaire cet exercice dans ton carnet de leçons. Souviens-toi : ${lesson.principle}`}
              />
            )}
            <h3>Essais</h3>
            <div className="tries">
              {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
                <i key={i} className={i < failed ? 'fail' : outcome?.correct && i === failed ? 'ok' : ''} />
              ))}
            </div>
            <p className="muted">Un indice après chaque échec, la solution après {MAX_ATTEMPTS} échecs.</p>
          </div>
          {outcome && (
            <button className="btn grey" style={{ marginBottom: 12 }} onClick={restart}>
              Refaire l'exercice
            </button>
          )}
          <div className="row">
            <button
              className="btn grey"
              onClick={() => {
                stop()
                setStage('explain')
              }}
            >
              ◀ Explication
            </button>
            <button className="btn small" onClick={finish}>
              Terminer la leçon
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
