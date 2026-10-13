import { type ReactNode, useEffect, useState } from 'react'
import { isMuted, setMuted, speak, stop } from '../speech'

interface Props {
  // Texte affiché et lu à voix haute.
  text: string
  children?: ReactNode
  // Faux pour une bulle muette (consigne courte).
  voice?: boolean
}

// Bulle du tuteur : le texte est lu dès qu'il change, sauf si la voix est coupée.
export default function Tutor({ text, children, voice = true }: Props) {
  const [muted, setMutedState] = useState(isMuted)
  const [speaking, setSpeaking] = useState(false)

  const read = () => {
    setSpeaking(true)
    speak(text, () => setSpeaking(false))
  }

  useEffect(() => {
    if (!voice) return
    if (!isMuted()) read()
    return () => {
      stop()
      setSpeaking(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, voice])

  const toggle = () => {
    setMuted(!muted)
    setMutedState(!muted)
    if (muted) read()
    else setSpeaking(false)
  }

  return (
    <div className="tutor">
      <div className="face">🎓</div>
      <div className="bubble">
        {children ?? text}
        {voice && (
          <div className="voice">
            <button onClick={read} disabled={speaking}>
              {speaking ? '🔊 Lecture…' : '↻ Réécouter'}
            </button>
            <button onClick={toggle}>{muted ? '🔈 Activer la voix' : '🔇 Couper la voix'}</button>
          </div>
        )}
      </div>
    </div>
  )
}
