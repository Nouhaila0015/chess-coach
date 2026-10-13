// Lecture à voix haute des textes du tuteur, avec la synthèse vocale du navigateur.
const KEY = 'chess-coach-muet'
const PIECES: Record<string, string> = { R: 'roi', D: 'dame', T: 'tour', F: 'fou', C: 'cavalier' }

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(KEY, muted ? '1' : '0')
  } catch {
    // Préférence non enregistrée : sans gravité.
  }
  if (muted) stop()
}

// Transforme la notation des coups en mots : « 8. Dxd4+ » → « dame prend d 4 échec ».
export function speakable(text: string): string {
  return text
    .replace(/\bO-O-O\b/g, 'grand roque')
    .replace(/\bO-O\b/g, 'petit roque')
    .replace(/\b\d+\.(\.\.)?\s*/g, '')
    .replace(/\b([RDTFC])?([a-h])?([1-8])?(x)?([a-h])([1-8])(?:=([DTFC]))?([+#])?(?![a-zà-ÿ])/g, (_m, piece, file, rank, takes, f, r, promo, check) => {
      const parts: string[] = []
      if (piece) parts.push(PIECES[piece])
      if (file || rank) parts.push(`${file ?? ''}${rank ? ` ${rank}` : ''}`.trim())
      if (takes) parts.push('prend')
      parts.push(`${f} ${r}`)
      if (promo) parts.push(`promotion en ${PIECES[promo]}`)
      if (check === '+') parts.push('échec')
      if (check === '#') parts.push('échec et mat')
      return parts.join(' ')
    })
}

function frenchVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('fr'))
  return voices.find((v) => v.lang === 'fr-FR' && v.localService) ?? voices.find((v) => v.lang === 'fr-FR') ?? voices[0]
}

export function stop() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

// Lit un texte (en coupant la lecture en cours). `onEnd` est appelé à la fin ou à l'interruption.
export function speak(text: string, onEnd?: () => void) {
  if (!('speechSynthesis' in window)) return onEnd?.()
  stop()
  const utterance = new SpeechSynthesisUtterance(speakable(text))
  utterance.lang = 'fr-FR'
  const voice = frenchVoice()
  if (voice) utterance.voice = voice
  utterance.rate = 1
  utterance.onend = () => onEnd?.()
  utterance.onerror = () => onEnd?.()
  window.speechSynthesis.speak(utterance)
}
