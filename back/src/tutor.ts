import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { Chess, type Square } from 'chess.js'
import { z } from 'zod'
import type { Game } from './games.js'
import type { Eval, MoveReview, Review } from './review.js'
import { explain } from './explain.js'
import { CATEGORY_FR, PIECE_NAMES, lineFr, sanFr } from './text.js'

// Faits de la leçon, calculés par Stockfish (voir lessons.ts).
export interface LessonFacts {
  ply: number
  fen: string
  played: { san: string; uci: string }
  best: { san: string; uci: string }
  // Coups acceptés dans l'exercice (UCI) : le meilleur et ceux presque aussi bons.
  accepted: string[]
  // Suite qui punit le coup joué, coup joué compris, puis suite après le meilleur coup.
  punishLine: string[]
  bestLine: string[]
}

export interface TutorTexts {
  summary: string
  // Commentaire de chacun de mes coups, par rang de demi-coup.
  comments: Record<number, string>
  lesson: { title: string; explanation: string; principle: string; hints: string[] }
}

export interface TutorContext {
  game: Game
  review: Review
  lesson: LessonFacts
}

// Renvoie null si le tuteur IA est indisponible : l'appelant utilise alors les phrases toutes faites.
export type Tutor = (ctx: TutorContext) => Promise<TutorTexts | null>

const moveLabel = (m: MoveReview) => lineFr(m.ply, [m.san])

const fenBefore = (game: Game, ply: number) => (ply === 0 ? new Chess().fen() : game.moves[ply - 1].fen)

function explainMove(game: Game, review: Review, m: MoveReview) {
  return explain(fenBefore(game, m.ply), m, m.ply > 0 ? review.moves[m.ply - 1] : undefined)
}

// Raison concrète de l'erreur, sans dévoiler le meilleur coup.
function lessonWhy(game: Game, review: Review, worst: MoveReview): string {
  const why = explainMove(game, review, worst).facts.find((f) => f.startsWith('Problème du coup joué : '))
  if (!why) return `La suite ${lineFr(worst.ply, worst.playedLine)} est mauvaise pour toi.`
  const text = why.slice('Problème du coup joué : '.length)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Phrases toutes faites, utilisées quand l'API Claude est indisponible ou que la clé manque.
export function fallbackTexts({ game, review, lesson }: TutorContext): TutorTexts {
  const comments: Record<number, string> = {}
  for (const m of review.moves) if (m.mine) comments[m.ply] = explainMove(game, review, m).comment
  const worst = review.moves[lesson.ply]
  const piece = new Chess(lesson.fen).get(lesson.best.uci.slice(0, 2) as Square)
  const outcome = { win: 'Tu as gagné', loss: 'Tu as perdu', draw: 'Partie nulle' }[game.result ?? 'draw']
  return {
    summary: `${outcome}, avec une précision de ${String(review.accuracy.me).replace('.', ',')} %. Le tournant de la partie : ${moveLabel(worst)}, ${CATEGORY_FR[worst.category].toLowerCase()}. Regardons ensemble les moments clés.`,
    comments,
    lesson: {
      title: `Mon plus mauvais coup : ${moveLabel(worst)}`,
      explanation: `Dans cette position, tu as joué ${moveLabel(worst)}. ${lessonWhy(game, review, worst)} Un autre coup était bien meilleur : à toi de le trouver dans l'exercice.`,
      principle: 'Avant de jouer, regarde les réponses de ton adversaire : échecs, captures et menaces.',
      hints: [
        `Le bon coup se joue avec ${PIECE_NAMES[piece?.type ?? 'p']}.`,
        `La pièce à déplacer est sur la case ${lesson.best.uci.slice(0, 2)}.`,
      ],
    },
  }
}

const Output = z.object({
  summary: z.string(),
  comments: z.array(z.object({ ply: z.number(), text: z.string() })),
  lesson: z.object({
    title: z.string(),
    explanation: z.string(),
    principle: z.string(),
    hints: z.array(z.string()),
  }),
})

const SYSTEM = `Tu es le tuteur d'échecs de l'application Chess Coach. Tu fais la revue d'une partie jouée par un débutant contre un ordinateur de son niveau, puis tu en tires une leçon.

Ton élève te lit et t'écoute en même temps : tes textes sont affichés dans une bulle et lus à voix haute par une synthèse vocale. Écris donc en français simple, en le tutoyant, avec des phrases courtes et naturelles à l'oral, sans listes, sans markdown et sans émojis. Sois chaleureux et encourageant, mais honnête sur les erreurs.

Les données viennent du moteur Stockfish. La catégorie de chaque coup, les évaluations, le meilleur coup et les suites sont des faits établis : ne les contredis pas et ne change jamais une catégorie. N'invente pas de variantes : quand tu cites des coups, prends-les dans les suites fournies. Tu peux en revanche expliquer l'idée derrière ces coups avec les mots d'un entraîneur (pièce en prise, fourchette, clouage, développement, sécurité du roi, contrôle du centre), en t'appuyant sur la position FEN fournie. Si tu n'es pas sûr de la raison tactique, reste sur ce que montrent les suites.

Les coups sont en notation française (R roi, D dame, T tour, F fou, C cavalier). Garde cette notation quand tu cites un coup.

Ce que tu dois produire :
- summary : deux phrases au plus sur l'allure générale de la partie, pour ouvrir la revue.
- comments : un commentaire pour chacun des coups de l'élève listés dans « coups », avec le même « ply ». Une à trois phrases chacun. Chaque commentaire doit donner une raison concrète, jamais un jugement vague comme « ta position se dégrade » ou « tu perds beaucoup » :
  - pour un coup faible, dis précisément ce qui se passe (quelle pièce n'est plus protégée, ce que l'ordi prend, quel mat menace, quelle menace a été oubliée), puis quel était le meilleur coup et ce qu'il gagnait ou empêchait ;
  - pour un bon coup, dis ce qu'il accomplit (prise, développement, sécurité du roi, menace créée) ;
  - pour une occasion manquée, dis quelle erreur de l'ordi n'a pas été punie et comment la punir.
  Les « faits » de chaque coup sont calculés par le moteur : appuie-toi d'abord sur eux. L'écran affiche déjà le coup et sa catégorie en titre (« 8. Dxd4 est une gaffe ») : ne commence pas par les répéter, va droit à l'explication. Varie les tournures d'un coup à l'autre.
- lesson : la leçon porte sur le coup indiqué dans « lecon », le plus mauvais de l'élève.
  - title : un titre court qui nomme le thème, sans numéro de coup.
  - explanation : trois à cinq phrases. Rappelle le coup joué et explique concrètement pourquoi il est mauvais (pièce perdue, mat, menace oubliée) en suivant la suite « suite_qui_punit », que l'élève voit rejouée sur le plateau. Ne donne pas le meilleur coup et ne le laisse pas deviner : l'élève doit le trouver lui-même dans l'exercice qui suit.
  - principle : une seule phrase, un principe général à retenir et à réutiliser dans d'autres parties.
  - hints : exactement deux indices pour l'exercice où l'élève doit retrouver le bon coup dans la même position. Le premier oriente sans nommer la pièce ni la case ; le second est plus précis mais ne donne pas le coup.`

function evalFr(e: Eval, me: 'w' | 'b'): string {
  const sign = me === 'w' ? 1 : -1
  if (e.mate !== null) {
    if (e.mate === 0) return 'échec et mat'
    return e.mate * sign > 0 ? `mat en ${Math.abs(e.mate)} pour l'élève` : `mat en ${Math.abs(e.mate)} pour l'ordi`
  }
  const pawns = (e.cp * sign) / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)} pour l'élève`
}

