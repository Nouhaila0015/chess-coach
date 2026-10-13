import captureUrl from './assets/sounds/Capture.mp3'
import confirmationUrl from './assets/sounds/Confirmation.mp3'
import errorUrl from './assets/sounds/Error.mp3'
import notifyUrl from './assets/sounds/GenericNotify.mp3'
import moveUrl from './assets/sounds/Move.mp3'

const urls = { move: moveUrl, capture: captureUrl, notify: notifyUrl, error: errorUrl, promote: confirmationUrl }
type Sample = keyof typeof urls

const cache = new Map<Sample, HTMLAudioElement>()

function sample(name: Sample, delay = 0) {
  let base = cache.get(name)
  if (!base) {
    base = new Audio(urls[name])
    cache.set(name, base)
  }
  const audio = base.cloneNode() as HTMLAudioElement
  // Le navigateur peut refuser de jouer un son avant la première interaction : on l'ignore.
  window.setTimeout(() => void audio.play().catch(() => {}), delay)
}

let ctx: AudioContext | null = null

// Petit « ding » ajouté au son de déplacement quand le roi est en échec.
function ding(delay = 0) {
  try {
    ctx ??= new AudioContext()
    const t = ctx.currentTime + delay / 1000
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1180, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.3)
  } catch {
    // Pas d'audio disponible.
  }
}

export type SoundName = 'move' | 'capture' | 'castle' | 'check' | 'promote' | 'error' | 'start' | 'end'

export function play(name: SoundName) {
  switch (name) {
    case 'castle':
      sample('move')
      sample('move', 110)
      break
    case 'check':
      sample('move')
      ding(60)
      break
    case 'start':
    case 'end':
      sample('notify')
      break
    default:
      sample(name)
  }
}

// Son correspondant à un coup, d'après sa notation algébrique.
export function playMove(san: string) {
  if (san.includes('+') || san.includes('#')) {
    if (san.includes('x')) sample('capture')
    play('check')
  } else if (san.includes('=')) play('promote')
  else if (san.startsWith('O-O')) play('castle')
  else if (san.includes('x')) play('capture')
  else play('move')
}
