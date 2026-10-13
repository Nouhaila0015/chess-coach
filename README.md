# Chess Coach

Application web pour jouer aux échecs contre l'ordinateur et progresser : partie sans aide, revue par un tuteur, une leçon par partie, Elo qui évolue.

La conception complète est dans `CLAUDE.md`.

## Lancer l'app

```sh
./start.sh   # build si besoin, puis lance http://localhost:4300
./stop.sh    # arrête l'app
```

## Clé API du tuteur

Copie `back/.env.example` vers `back/.env` et renseigne `ANTHROPIC_API_KEY`. Sans clé, la revue et la leçon utilisent des phrases toutes faites.

## Développement

```sh
cd back && npm run dev    # BFF sur le port 4300
cd front && npm run dev   # Vite, /api est redirigé vers le BFF
cd back && npm test
```

## Crédits

- Pièces : jeu « cburnett » de Colin M.L. Burnett (GPLv2+), extrait du paquet `chessground`.
- Plateau interactif : `chessground` (GPL-3.0), Lichess.
- Sons : jeu « standard » de Lichess, par Enigmahack (AGPLv3+).
- Moteur : Stockfish, via `stockfish.js` (GPL-3.0).
