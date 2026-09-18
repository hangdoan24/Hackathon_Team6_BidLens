# ProposalGuard — Session Log

## Project Overview

**ProposalGuard** is a hackathon submission for **SiviHack 2026 — Proposal Scorer** challenge sponsored by FPT Software Europe. It evaluates B2B proposals against RFPs with evidence-grounded, specific, actionable feedback.

**Tech Stack:** Python Flask + Google Gemini API (`gemini-3.6-flash`) backend, dark-themed frontend with DM Serif Display + Inter + JetBrains Mono fonts, amber/emerald/coral color system.

---

## Session 1 — Core Build + 7 Improvements

### Core Features Built
- 2-step AI pipeline: Extract requirements from RFP, then full analysis with requirements as context
- Structured JSON output via Gemini `response_mime_type: "application/json"`
- Multi-stage progress bar (3 stages: Extract → Analyze → Report)
- Send Readiness card (READY / REVIEW / DO_NOT_SEND)
- Critical Issues & Risk Findings sections with expandable cards
- Requirement Traceability section
- Criteria Scores with detailed evidence

### 7 Improvements Implemented
1. **SVG Radar Chart** — 7-axis heptagonal chart rendered client-side
2. **SVG Donut Chart** — Coverage percentage visualization
3. **3-Stage Progress** — Animated progress bar with stage indicators
4. **2-Step Pipeline** — Extract requirements first, then cross-reference
5. **Validation Panel ("Evaluate the Evaluator")** — Runs all 4 sample proposals in parallel using `ThreadPoolExecutor(4)`, checks scoring consistency (Strong > Medium > Weak ordering, overpromise detection, readiness classification)
6. **Weighted Scoring** — Criteria weights applied to final score calculation
7. **Evidence-Based Cards** — Each finding shows RFP & Proposal evidence quotes

---

## Session 2 — Configurable Criteria + Traceability Toggle

### Configurable Criteria (Challenge Requirement)
- **Add/Remove criteria** — Users can add custom criteria with name + description, remove any criterion (minimum 1)
- **Weight adjustment** — Sliders (5-30%) per criterion with real-time display
- **Enable/Disable** — Checkboxes to toggle criteria on/off
- **Auto-detect from RFP** — AI reads RFP and suggests which criteria matter most with reasoning (calls `/api/extract-requirements` which returns `suggested_weights` with reasons)
- **AI Suggestions Panel** — Shows each criterion's suggested weight and explanation
- **Reset** — Restores default 7 criteria with original weights

### Traceability Toggle List
- Converted from table to expandable cards (reuses `finding-card` pattern)
- Each requirement shows: ID, status tag, severity badge, requirement text
- Expandable body with RFP evidence, Proposal evidence, business impact, suggested fix
- Summary stats bar: counts by status (covered/partial/missing/contradicted)

### Bug Fix — JS Syntax Error
- **Problem:** `app.js` had 90 Unicode smart quotes (`"` `"` U+201C/U+201D) used as JavaScript string delimiters in the `renderTraceability` function (lines 265-298), causing `SyntaxError: Invalid or unexpected token`
- **Root cause:** The Edit tool introduced smart/curly quotes instead of ASCII double quotes during code generation
- **Fix:** Python script replaced all smart quotes with ASCII `"` in the file

---

## Session 3 — UI Changes + PDF/PPTX Support + Table Layout

### Changes Implemented
1. **PDF/PPTX file support** — Added `.pptx` handling in server upload endpoint using `python-pptx` library. Extracts text from all shapes (text frames + tables) per slide. Also accepts PDF exported from PowerPoint via existing PyPDF2 handler.

2. **Removed "Load Sample" dropdowns** — Removed `<select>` elements from both RFP and Proposal input columns. Only "Upload file" button remains.

3. **Traceability section toggle** — Wrapped entire Requirement Traceability section in a `<details>/<summary>` element so users can collapse/expand the whole section. Summary stats (4 covered, 3 partial, 2 missing) shown inline in the header.

4. **Table layout for Traceability** — Converted from expandable cards to a scrollable table with 8 columns:
   - ID | Status | Severity | Requirement | RFP Evidence | Proposal Evidence | Business Impact | Suggested Fix
   - Long text truncated with vertical scroll per cell
   - Horizontal scroll for the full table
   - Balanced column widths

### API Key Issue
- Original Gemini API key was flagged as "leaked" by Google (likely detected in conversation context or GitHub)
- Key was permanently disabled (403 PERMISSION_DENIED)
- User generated new API key and updated `.env`
- Server restarted to pick up new key — confirmed working

---

## File Structure

```
sivicamp/
├── .env                  # API key (gitignored)
├── .env.example          # Template
├── .gitignore            # Excludes .env, uploads/, __pycache__/, .claude/
├── server.py             # Flask backend (Gemini API, 2-step pipeline, validation)
├── public/
│   ├── index.html        # Main page
│   ├── style.css         # Dark theme styles
│   └── app.js            # Frontend logic (charts, criteria, traceability)
├── sample-data/
│   ├── rfp_nordframe.md
│   ├── response_1_weak.md
│   ├── response_2_medium.md
│   ├── response_3_strong.md
│   └── response_4_overpromise.md
└── Model response/       # Additional proposal drafts
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Serve frontend |
| `/api/sample-data` | GET | List sample files |
| `/api/sample-data/<name>` | GET | Get sample content |
| `/api/upload` | POST | Upload .md/.txt/.pdf/.pptx file |
| `/api/extract-requirements` | POST | Extract RFP requirements + suggest weights |
| `/api/analyze` | POST | Full proposal analysis with scoring |
| `/api/validate` | POST | Run 4 sample proposals for consistency check |

## Key Config

- **Model:** `gemini-3.6-flash`
- **Temperature:** 0.3 (analysis), 0.2 (extraction/validation)
- **Max tokens:** 8192 (analysis), 4096 (extraction), 2048 (validation)
- **Port:** 3000

## GitHub

Repository: https://github.com/datboiii2711/sivicamp-prototype
