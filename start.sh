#!/bin/sh
# Lance Chess Coach en arrière-plan sur http://localhost:4300 (le BFF sert aussi le front buildé).
cd "$(dirname "$0")"
if [ -f chess-coach.pid ] && kill -0 "$(cat chess-coach.pid)" 2>/dev/null; then
  echo "Chess Coach déjà lancé sur http://localhost:4300"
  exit 0
fi
[ -f back/dist/server.js ] && [ -f front/dist/index.html ] || ./build.sh
nohup node back/dist/server.js > chess-coach.log 2>&1 &
echo $! > chess-coach.pid
echo "Chess Coach lancé sur http://localhost:4300"
