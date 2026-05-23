# FastAPI starter

## Setup

Install dependencies:

```bash
pip install -r requirements.txt
```

## Run the server (uvicorn)

```bash
uvicorn main:app --workers 4
```

Then open `http://127.0.0.1:8000/`.

## Frontend (React dashboard)

The Groww-style dashboard UI lives in `frontend/`.

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173/`.

