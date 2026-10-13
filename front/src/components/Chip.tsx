import type { Category } from '../types'

export const CATEGORY: Record<Category, { label: string; symbol: string; verdict: string }> = {
  brilliant: { label: 'Brillant', symbol: '!!', verdict: 'est un coup brillant' },
  great: { label: 'Excellent coup', symbol: '!', verdict: 'est un excellent coup' },
  best: { label: 'Meilleur', symbol: '★', verdict: 'est le meilleur coup' },
  excellent: { label: 'Très bon', symbol: '👍', verdict: 'est un très bon coup' },
  good: { label: 'Bon', symbol: '✓', verdict: 'est un bon coup' },
  book: { label: 'Théorique', symbol: '📖', verdict: 'est un coup théorique' },
  inaccuracy: { label: 'Imprécision', symbol: '?!', verdict: 'est une imprécision' },
  mistake: { label: 'Erreur', symbol: '?', verdict: 'est une erreur' },
  miss: { label: 'Occasion manquée', symbol: '✕', verdict: 'est une occasion manquée' },
  blunder: { label: 'Gaffe', symbol: '??', verdict: 'est une gaffe' },
}

export const CATEGORIES = Object.keys(CATEGORY) as Category[]

// Pastille de couleur d'une catégorie de coup.
export default function Chip({ category, fill }: { category: Category; fill?: boolean }) {
  return (
    <span className={`chip ${category} ${fill ? 'fill' : ''}`} title={CATEGORY[category].label}>
      {CATEGORY[category].symbol}
    </span>
  )
}
