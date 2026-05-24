# Deploying the Finova API (Render)

## Production start command

Render sets `PORT` automatically. Use:

```bash
uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}
```

For local production smoke test:

```bash
pip install -r requirements.txt
set ENV=production
set MONGO_URI=mongodb://localhost:27017
set JWT_SECRET_KEY=your-long-random-secret
set VERCEL_FRONTEND_URL=https://your-app.vercel.app
uvicorn main:app --host 0.0.0.0 --port 10000
```

## Required environment variables (production)

| Variable | Description |
|----------|-------------|
| `ENV` | `production` |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET_KEY` | Long random signing secret |
| `VERCEL_FRONTEND_URL` or `CORS_ORIGINS` | Deployed frontend origin(s) |

Copy `.env.example` to `.env` for local development.

## Health & docs

- Health: `GET /health`
- OpenAPI: `GET /docs`
- ReDoc: `GET /redoc`

## Render setup

1. New **Web Service** → connect repo.
2. **Build command:** `pip install -r requirements.txt`
3. **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add env vars from the table above (`CREATE_TEST_USER=false` in production).
5. Optional: use `render.yaml` in this repo as a blueprint.

## Frontend (Vercel)

Set the frontend API base URL to your Render service URL, e.g. `https://finova-api.onrender.com`.

Ensure `VERCEL_FRONTEND_URL` on Render matches your Vercel deployment URL exactly (no trailing slash).

### Deploy exits with status 3 / “No open ports detected”

Common causes:

1. **MongoDB blocks startup** — Atlas must allow Render IPs (`Network Access` → `0.0.0.0/0` or Render’s egress). The API now starts even if Mongo is down; check `/health` for `"database": "connected"`.
2. **Wrong Python version** — Use `runtime.txt` (`python-3.12.10`). In Render dashboard, remove `PYTHON_VERSION` if it overrides `runtime.txt` (e.g. `3.14`).
3. **Missing env** — `MONGO_URI`, `JWT_SECRET_KEY` must be set on Render.

### Sign-in shows “Failed to fetch” / Cannot reach the API

`VITE_API_URL` is correct, but the browser blocks the response when **CORS** is wrong.

On **Render** → your API service → **Environment**, set:

| Variable | Value |
|----------|--------|
| `ENV` | `production` |
| `CORS_ALLOW_VERCEL_PREVIEWS` | `true` |
| `VERCEL_FRONTEND_URL` | Your exact Vercel URL from the browser (e.g. `https://finova-xyz.vercel.app`) — no trailing slash |

Then **Manual Deploy** the API (not just the frontend).

If you use a **custom domain** on Vercel (not `*.vercel.app`), you must set `VERCEL_FRONTEND_URL` or `CORS_ORIGINS` to that domain.
