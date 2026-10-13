#!/bin/sh
# Arrête Chess Coach lancé par start.sh.
cd "$(dirname "$0")"
if [ -f chess-coach.pid ] && kill "$(cat chess-coach.pid)" 2>/dev/null; then
  echo "Chess Coach arrêté"
else
  echo "Chess Coach n'était pas lancé"
fi
rm -f chess-coach.pid
