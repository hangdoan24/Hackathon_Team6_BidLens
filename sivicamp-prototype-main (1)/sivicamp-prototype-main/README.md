# ProposalGuard

Evidence-based proposal assurance. Paste an RFP and a proposal draft, and the
tool extracts the RFP's requirements, traces each one against the proposal,
flags risks, and scores the draft on weighted criteria.

Built for SiviHack 2026 — FPT Software Europe sponsor challenge.

## Setup

```bash
pip install -r requirements.txt
```

Copy the env template and add your own Gemini API key
(get one free at https://aistudio.google.com/apikey):

```bash
cp .env.example .env
```

```
GEMINI_API_KEY=your_key_here
PORT=3000
GEMINI_MODEL=gemini-3.6-flash   # optional
```

## Run

```bash
python server.py
```

Open http://localhost:3000

Check the wiring at any time with http://localhost:3000/api/health — it
reports whether the key is configured, which model resolved, and which
sample files were found.

## Layout

```
server.py            Flask API + Gemini prompts
public/              Frontend (index.html, app.js, style.css)
sample-data/         NordFrame RFP + 4 sample proposals
requirements.txt     Python dependencies
.env                 Your API key (gitignored)
```

## API

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Config / wiring check |
| `/api/sample-data` | GET | List sample `.md` files |
| `/api/sample-data/<file>` | GET | Read one sample file |
| `/api/upload` | POST | Extract text from an uploaded `.md`, `.txt` or `.pdf` |
| `/api/extract-requirements` | POST | Pull structured requirements + suggested weights from an RFP |
| `/api/analyze` | POST | Full pipeline: traceability, red flags, criteria scores |
| `/api/validate` | POST | Score all 4 sample proposals and run consistency checks |

## Model

`GEMINI_MODEL` (default `gemini-3.6-flash`) is tried first. If that model
isn't available to your key, the server automatically falls back through
`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash` and logs which one
it settled on.
