# Finova — Trading app

## Backend setup

Install dependencies:

```bash
pip install -r requirements.txt
```

Copy environment template and edit values:

```bash
cp .env.example .env
```

## Run the API locally

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API root: `http://127.0.0.1:8000/`
- Swagger docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`

## Production (Render)

See [DEPLOY.md](./DEPLOY.md). Recommended start command:

```bash
uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}
```

## Frontend (React dashboard)

The Groww-style dashboard UI lives in `frontend/`.

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173/`.

