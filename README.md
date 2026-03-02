# Job Search Project Note

## What This Project Is

This is a local Python job-search assistant built with **Streamlit**.

It helps you do four things:

1. Search for jobs from a few online sources.
2. Save those search results locally.
3. Upload a resume and compare it to saved jobs.
4. Ask an AI assistant questions about your saved job-search history.

The app stores its data in a local **SQLite** database file called `jobs.db`.

## Main Idea

The project is organized around a simple workflow:

1. You search for jobs.
2. The app collects job postings from supported sources.
3. It saves the search session and matching jobs in SQLite.
4. You upload a resume.
5. The app ranks saved jobs against your resume using TF-IDF similarity.
6. You can ask the memory/agent tab questions about your saved data.

So the project is not just a job board viewer. It is a small local system for:

- collecting jobs
- storing search history
- storing resume text
- ranking jobs against a resume
- using an LLM with tools over your saved data

## Entry Point

The main app starts from:

- `app/app.py`

This file builds the Streamlit UI and wires together all the other modules.

## High-Level Structure

### `app/`

Contains the user interface.

- `app.py`
  - renders the Streamlit app
  - initializes the database
  - runs job searches
  - saves sessions and jobs
  - handles resume upload
  - shows ranked matches
  - runs the memory/agent tab

### `collectors/`

Contains job-source integrations.

- `rss_remoteok.py`
  - fetches RemoteOK jobs using RSS
  - filters results by job title text

- `api_remotive.py`
  - fetches jobs from the Remotive API

- `board_greenhouse.py`
  - fetches jobs from a Greenhouse board
  - accepts either a board URL or slug

- `board_ashby.py`
  - fetches jobs from an Ashby board
  - accepts either a board URL or slug

These modules all return job data in roughly the same dictionary shape, which makes them easy to combine.

### `storage/`

Contains database logic.

- `db.py`
  - creates tables
  - saves search sessions
  - saves job postings
  - links jobs to sessions
  - saves resumes
  - loads saved jobs, sessions, and the latest resume

This is the persistence layer of the project.

### `parsing/`

Handles resume text extraction.

- `resume_text.py`
  - extracts text from PDF files using `pdfplumber`
  - extracts text from DOCX files using `python-docx`

The app stores extracted plain text, not just the raw file.

### `matching/`

Handles resume-to-job ranking.

- `tfidf_ranker.py`
  - turns resume text and job text into TF-IDF vectors
  - uses cosine similarity to score relevance
  - returns top-ranked jobs

This is a lightweight local matching system. It does not use embeddings or a vector database.

### `memory/`

Contains the AI assistant logic.

- `graph.py`
  - creates a LangGraph workflow
  - uses `ChatOpenAI`
  - binds a small set of tools
  - routes tool calls and assistant responses

- `tools.py`
  - exposes local database operations as tools
  - exposes ranking as a tool
  - exposes web search through Tavily as a tool

This is the “agent” part of the app.

### `utils/`

Contains small helper logic.

- `dedupe.py`
  - removes duplicate job postings by URL

## What Happens in the UI

The app has four tabs.

### 1. Job Search

You enter:

- job title
- location
- work style
- number of results

The app then:

1. queries RemoteOK
2. queries Remotive
3. optionally queries Greenhouse
4. optionally queries Ashby
5. interleaves the results
6. removes duplicates
7. saves the session
8. saves the jobs for that session

The sidebar also lets you view previously saved sessions.

### 2. Resume

You upload a PDF or DOCX resume.

The app:

1. extracts text from the file
2. stores the text in the `resumes` table
3. lets you preview the extracted text

Only the extracted text is used later for matching.

### 3. Matching

This tab compares your latest saved resume against recent saved jobs.

The app:

1. loads the latest resume
2. loads recent saved jobs
3. converts them into TF-IDF vectors
4. calculates cosine similarity
5. shows the top matches

This is useful for identifying which saved jobs best align with your resume.

### 4. Agent / Memory

This tab acts like a chat assistant over your local data.

It can answer questions such as:

- what sessions have I saved?
- what jobs were in a session?
- what are the top companies in recent jobs?
- what are my best matches based on my resume?

