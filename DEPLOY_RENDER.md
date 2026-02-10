# Deploy To Render

This project can be deployed on Render as two services (API + Web) using the included `render.yaml` blueprint.

## Prereqs
- A GitHub repo containing this project
- A Render account
- An API key set for either OpenAI or OpenRouter

## Steps
1. Push this repo to GitHub.
2. In Render, create a **Blueprint** from this repo.
3. Render will detect `render.yaml` and create two services:
   - `game-factory-api` (FastAPI)
   - `game-factory-web` (Next.js)
4. Set environment variables:

**API service (`game-factory-api`)**
- `OPENAI_API_KEY` (if using OpenAI)
- `OPENAI_MODEL` (default: `gpt-5.2-codex`)
- `OPENROUTER_API_KEY` (if using OpenRouter)
- `OPENROUTER_MODEL` (default: `moonshotai/kimi-k2.5`)
- `ALLOWED_ORIGINS` = your web URL plus `null`
  - Example: `https://game-factory-web.onrender.com,null`

**Web service (`game-factory-web`)**
- `NEXT_PUBLIC_API_URL` = your API URL
  - Example: `https://game-factory-api.onrender.com`

5. Deploy.

## Notes
- The web service uses `NEXT_PUBLIC_API_URL` at build time. If you change the API URL later, redeploy the web service.
- The API allows CORS only for `ALLOWED_ORIGINS`.
- `null` must be included for iframe `srcdoc` previews.
- The repo pins Python with `runtime.txt`, `.python-version`, and `PYTHON_VERSION` in `render.yaml`. If Render still uses 3.13, force a redeploy after the next commit.

## Troubleshooting
- CORS errors: verify `ALLOWED_ORIGINS` includes the exact web URL and `null`.
- API 500s: confirm your AI key is set and valid.
- Web can’t reach API: confirm `NEXT_PUBLIC_API_URL` points to the API service URL.
