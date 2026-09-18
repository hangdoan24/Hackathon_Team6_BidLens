# BidLens

Pre-submission proposal assurance. **Launch Evaluation → Build → Review → ask the Tender Assistant.**
No sign-up: the landing button signs you in as the demo reviewer and goes straight through.

Runs fully local with **no API keys** — the four NordFrame benchmark proposals are scored from a frozen
review set and the assistant answers from that review only. Add keys later and the same UI goes live.

Built for SiviHack 2026 — FPT Software Europe sponsor challenge.

## Run

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:3000 and click **Launch Evaluation**.

## Design

Zinc monochrome with a rose risk accent — Plus Jakarta Sans headlines, Inter body, JetBrains Mono for
figures. All UI copy is English. Everything is scored on one **0–5.0 scale**. Three screens:

1. **Landing** — dark hero, one button, no sign-up.
2. **Build** — upload the baseline RFP and **one or many** proposal drafts (`.md .txt .pdf .docx .pptx`).
   The rubric auto-calibrates to the RFP as soon as it loads; manual weight/add/remove still work.
3. **Review** — scorecard (score /5.0 + grade + status) beside the **7-axis radar** in one top bar,
   disqualification blocker, rubric with collapsible deficiency details, inline diff auditor,
   verdict + top 3 fixes, requirements matrix (with classification and confidence), benchmark.
   The sidebar keeps a **History** of every evaluated draft — click to switch.
   **Export PDF** prints a paginated report; **Reset** undoes every applied inline fix.

## Pipeline (ported from ProposalGuard)

- **Retry loop** — every Gemini call retries twice on a transport error or unparseable JSON.
- **Chunked extraction** — RFPs over 30k chars are split on page/slide markers and extracted in
  parallel, then de-duplicated and re-numbered; suggested weights are averaged across chunks.
- **Requirement classification** — `HARD_CONSTRAINT / MANDATORY / PREFERENCE / INFORMATIONAL`,
  each with a model confidence.
- **Blocker override** — a `HARD_CONSTRAINT` that is `CONTRADICTED` with confidence ≥ 0.7 forces
  `DO_NOT_SEND` on the backend, whatever the model concluded.
- **Token budget** scales with the requirement count (8192 → 16384).
- **Weight normalisation** — criterion weights are normalised to 100% regardless of what the UI sends.
- **Rubric-aware extraction** — the extraction prompt is given the live criterion names so the
  suggested weights map onto the actual rubric instead of invented categories.

## Modes — one key is enough

`.env` has two slots, but **only the first is required**:

```
GEMINI_API_KEY=        # powers BOTH the analysis pipeline and the chat assistant
ANTHROPIC_API_KEY=     # optional — only to move the chat onto Claude instead
```

The assistant picks its engine in this order:

| Keys present | Analysis engine | Assistant engine | Status pill |
|---|---|---|---|
| Gemini only | Gemini | **Gemini** (same key) | `Gemini Live` |
| Gemini + Anthropic | Gemini | Claude | `Claude Live` |
| Anthropic only | Review Mock | Claude | `Claude Live` |
| none | Review Mock | frozen review, no model call | `Review Mock · no AI key` |

Model defaults, each with a fallback chain if the key doesn't grant the first choice:

- Gemini: `gemini-3.8-flash` → `3.6-flash` → `2.5-flash` → `2.0-flash` → `1.5-flash`
- Claude: `claude-sonnet-5` → `claude-opus-5` → `claude-haiku-4-5`

Override with `GEMINI_MODEL=` / `CLAUDE_MODEL=` in `.env` if needed.
`GET /api/health` reports the engine and the model that actually resolved.

Regardless of engine, the review stays immutable and every citation is verified verbatim
server-side — an invented quote is dropped before it reaches the browser.

## Layout

```
app.py                  Flask entry — scorer routes + chat blueprint
scorer.py               Gemini pipeline (extract → analyze → suggest-fixes → quick-score) + mock store
claude_chat.py          Claude client, live/mock switch, verbatim citation check, mock composer
chat_ui.py              /api/chat, /api/chat/status, /api/mock-review/<sample>
CHATBOT_PROMPT.md       Assistant system prompt — the rules the chat must follow
mock/nordframe_reviews.json   Frozen reviews for the 4 samples (scores, trace, flags, inline fixes)
sample-data/            NordFrame RFP + 4 sample proposals
public/
  index.html            1 · Landing (auto sign-in)
  build.html            2 · Build the evaluation
  review.html           3 · Scorecard & rubric
  css/app.css           Zinc design tokens, highlights, fix cards, radar, assistant widget
  js/state.js           localStorage session + helpers
  js/api.js             fetch wrappers
  js/radar.js           7-axis SVG radar
  js/editor.js          Inline auditor (highlight → card → 1-click replace, split diff)
  js/chat.js            Tender Assistant widget
  js/build.js, js/review.js
  assets/tender_assistant.svg
```

## Assistant rules (enforced in prompt and in the mock composer)

- The review is immutable: it explains scores, never re-scores.
- Four labelled layers: RFP requirement · what the proposal commits · reviewer finding · suggested fix
  (framed as a proposal, not a vendor commitment).
- Citations must be verbatim; the server drops any quote it cannot find in the RFP, the proposal (at the
  reviewed version) or the review.
- One thread per `rfp :: proposal :: reviewVersion`, kept in the browser; switching proposals never mixes threads.

## Acceptance check

Sample 1 (Weak) → **"Why the low score?"** → the answer states **1.75 / 5**, Do Not Send, and names
Pricing (1), Timeline (1), Risk/Assumptions (1), Completeness (2 — rollout plan + SLA missing) with
verbatim citations. Switching to Sample 3 (Strong) opens a fresh thread at 4.8 / 5.
