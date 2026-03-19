# Job Search Agent

Local job-search workspace with:
- FastAPI backend
- React frontend
- legacy Streamlit UI
- SQLite persistence
- resume matching
- Agent / Helper chat workflows

## Project Layout

- `app/api.py`: FastAPI backend
- `frontend/`: React + Vite frontend
- `app/app.py`: legacy Streamlit UI
- `storage/db.py`: SQLite storage layer
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

Notes:
- `OPENAI_API_KEY` is needed for Agent / Helper chat.
- `TAVILY_API_KEY` is needed only for web-search tool usage.

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
2. Saves jobs and search sessions in `jobs.db`.
3. Stores resumes and extracted resume text.
4. Ranks saved jobs against resumes using TF-IDF.
5. Supports Agent / Helper chat over saved workspace data.

## Notes

- Main local database file: `jobs.db`
- `context.txt` is the persistent Codex handoff file and should be kept updated across sessions
