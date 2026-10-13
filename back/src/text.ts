import type { Category } from './review.js'

const PIECES: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' }

// Notation algébrique française : Nf3 → Cf3, Qxd4 → Dxd4.
export function sanFr(san: string): string {
  if (san.startsWith('O-O')) return san
  return san.replace(/[KQRBN]/g, (c) => PIECES[c])
}

// Suite de coups numérotée, à partir du demi-coup `ply` : « 8. Dxd4 c5 9. Dd5 ».
export function lineFr(ply: number, sans: string[]): string {
  return sans
    .map((san, i) => {
      const p = ply + i
      const n = Math.floor(p / 2) + 1
      if (p % 2 === 0) return `${n}. ${sanFr(san)}`
      return i === 0 ? `${n}... ${sanFr(san)}` : sanFr(san)
    })
    .join(' ')
}

export const CATEGORY_FR: Record<Category, string> = {
  brilliant: 'Brillant',
  great: 'Excellent coup',
  best: 'Meilleur',
  excellent: 'Très bon',
  good: 'Bon',
  book: 'Théorique',
  inaccuracy: 'Imprécision',
  mistake: 'Erreur',
  miss: 'Occasion manquée',
  blunder: 'Gaffe',
}

export const PIECE_NAMES: Record<string, string> = {
  p: 'un pion',
  n: 'un cavalier',
  b: 'un fou',
  r: 'une tour',
  q: 'la dame',
  k: 'le roi',
}
