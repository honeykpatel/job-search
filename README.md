# Job Search Agent

Local job-search workspace with:
- FastAPI backend
- React frontend
- legacy Streamlit UI
- SQLite or Postgres persistence
- resume matching
- Agent / Helper chat workflows

## Project Layout

- `app/api.py`: FastAPI backend
- `frontend/`: React + Vite frontend
- `app/app.py`: legacy Streamlit UI
- `storage/db.py`: shared storage layer for local SQLite or hosted Postgres
- `memory/`: Agent / Helper tool and graph logic
- `matching/`: TF-IDF resume matching
- `collectors/`: job source collectors

## Requirements

- Python 3.11+
- Node.js 18+ recommended
- npm

## Environment Setup

From the project root:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set values in `.env` for:

- `OPENAI_API_KEY`
- `TAVILY_API_KEY`
- `DATABASE_URL` (optional for local dev, required for Supabase / hosted Postgres)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Notes:
- `OPENAI_API_KEY` is needed for Agent / Helper chat.
- `TAVILY_API_KEY` is needed only for web-search tool usage.
- If `DATABASE_URL` is not set, the app falls back to local SQLite at `jobs.db`.
- If `DATABASE_URL` is set to a Postgres URL, the app uses Postgres instead.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are required for the multi-tenant sign-in flow.

## Run The Main App

Start the backend:

```powershell
.venv\Scripts\python.exe -m uvicorn app.api:app --reload
```

In a second terminal, start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The frontend proxies `/api` requests to:

```text
http://127.0.0.1:8000
```

## Production-style Frontend Build

Build the frontend:

```powershell
cd frontend
npm run build
cd ..
```

Then run the backend:

```powershell
.venv\Scripts\python.exe -m uvicorn app.api:app
```

If `frontend/dist` exists, FastAPI serves the built frontend from:

```text
http://127.0.0.1:8000
```

## Run The Legacy Streamlit UI

If you want the old interface instead of the React frontend:

```powershell
.venv\Scripts\python.exe -m streamlit run app\app.py
```

Open:

```text
http://localhost:8501
```

## What The App Does

1. Collects jobs from supported sources.
2. Saves jobs and search sessions in the configured database.
3. Stores resumes and extracted resume text.
4. Ranks saved jobs against resumes using TF-IDF.
5. Supports Agent / Helper chat over saved workspace data.

## Free Deployment: Supabase + Render

This repo is set up for a free hosted deployment with:

- Supabase Postgres for the live database
- Supabase Auth for email/password sign-in
- Render free web service for the live app
- one Dockerized service that serves both FastAPI and the built React frontend

### 1. Create Supabase Postgres

Create a free Supabase project, then copy the Postgres connection string from the project database settings.

Use a pooled connection string in the form:

```text
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Add that value as `DATABASE_URL`.

### 2. Deploy To Render

This repo includes:

- `Dockerfile`
- `render.yaml`

On Render:

1. Create a new Web Service from this GitHub repo.
2. Use the `main` branch for production.
3. Render will detect `render.yaml` and the Docker runtime.
4. Set these environment variables:
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
   - `TAVILY_API_KEY` (optional if you do not need web search)
5. Add these additional auth env vars:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. Deploy.

The container builds the React frontend and serves it through FastAPI on one public URL.

### 3. Local Dev Versus Hosted

- Local without `DATABASE_URL`: SQLite in `jobs.db`
- Hosted with `DATABASE_URL`: Postgres
- The same app code is used in both cases

## Notes

- Main local database file: `jobs.db` when `DATABASE_URL` is unset
- `context.txt` is the persistent Codex handoff file and should be kept updated across sessions