function buildPrompt({ game, review, lesson }: TutorContext): string {
  const me = game.playerColor
  const data = {
    couleur_de_l_eleve: me === 'w' ? 'Blancs' : 'Noirs',
    resultat: { win: "victoire de l'élève", loss: "défaite de l'élève", draw: 'partie nulle' }[game.result ?? 'draw'],
    fin: game.reason,
    precision_eleve: review.accuracy.me,
    precision_ordi: review.accuracy.bot,
    partie: lineFr(
      0,
      game.moves.map((m) => m.san),
    ),
    coups: review.moves
      .filter((m) => m.mine)
      .map((m) => ({
        ply: m.ply,
        coup: moveLabel(m),
        categorie: CATEGORY_FR[m.category],
        position_avant: fenBefore(game, m.ply),
        faits: explainMove(game, review, m).facts,
        evaluation_avant: evalFr(m.evalBefore, me),
        evaluation_apres: evalFr(m.evalAfter, me),
        meilleur_coup: m.best ? sanFr(m.best.san) : 'le coup joué',
        suite_apres_le_coup_joue: lineFr(m.ply, m.playedLine),
        suite_apres_le_meilleur_coup: m.best ? lineFr(m.ply, m.bestLine) : undefined,
        coup_precedent_de_l_ordi: m.ply > 0 ? `${moveLabel(review.moves[m.ply - 1])} (${CATEGORY_FR[review.moves[m.ply - 1].category]})` : undefined,
      })),
    lecon: {
      ply: lesson.ply,
      position_avant: lesson.fen,
      coup_joue: lineFr(lesson.ply, [lesson.played.san]),
      categorie: CATEGORY_FR[review.moves[lesson.ply].category],
      suite_qui_punit: lineFr(lesson.ply, lesson.punishLine),
      meilleur_coup: sanFr(lesson.best.san),
      suite_apres_le_meilleur_coup: lineFr(lesson.ply, lesson.bestLine),
    },
  }
  return `Voici la partie à commenter.\n\n${JSON.stringify(data, null, 2)}`
}

// Tuteur IA : un seul appel à Claude par partie, pour les commentaires et la leçon.
export function createClaudeTutor(): Tutor {
  return async (ctx) => {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null
    try {
      const client = new Anthropic()
      const response = await client.messages.parse({
        model: process.env.TUTOR_MODEL || 'claude-opus-5-5',
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildPrompt(ctx) }],
        output_config: { effort: 'medium', format: zodOutputFormat(Output) },
      })
      const out = response.parsed_output
      if (response.stop_reason !== 'end_turn' || !out) {
        console.error(`Tuteur : réponse inutilisable (${response.stop_reason})`)
        return null
      }
      // Les commentaires manquants ou hors sujet sont complétés par les phrases toutes faites.
      const texts = fallbackTexts(ctx)
      for (const c of out.comments) {
        if (c.ply in texts.comments && c.text.trim()) texts.comments[c.ply] = c.text.trim()
      }
      const hints = out.lesson.hints.map((h) => h.trim()).filter(Boolean)
      return {
        summary: out.summary.trim() || texts.summary,
        comments: texts.comments,
        lesson: {
          title: out.lesson.title.trim() || texts.lesson.title,
          explanation: out.lesson.explanation.trim() || texts.lesson.explanation,
          principle: out.lesson.principle.trim() || texts.lesson.principle,
          hints: hints.length >= 2 ? hints.slice(0, 2) : texts.lesson.hints,
        },
      }
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) console.error('Tuteur : clé API refusée')
      else if (error instanceof Anthropic.RateLimitError) console.error('Tuteur : limite de requêtes atteinte')
      else if (error instanceof Anthropic.APIError) console.error(`Tuteur : erreur API ${error.status}`, error.message)
      else console.error('Tuteur : erreur', error)
      return null
    }
  }
}
