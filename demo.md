# 30-Min Recruiter 1:1 Demo Script (AI Assistant Project)

## 0. Setup (Before Call)
- Open the Streamlit app: `streamlit run app/app.py`
- Have a saved resume already in the system.
- Have at least one saved job search session with jobs.
- Keep this file open for quick reference.

## 1. 2‑Minute Intro Script (Non‑technical)
“I built a local job‑search assistant that aggregates jobs from multiple sources, saves my searches to a local database, matches jobs to my resume, and lets me ask questions about my search history through a simple AI chat interface. The goal was to keep everything local and lightweight while still getting intelligent insights.”

## 2. Live Demo Flow (5–7 minutes)
1. **Home overview**
   - Point to the hero header and KPI tiles.
   - Say: “This is fully local; no resumes are sent anywhere.”

2. **Search tab**
   - Use the sidebar to run a search.
   - Mention board inputs (Greenhouse/Ashby) if present.
   - Show results cards and open a posting link.
   - Say: “Results are deduped and saved as a session.”

3. **Resume tab**
   - Show latest resume status.
   - If needed, upload and save a resume.
   - Say: “Resume text is stored locally in SQLite.”

4. **Matching tab**
   - Click “Find Top Matches.”
   - Show similarity scores and top results.
   - Toggle debug if asked.
   - Say: “Matching uses TF‑IDF + cosine similarity — no embeddings.”

5. **Agent / Memory tab**
   - Ask: “What companies showed up most?” or “Summarize last session.”
   - If needed, enable tool debug to show tool calls.
   - Say: “The agent is constrained to use database tools for answers.”

## 3. AI Usage Summary (1 minute)
“I used an AI assistant to accelerate implementation and UI refinement. It helped generate the initial agent graph, tool wiring, and UI patterns. I reviewed and adjusted the code for correctness, privacy, and behavior — for example, fixing message handling in the chat flow, improving matching logic, and adding safe environment variable loading.”

## 4. If They Ask About Ownership
- “I can explain any part of the code and how it works.”
- “I made the key decisions: local DB, TF‑IDF matching, and tool‑only agent responses.”

## 5. Common Questions & Quick Answers
- **Why local?** “Privacy and speed — resumes and searches stay on my machine.”
- **Why TF‑IDF?** “Fast, interpretable, and good enough without embeddings.”
- **What’s the AI doing?** “Answering questions by calling tools that read the DB.”
- **What’s next?** “Add more boards, tags, and job status pipeline.”

## 6. Demo Checklist
- [ ] App running locally
- [ ] Resume saved
- [ ] At least one job session saved
- [ ] Memory tab responds to a question
