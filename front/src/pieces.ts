// Images des pièces (jeu « cburnett », libre), indexées par couleur + lettre : 'wq', 'bn', ...
const files = import.meta.glob<string>('./assets/pieces/*.svg', { eager: true, import: 'default', query: '?url' })

export const pieceUrl: Record<string, string> = {}
for (const [path, url] of Object.entries(files)) {
  pieceUrl[path.slice(-6, -4)] = url
}
