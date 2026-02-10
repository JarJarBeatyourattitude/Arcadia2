# 🎮 Game Factory

Create, play, and save AI-generated games locally. Fast, fun, and no Docker required.

## What You Get
- AI game generation (OpenRouter)
- Instant in-browser play via live preview
- Local arcade saved in SQLite
- Next.js frontend + FastAPI backend

## Quick Start (One Command)
1. Copy env file and add your OpenRouter or OpenAI key:
```bash
cp .env.example .env
```
2. Run the app:
```bash
npm run dev
```

That’s it. The script installs dependencies, starts the API, and runs the web app.

- Web: `http://localhost:3000`
- API: auto-picks the first free port from `8000-8003`

## Usage
1. Describe your game idea.
2. Click **Generate Game** (you’ll see live build progress).
3. Play in the live preview.
4. Click **Save Game** to store it locally.

## Architecture
- **Frontend:** Next.js App Router
- **Backend:** FastAPI + SQLite
- **AI Provider:** OpenRouter
- **AI Provider (optional):** OpenAI (if `OPENAI_API_KEY` is set it takes priority)

## Notes
- Games are stored in `apps/api/game_factory.db`.
- The API falls back to a built-in demo game if the key is missing.
- Generated games can optionally call `window.GameFactoryAI(prompt)` for live AI interactions.
- For multiplayer, games can call `window.GameFactoryMultiplayer(roomId)` to broadcast messages within a room.
- Optional toolkit: `window.GameFactoryKit` includes utilities (math, input, audio, physics, particles, pseudo-3D, storage, tweening, events, RNG, text, color, sprites, pathfinding, navmesh, level grammars, audio sequencer, UI widgets, ECS, terrain, camera shake, WebGL helper, timers/cooldowns, assets, gamepad, grid, camera2D, metrics, logging, dialogue, timeline).

## Scripts
- `npm run dev` — one-command local dev

## Deploy (Render)
This repo includes `render.yaml` for a two-service deploy (web + api).

1. Push the repo to GitHub.
2. In Render, create a **Blueprint** from this repo.
3. Set env vars:
   - `OPENAI_API_KEY` or `OPENROUTER_API_KEY` on **game-factory-api**
   - `ALLOWED_ORIGINS` on **game-factory-api** to your web URL (e.g. `https://your-web.onrender.com,null`)
   - `NEXT_PUBLIC_API_URL` on **game-factory-web** to your API URL (e.g. `https://your-api.onrender.com`)
4. Deploy.

## Troubleshooting
- If the API can’t read your `.env`, confirm it’s at repo root.
- If you change `NEXT_PUBLIC_API_URL`, restart the dev server.
