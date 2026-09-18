# Hackathon Team 6 - BidLens 🔍

**Pre-submission proposal assurance. Launch Evaluation → Build → Review → Ask the Tender Assistant.**

BidLens is a hackathon submission for the **SiviHack 2026 — Proposal Scorer** challenge sponsored by FPT Software Europe. It evaluates B2B proposals against RFPs (Request for Proposals) with evidence-grounded, specific, and actionable feedback.

---

## 🌟 Key Features

- **2-Step AI Pipeline**: Extracts requirements from the RFP first, then performs full cross-referenced analysis.
- **Tender Assistant**: An integrated AI chatbot (powered by Gemini/Claude) that helps explain scores, extract verbatim citations, and suggest actionable fixes without altering the immutable review.
- **Comprehensive Scorecard & Radar**: 7-axis radar chart, criteria scores with detailed evidence, and an overall Send Readiness card (READY / REVIEW / DO_NOT_SEND).
- **Configurable Criteria**: Auto-detects important criteria from the RFP or allows manual adjustment of weights (5-30% per criterion).
- **Multi-Format Support**: Upload `.md`, `.txt`, `.pdf`, `.docx`, and `.pptx` files.
- **Traceability Matrix**: Maps proposal commitments against RFP requirements (Covered, Partial, Missing, Contradicted) with an inline diff auditor.

## 🏗️ Architecture & Tech Stack

- **Backend**: Python (Flask)
- **AI Models**: Google Gemini API (`gemini-3.8-flash` down to `1.5-flash`), Anthropic Claude (fallback/optional).
- **Frontend**: HTML5, CSS3 (Zinc monochrome + Rose risk accent), Vanilla JavaScript.
- **Typography**: Plus Jakarta Sans (Headlines), Inter (Body), JetBrains Mono (Data/Code).
- **Data Extractor**: `python-pptx`, `PyPDF2`, and custom chunked extraction for large RFPs.

## 📂 Project Structure

- `/bidlens/` - Main application backend (Flask entry, Gemini pipeline, Claude chat client).
- `/bidlens-frontend/` - Frontend assets, HTML, CSS, and vanilla JS for charts, state, and UI.
- `/ProposalGuard/` - The original backend pipeline port and session logs.
- `sampledata/` - Included 4 NordFrame benchmark proposals (Weak, Medium, Strong, Overpromise) and the baseline RFP.

## 🚀 How to Run

1. **Install dependencies**:
   ```bash
   cd bidlens
   pip install -r requirements.txt
   ```

2. **Configure API Keys** (Optional for local review mock, required for full analysis):
   Create a `.env` file in the `bidlens` directory:
   ```env
   GEMINI_API_KEY=your_gemini_key_here
   ANTHROPIC_API_KEY=your_optional_claude_key
   ```

3. **Start the server**:
   ```bash
   python app.py
   ```

4. **Access the application**:
   Open [http://localhost:3000](http://localhost:3000) in your browser and click **Launch Evaluation**.

## 🛡️ Assistant Rules & Immutability

BidLens enforces strict rules on the AI Tender Assistant:
- **Immutable Reviews**: The review explains scores, but never re-scores them.
- **Verbatim Citations**: The server verifies every quote. Invented quotes are dropped before reaching the browser.
- **Isolated Threads**: One chat thread per `rfp :: proposal :: reviewVersion`. Switching proposals never mixes context.

## 🏆 Hackathon Details
Built for **SiviHack 2026** by Team 6.
