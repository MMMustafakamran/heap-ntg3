#!/usr/bin/env bash
# HARNESS: starts every Antigravity-Angular server on its harness ports (never 3000/8000).
#   8285 Gemini key/model pool (tools/gemini_pool.py; OpenAI as last-resort fallback). backend/.env points
#        google-genai at it with GOOGLE_GEMINI_BASE_URL; keys come from backend/pool.env (local) or CI secrets.
#   8281 Antigravity agent server (backend/agent_server.py: the quickstart's create_antigravity_app,
#        completed by HARNESS; doc: 8000). One AG-UI endpoint per agent at /<name>.
#   8280 Copilot Runtime (frontend/server.ts; doc: 8200)
#   4280 ng serve (doc: 4200)
# Keys: backend/.env (see backend/.env.example) and backend/pool.env (GEMINI_POOL_KEYS, GEMINI_POOL_OPENAI_KEY).
cd "$(dirname "$0")"
mkdir -p logs
: > logs/doc-typecheck.log

POOL_ENV=""; [ -f backend/pool.env ] && POOL_ENV="--env-file pool.env"
(cd backend && PORT=8285 uv run $POOL_ENV --with httpx python ../tools/gemini_pool.py > ../logs/gemini-pool-8285.log 2>&1) &
(cd backend && uv run --env-file .env python agent_server.py > ../logs/backend-8281.log 2>&1) &
echo "waiting for the Antigravity agent server on :8281 ..."
for _ in $(seq 1 90); do
  curl -sf http://localhost:8281/health > /dev/null 2>&1 && break
  sleep 2
done

cd frontend
(npx tsx server.ts > ../logs/runtime-8280.log 2>&1) &
(npm start > ../logs/angular-4280.log 2>&1) &
wait
