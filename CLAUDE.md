# Chess Coach — conception

Application web pour jouer aux échecs contre l'ordinateur et progresser, à usage personnel. Le cycle est toujours le même :

1. je joue une partie contre un ordi de mon niveau, sans aucune aide ;
2. un tuteur fait la revue de la partie, coup par coup, par écrit et à voix haute ;
3. le tuteur choisit **une** leçon à retenir, tirée de mon plus mauvais coup, avec un exercice ;
4. mon Elo monte ou descend selon le résultat.

Le point de départ est un Elo de **200**.

## Décisions techniques

- Front : React + Vite (TypeScript), dossier `front/`.
- BFF : Node + Express (TypeScript), dossier `back/`. Il sert aussi le front buildé (un seul processus, un seul port).
- Règles du jeu : bibliothèque `chess.js`, utilisée côté front (affichage des coups légaux) et côté BFF (validation : le BFF fait foi).
- Moteur d'échecs : **Stockfish** (version WebAssembly, paquet npm), lancé **dans le BFF**. Il sert à deux choses : choisir les coups de l'ordi et analyser la partie pour la revue. Pendant la partie, le front ne reçoit jamais d'évaluation ni de meilleur coup.
- Tuteur : **API Claude** appelée depuis le BFF (modèle `claude-opus-5-5` par défaut, modifiable dans `back/.env`). La clé `ANTHROPIC_API_KEY` est lue dans `back/.env`, jamais versionnée, jamais envoyée au front.
- Voix : synthèse vocale du navigateur (`speechSynthesis`, voix `fr-FR`), sans service externe.
- Stockage : SQLite côté BFF (`back/data/chess-coach.db`, module intégré `node:sqlite`).
- Pas de SAR pour l'instant : le moteur, l'analyse et l'appel à Claude restent dans le BFF.
- Port fixe : **4300** (http://localhost:4300).
- Un seul utilisateur, pas de compte ni d'authentification (usage local).
- Ordinateur d'abord : mise en page pensée pour 1280 px et plus, utilisable jusqu'à 1024 px. Pas de version mobile dédiée.
- Interface et commentaires du tuteur en français.

## Design

Reprend l'apparence de chess.com avec des ressources libres (les images et sons de chess.com sont propriétaires et ne sont pas copiés) :

- Un seul thème de plateau : cases claires `#EEEED2`, cases vertes `#769656`. Aucun autre thème proposé.
- Fond de page gris très foncé `#302E2B`, panneaux `#262522`, texte blanc cassé, bouton principal vert `#81B64C`.
- Pièces : un jeu de pièces SVG libre, au style le plus proche possible ; licence créditée dans le `README`.
- Sons : un jeu de sons libre, proche de celui de chess.com, embarqué localement ; licence créditée dans le `README`.
- Coordonnées (a–h, 1–8) affichées dans les cases du bord.
- Le plateau est toujours orienté avec ma couleur en bas.
- Navigation : barre latérale à gauche avec Jouer · Progression · Leçons, et mon Elo en bas de la barre.

---

## Feature 1 — Accueil et lancement d'une partie

### À implémenter

- Affichage de mon Elo actuel (200 au premier lancement).
- Choix de ma couleur avant la partie : **Blancs**, **Noirs** ou **Aléatoire**.
- Bouton « Jouer » qui crée la partie.
- Si une partie est en cours (onglet fermé, PC redémarré), l'accueil propose de la reprendre au lieu d'en créer une nouvelle.
- Si la revue ou la leçon de la dernière partie n'est pas terminée, l'accueil propose de la reprendre.

### Contraintes

- Pas de choix de niveau : l'ordi suit mon Elo (voir feature 3).
- Pas de pendule : aucune limite de temps.
- « Aléatoire » : tirage à 50/50 fait par le BFF.
- Une seule partie en cours à la fois.

---

## Feature 2 — Plateau de jeu

### À implémenter

- Déplacement des pièces par **glisser-déposer** et par **clic sur la pièce puis clic sur la case**.
- Quand je sélectionne une pièce : case surlignée, points sur les cases d'arrivée possibles, anneau sur les pièces prenables (comme sur chess.com).
- Surlignage jaune du dernier coup (case de départ et d'arrivée), roi en rouge quand il est en échec.
- Animation de glissement des pièces de l'ordi.
- Promotion : petite fenêtre de choix (dame, tour, fou, cavalier) sur la case d'arrivée.
- Toutes les règles : roque, prise en passant, promotion, échec, mat, pat, triple répétition, règle des 50 coups, matériel insuffisant.
- Bandeau de chaque joueur (au-dessus et en dessous du plateau) : nom, Elo, pièces capturées et avantage matériel (+3, etc.).
- Panneau de droite : liste des coups en notation algébrique, boutons pour revenir en arrière dans l'affichage des coups déjà joués (lecture seule), boutons **Abandonner** et **Proposer nulle**.
- Sons : déplacement, capture, roque, échec, promotion, coup illégal, début de partie, fin de partie.
- Jeu à tour de rôle : je ne peux bouger que mes pièces et seulement à mon tour.
- La partie est enregistrée coup par coup dans le BFF : je peux la reprendre après avoir fermé l'onglet.
- Fin de partie : fenêtre avec le résultat, la raison (mat, abandon, pat, etc.), la variation d'Elo et un bouton « Lancer la revue ».

### Contraintes

- **Aucune aide pour jouer un coup** : pas de bouton indice, pas de meilleur coup, pas de flèche, pas de barre d'évaluation, pas d'annulation de coup, pas de commentaire du tuteur pendant la partie.
- Les points des coups légaux sont le seul repère affiché, parce qu'ils font partie de l'interface de chess.com (validé).
- Abandonner demande une confirmation et compte comme une défaite.
- Proposer nulle : l'ordi accepte seulement si au moins 20 coups ont été joués et que la position est équilibrée ou meilleure pour moi selon Stockfish ; sinon il refuse. Une proposition maximum tous les 10 coups.
- L'ordi n'abandonne jamais et ne propose jamais nulle.
- Pas de coups anticipés (premoves).

---

## Feature 3 — Ordinateur adverse

### À implémenter

- L'ordi joue au niveau de mon Elo au moment où la partie commence (200 au départ).
- Stockfish calcule les meilleurs coups de la position ; le BFF choisit ensuite parmi eux, ou parmi les autres coups légaux, avec une part de hasard qui dépend de l'Elo visé. À 200 Elo, l'ordi laisse souvent des pièces en prise, rate des captures gratuites et rate des mats simples ; plus l'Elo monte, plus il choisit les meilleurs coups.
- Délai de réponse de 0,5 à 2 secondes pour que le rythme reste naturel.
- Nom affiché : « Ordi », suivi de son Elo.

### Contraintes

- Le réglage du niveau est une table de paramètres par tranche d'Elo (probabilité de gaffe, profondeur de calcul), dans un seul fichier, pour pouvoir l'ajuster facilement.
- Stockfish seul ne descend pas aussi bas que 200 Elo : c'est la part de hasard qui fait le niveau. Le niveau réel de l'ordi est donc une approximation, à ajuster après quelques parties.
- L'ordi ne joue jamais de coup illégal et répond en moins de 3 secondes.

---

## Feature 4 — Revue de la partie

### À implémenter

- Après chaque partie, le BFF analyse tous les coups avec Stockfish, puis demande à Claude de rédiger les commentaires. Un écran d'attente indique la progression.
- **Résumé de la revue** :
  - précision en % pour moi et pour l'ordi ;
  - tableau du nombre de coups par catégorie, pour moi et pour l'ordi ;
  - courbe d'évaluation de la partie.
- **Catégories de coups** (liste complète de chess.com, avec leur pastille de couleur) : Brillant (!!), Excellent coup (!), Meilleur, Très bon, Bon, Théorique, Imprécision (?!), Erreur (?), Occasion manquée, Gaffe (??).
- **Revue coup par coup** :
  - le plateau rejoue la partie ; boutons précédent / suivant et flèches du clavier ;
  - la pastille de la catégorie s'affiche sur la case d'arrivée du coup ;
  - barre d'évaluation à côté du plateau ;
  - pour un coup qui n'est pas le meilleur, une flèche verte montre le meilleur coup ;
  - **commentaire du tuteur sur chacun de mes coups**, affiché dans une bulle et lu à voix haute en même temps ;
  - les coups de l'ordi sont classés et affichés, mais pas commentés ;
  - boutons pour couper la voix et pour réécouter le commentaire.
- À la fin de la revue, bouton « Voir la leçon ».
- La revue est enregistrée avec la partie.

### Contraintes

- Le classement des coups vient **uniquement de Stockfish** (perte de chances de gain entre le meilleur coup et le coup joué). Claude rédige les commentaires à partir de ces données et ne décide jamais de la catégorie.
- Règles des catégories particulières :
  - Théorique : le coup figure dans une table d'ouvertures embarquée ;
  - Brillant : coup parmi les meilleurs qui sacrifie du matériel ;
  - Excellent coup : seul coup qui garde l'avantage ou qui sauve la position ;
  - Occasion manquée : je ne punis pas une erreur de l'ordi.
- Un seul appel à Claude par partie, qui renvoie tous les commentaires et la leçon dans un format structuré.
- Commentaires courts (1 à 2 phrases), en français, avec tutoiement, adaptés à un niveau débutant.
- Si l'API Claude est indisponible ou si la clé manque, la revue s'affiche quand même, avec des phrases toutes faites à la place des commentaires, et un message le signale.
- La voix se coupe quand je change de coup, et ne démarre jamais pendant une partie.
- Durée d'analyse visée : moins de 30 secondes pour une partie de 40 coups.
- Une partie abandonnée avant mon 5ᵉ coup n'a ni revue ni leçon.

---

## Feature 5 — Leçon de la partie

### À implémenter

- Une seule leçon par partie, choisie par l'ordi : elle porte sur **mon plus mauvais coup**, c'est-à-dire celui qui fait perdre le plus de chances de gain selon Stockfish.
- **Explication** : le plateau montre la position avant mon coup ; le tuteur explique, par écrit et à voix haute, ce que j'ai joué, pourquoi c'est mauvais (la suite qui me punit est rejouée sur le plateau), puis donne un titre à la leçon et **un principe à retenir** en une phrase.
- **Exercice** : la position revient avant mon coup, et je dois trouver moi-même un bon coup.
  - Les coups acceptés sont le meilleur coup de Stockfish et ceux qui sont presque aussi bons.
  - Après un échec, le tuteur donne un indice ; après 3 échecs, il montre la solution.
- La leçon est enregistrée dans le carnet de leçons (feature 7), avec son statut : réussie ou à revoir.
- Après la leçon, retour à l'accueil pour lancer une nouvelle partie.

### Contraintes

- Si je n'ai fait ni imprécision, ni erreur, ni gaffe, la leçon porte quand même sur mon coup le moins précis.
- Si deux coups sont à égalité, c'est le plus ancien dans la partie qui est retenu.
- Le titre, l'explication et le principe sont rédigés par Claude, dans le même appel que les commentaires de la revue. La position, la suite qui punit et les coups acceptés viennent de Stockfish.
- Les indices n'existent que dans l'exercice, jamais pendant une partie.
- Si l'API Claude est indisponible, la leçon s'affiche avec un texte tout fait et l'exercice reste jouable.

---

## Feature 6 — Elo et progression

### À implémenter

- Elo de départ : 200.
- Mise à jour à la fin de chaque partie avec la formule Elo classique, à partir du **résultat seul** : l'ordi ayant mon Elo, une victoire donne **+16**, une nulle **0**, une défaite **−16** (coefficient K = 32).
- La variation est affichée dans la fenêtre de fin de partie.
- Écran **Progression** : courbe de mon Elo partie après partie, Elo actuel, meilleur Elo, nombre de parties, victoires / nulles / défaites.

### Contraintes

- L'Elo ne descend jamais en dessous de 100.
- L'abandon compte comme une défaite.
- L'Elo est mis à jour dès la fin de la partie, que je fasse la revue ou non.
- Pas d'écran d'historique des parties : les parties sont enregistrées, mais seule la courbe est affichée.

---

## Feature 7 — Carnet de leçons

### À implémenter

- Écran **Leçons** : liste des leçons déjà vues, de la plus récente à la plus ancienne, avec pour chacune le titre, le principe à retenir, la date, un aperçu de la position et le statut (réussie / à revoir).
- Ouvrir une leçon permet de relire l'explication et de **refaire l'exercice**.
- Refaire l'exercice met à jour le statut.

### Contraintes

- Les leçons ne sont jamais supprimées ni modifiées.
- Relire une leçon ne refait pas d'appel à Claude : le texte est celui enregistré.

---

## Hors périmètre

Comptes et multi-utilisateurs, jeu contre un humain, pendule, autres thèmes de plateau ou de pièces, historique des parties, export PGN, version mobile, analyse libre d'une position.

## Déploiement local

- Port fixe : **4300** (http://localhost:4300).
- Build de production : le BFF sert le front buildé (un seul processus).
- Scripts à la racine du projet : `build.sh`, `start.sh`, `stop.sh`.
- Clé API : à placer dans `back/.env` (`ANTHROPIC_API_KEY=...`), fichier ignoré par Git.
