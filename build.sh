#!/bin/sh
# Installe les dépendances et construit le front et le BFF pour la production.
set -e
cd "$(dirname "$0")"
(cd back && npm ci && npm run build)
(cd front && npm ci && npm run build)