If you explicitly ask it to find new jobs online, it can also use Tavily web search.

## Database Design

The SQLite database contains four tables:

### `search_sessions`

Stores the search inputs:

- job title
- location
- work style
- result count
- created time

### `job_postings`

Stores unique jobs:

- id
- title
- company
- location
- url
- source
- created time

The job id is derived from a hash of the job URL.

### `session_jobs`

Links sessions to jobs.

This creates a many-to-many style connection between searches and postings.

### `resumes`

Stores:

- filename
- extracted text
- created time

## End-to-End Flow

Here is the full data flow:

1. Streamlit app starts.
2. `init_db()` creates tables if they do not exist.
3. User searches for a role.
4. Collector modules fetch jobs.
5. Results are deduplicated.
6. Search session is saved.
7. Jobs are saved and linked to that session.
8. User uploads a resume.
9. Resume text is extracted and saved.
10. Matching tab ranks saved jobs against the resume.
11. Memory tab lets the LLM call tools against saved data.

## External Services and Libraries

### UI

- `streamlit`

### HTTP and feeds

- `requests`
- `feedparser`

### Resume parsing

- `pdfplumber`
- `python-docx`

### Matching

- `scikit-learn`

### Environment variables

- `python-dotenv`

### AI / agent stack

- `langchain-core`
- `langchain-openai`
- `langgraph`
- `tavily-python`

## Environment Variables

The project expects:

- `OPENAI_API_KEY`
- `TAVILY_API_KEY`

From `.env.example`:

```env
OPENAI_API_KEY=your_openai_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
```

### What each key is for

- `OPENAI_API_KEY`
  - required for the Agent / Memory tab because it uses `ChatOpenAI`

- `TAVILY_API_KEY`
  - required only for web search inside the memory tools

Basic job search, local saving, and resume matching do not fundamentally depend on Tavily.

## How To Run It

From the project root:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install streamlit requests feedparser pdfplumber python-docx scikit-learn python-dotenv langchain-core langchain-openai langgraph tavily-python
Copy-Item .env.example .env
streamlit run app\app.py
```

Then open:

```text
http://localhost:8501
```

## Current Problems in the Repo

The project works conceptually, but the repo setup is incomplete.

### 1. `pyproject.toml` is missing dependencies

It currently lists no runtime packages, even though the code imports many.

### 2. Python version mismatch

- `.python-version` says `3.13`
- `pyproject.toml` requires `>=3.13`
- local machine currently has Python `3.11.4`

So the declared environment and the current environment do not match.

### 3. `README.md` is empty

There is no built-in project documentation yet.

### 4. Some app features depend on external APIs

The memory/agent workflow will not work fully unless API keys are present.

## What Is Good About This Project

- clean folder separation
- simple local persistence
- easy-to-follow data flow
- useful combination of search, matching, and memory
- lightweight matching approach that is easy to understand

## What Could Be Improved

### Project packaging

- add real dependencies to `pyproject.toml`
- make `uv sync` work
- document setup in `README.md`

### Error handling

- collector requests should fail more gracefully in the UI
- the app should handle missing API keys with clearer messages

### Data quality

- collectors currently save limited job metadata
- descriptions are mostly missing, which weakens matching quality

### Matching quality

- TF-IDF is simple and fast, but not very semantic
- matching could improve if job descriptions were stored
- embeddings could later replace or complement TF-IDF

### Database structure

- foreign keys are not enforced
- session/job relationship could be made more explicit

## If You Want To Think About It Simply

You can think of the project as three layers:

### Layer 1: Data collection

Collectors fetch job postings from the web.

### Layer 2: Local memory

SQLite stores sessions, jobs, and resumes.

### Layer 3: Intelligence

The app ranks jobs against a resume and lets an LLM answer questions using tools over saved data.

## Short Summary

This project is a local Streamlit job-search assistant with:

- job aggregation
- local session storage
- resume parsing
- TF-IDF job matching
- an LLM-powered memory assistant

The architecture is straightforward and practical. The main missing piece is proper project setup and dependency management.