import type { Reason } from './types'

const PIECES: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' }

// Notation algébrique française : Nf3 → Cf3, Qxd4 → Dxd4, e8=Q → e8=D.
export function sanFr(san: string): string {
  if (san.startsWith('O-O')) return san
  return san.replace(/[KQRBN]/g, (c) => PIECES[c])
}

export const REASONS: Record<Reason, string> = {
  checkmate: 'par échec et mat',
  resign: 'par abandon',
  stalemate: 'par pat',
  repetition: 'par triple répétition',
  fifty: 'par la règle des 50 coups',
  material: 'par matériel insuffisant',
  agreement: 'par accord mutuel',
}
