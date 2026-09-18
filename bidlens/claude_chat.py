"""
Tender Assistant backend.

One key can power the whole app. The assistant picks its engine in this order:

  1. ANTHROPIC_API_KEY set  -> Claude answers (CHATBOT_PROMPT.md as the system prompt).
  2. else GEMINI_API_KEY set -> Gemini answers, using the scorer's client and the
     same prompt inlined. This is the single-key setup: one organiser key drives
     both the analysis pipeline and the chat.
  3. neither                 -> answers are composed from the frozen review only.
                                No model is called and the UI says so.

Whichever engine answers, the review stays immutable and every citation is
verified verbatim server-side before it reaches the browser.
"""
import os
import re
import json
from pathlib import Path

import scorer  # Gemini client + model fallback live here; reused for the Gemini chat path

ROOT = Path(__file__).parent
PROMPT_PATH = ROOT / "CHATBOT_PROMPT.md"

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5").strip()
# A shared/organiser key may not grant the preferred model; walk this list on "not found".
CLAUDE_FALLBACKS = ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"]
_resolved_model = None
MAX_HISTORY = 8

_client = None
if ANTHROPIC_API_KEY:
    # Anthropic keys are documented to start with "sk-ant-". A key of any other shape
    # (e.g. the Gemini key pasted into both slots) would fail on every call, so skip
    # Claude entirely and let the Gemini engine take over.
    if not ANTHROPIC_API_KEY.startswith("sk-ant-"):
        print("  [chat] ANTHROPIC_API_KEY is not an Anthropic key (expected the sk-ant- prefix)"
              " - ignoring it and using the Gemini engine for chat.")
    else:
        try:
            import anthropic
            _client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        except Exception as e:
            print(f"  [chat] anthropic SDK unavailable ({e}); falling through to the next engine")
            _client = None


def claude_available():
    return _client is not None


def gemini_available():
    return scorer.gemini_available()


def engine():
    """Which backend will answer the next question."""
    if claude_available():
        return "claude"
    if gemini_available():
        return "gemini"
    return "mock"


def engine_model():
    if claude_available():
        return _resolved_model or CLAUDE_MODEL
    if gemini_available():
        return scorer._resolved_model or scorer.MODEL
    return None


def engine_label():
    return {"claude": "Claude Live", "gemini": "Gemini Live"}.get(engine(), "Review Mock · no AI key")


def mode():
    return "mock" if engine() == "mock" else "live"


def system_prompt():
    return PROMPT_PATH.read_text(encoding="utf-8")


# ─── Shared helpers ───

def _dedupe(names):
    seen, out = set(), []
    for n in names:
        if n and n not in seen:
            seen.add(n)
            out.append(n)
    return out


def normalize(text):
    return re.sub(r"\s+", " ", (text or "").replace("**", "")).strip()


def _review_text_pool(review):
    """Every free-text field of the review a citation may legitimately quote."""
    pool = []
    for cs in review.get("criteria_scores", []):
        pool.append(cs.get("comment", ""))
        pool.extend(cs.get("strengths", []) or [])
        pool.extend(cs.get("weaknesses", []) or [])
    for rf in review.get("red_flags", []):
        pool.extend([rf.get("issue", ""), rf.get("detail", ""), rf.get("business_impact", ""), rf.get("suggested_fix", "")])
    for t in review.get("requirement_traceability", []):
        pool.extend([t.get("requirement", ""), t.get("business_impact", ""), t.get("suggested_fix", "")])
    ov = review.get("overall", {})
    pool.append(ov.get("summary", ""))
    pool.append(review.get("send_readiness", {}).get("summary", ""))
    return normalize(" \n ".join(p for p in pool if p))


def verify_citations(citations, rfp, proposal, review):
    """Keep only citations whose quote is a verbatim (whitespace-normalised) substring of its source."""
    sources = {
        "rfp": normalize(rfp),
        "proposal": normalize(proposal),
        "review": _review_text_pool(review),
    }
    kept = []
    for c in citations or []:
        src = (c.get("source") or "").lower()
        q = normalize(c.get("quote", ""))
        if not q or src not in sources:
            continue
        if q in sources[src]:
            kept.append({"source": src, "quote": c.get("quote", "").strip(), "label": c.get("label", "")})
        else:
            kept.append({"source": src, "quote": None, "label": c.get("label", ""), "unverified": True})
    return kept


# ─── Live: Claude ───

def _context_block(rfp, proposal, review, proposal_name):
    slim = {
        "proposal_id": proposal_name,
        "overall": review.get("overall"),
        "weighted_overall": review.get("weighted_overall"),
        "send_readiness": review.get("send_readiness"),
        "criteria_scores": [
            {k: cs.get(k) for k in ("criterion", "score", "weight", "comment", "strengths", "weaknesses", "citations")}
            for cs in review.get("criteria_scores", [])
        ],
        "red_flags": review.get("red_flags"),
        "requirement_traceability": review.get("requirement_traceability"),
        "suggested_fixes": review.get("suggested_fixes"),
    }
    return (
        "<rfp>\n" + rfp + "\n</rfp>\n\n"
        "<proposal>\n" + proposal + "\n</proposal>\n\n"
        "<review>\n" + json.dumps(slim, ensure_ascii=False, indent=1) + "\n</review>"
    )


def chat_live(rfp, proposal, review, proposal_name, messages):
    history = messages[-MAX_HISTORY:]
    # First user turn carries the documents; later turns are plain text.
    convo = []
    for i, m in enumerate(history):
        role = "user" if m.get("role") == "user" else "assistant"
        content = m.get("content", "")
        if i == 0 and role == "user":
            content = _context_block(rfp, proposal, review, proposal_name) + "\n\nReviewer question: " + content
        convo.append({"role": role, "content": content})
    if not convo or convo[0]["role"] != "user":
        convo.insert(0, {"role": "user", "content": _context_block(rfp, proposal, review, proposal_name) + "\n\nReviewer question: (context)"})

    global _resolved_model
    candidates = [_resolved_model] if _resolved_model else _dedupe([CLAUDE_MODEL] + CLAUDE_FALLBACKS)
    resp, last_err = None, None
    for name in candidates:
        try:
            resp = _client.messages.create(
                model=name,
                max_tokens=1200,
                temperature=0.2,
                system=system_prompt(),
                messages=convo,
            )
            if name != _resolved_model:
                print(f"  [chat] using {name}")
                _resolved_model = name
            break
        except Exception as e:
            msg = str(e)
            low = msg.lower()
            if "not_found" in low or "404" in msg or ("model" in low and "does not exist" in low):
                last_err = e
                continue
            if "authentication" in low or "invalid x-api-key" in low or "401" in msg:
                raise RuntimeError(
                    "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env."
                ) from e
            raise

    if resp is None:
        raise RuntimeError(
            f"None of these Claude models were available to this key: {', '.join(candidates)}. "
            f"Set CLAUDE_MODEL in .env to one the key can use. Last error: {last_err}"
        )

    text = "".join(block.text for block in resp.content if getattr(block, "type", "") == "text")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        data = json.loads(m.group()) if m else {"answer": text, "citations": []}
    return {
        "answer": data.get("answer", "").strip(),
        "citations": verify_citations(data.get("citations", []), rfp, proposal, review),
        "mode": "live",
        "engine": "claude",
        "model": _resolved_model or CLAUDE_MODEL,
    }


# ─── Live: Gemini (single-key setup — same key as the analysis pipeline) ───

# Forcing a schema is what keeps Gemini from emitting markdown with unescaped
# quotes inside the JSON string, which used to break parsing on live answers.
def _salvage(raw):
    """Recover the answer from JSON cut off mid-string by the token limit."""
    m = re.search(r'"answer"\s*:\s*"((?:[^"\\]|\\.)*)', raw)
    if not m:
        return {"answer": "The answer came back incomplete - please ask again.", "citations": []}
    # Re-close the string and let json handle every escape sequence properly.
    try:
        text = json.loads('"' + m.group(1) + '"')
    except json.JSONDecodeError:
        text = m.group(1).replace(r"\n", "\n").replace(r"\"", '"')
    return {"answer": text.rstrip() + " …(truncated)", "citations": []}


CHAT_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "citations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source": {"type": "string", "enum": ["rfp", "proposal", "review"]},
                    "quote": {"type": "string"},
                    "label": {"type": "string"},
                },
                "required": ["source", "quote"],
            },
        },
    },
    "required": ["answer", "citations"],
}


def chat_gemini(rfp, proposal, review, proposal_name, messages):
    """Gemini has no separate system slot, so the prompt is inlined ahead of the transcript."""
    history = messages[-MAX_HISTORY:]
    transcript = "\n\n".join(
        f"{'Reviewer' if m.get('role') == 'user' else 'Assistant'}: {m.get('content', '')}"
        for m in history
    )
    prompt = (
        system_prompt()
        + "\n\n---\n\n"
        + _context_block(rfp, proposal, review, proposal_name)
        + "\n\n---\n\n## Conversation so far\n"
        + transcript
        + "\n\nAnswer the reviewer's latest message now. Keep \"answer\" under 180 words and give"
        + " at most 5 citations - it is read in a narrow side panel."
        + " Return ONLY the JSON object described above."
    )
    data = scorer.call_gemini(prompt, max_tokens=4096, temperature=0.2, schema=CHAT_SCHEMA, tolerant=True)
    if not isinstance(data, dict):
        data = {"answer": str(data), "citations": []}
    if data.get("_parse_error"):
        data = _salvage(data.get("_raw", ""))
    return {
        "answer": (data.get("answer") or "").strip(),
        "citations": verify_citations(data.get("citations", []), rfp, proposal, review),
        "mode": "live",
        "engine": "gemini",
        "model": scorer._resolved_model or scorer.MODEL,
    }


# ─── Mock: composed from the frozen review ───

INTENTS = [
    ("why_low",  ["why", "weak", "low", "poor", "bad", "score low", "drag"]),
    ("missing",  ["missing", "gap", "left out", "omit", "absent", "not covered", "what's missing", "whats missing"]),
    ("risk",     ["risk", "red flag", "blocker", "danger", "contradic", "breach"]),
    ("improve",  ["improve", "fix", "better", "raise", "strengthen", "how to", "rewrite"]),
    ("score",    ["score", "criteria", "criterion", "rubric", "weight", "breakdown", "grade"]),
]


def _detect_intent(q):
    ql = q.lower()
    for name, keys in INTENTS:
        if any(k in ql for k in keys):
            return name
    return "summary"


def _fmt_score(review):
    ov = review.get("overall", {})
    w = review.get("weighted_overall", ov.get("score"))
    return f"{w:.2f}".rstrip("0").rstrip(".") if isinstance(w, (int, float)) else str(w)


STATUS_LABEL = {
    "DO_NOT_SEND": "Do Not Send",
    "REVIEW": "Needs Review",
    "READY": "Ready To Send",
}


def chat_mock(rfp, proposal, review, proposal_name, messages):
    """Compose an answer purely from the frozen review. No model is called."""
    question = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    intent = _detect_intent(question)
    status = review.get("send_readiness", {})
    status_label = STATUS_LABEL.get(status.get("status", ""), status.get("status", ""))
    score = _fmt_score(review)
    verdict = review.get("overall", {}).get("verdict", "")
    crits = sorted(review.get("criteria_scores", []), key=lambda c: c.get("score", 0))
    flags = review.get("red_flags", [])
    trace = review.get("requirement_traceability", [])
    fixes = review.get("suggested_fixes", [])

    lines, cites = [], []

    def cite(source, quote, label):
        if quote:
            cites.append({"source": source, "quote": quote, "label": label})

    if intent == "why_low":
        low = [c for c in crits if c.get("score", 5) <= 2] or crits[:3]
        lines.append(
            f"**Reviewer finding:** this draft scored **{score} / 5** ({verdict}) — status **{status_label}**. "
            f"{len(low)} criteria pull the weighted score down:"
        )
        for c in low:
            lines.append(f"• **{c['criterion']}** — {c['score']}/5 (weight {c.get('weight', '')}%): {c.get('comment', '')}")
        lines.append("")
        lines.append("**What the RFP requires** vs **what the proposal commits to**, quoted verbatim below.")
        for c in low[:4]:
            for ct in c.get("citations", [])[:2]:
                cite(ct.get("source", "proposal"), ct.get("quote"), f"{c['criterion']} · {ct.get('section', '')}")
        for rf in flags:
            if rf.get("severity") in ("CRITICAL", "HIGH") and len(cites) < 6:
                pq = (rf.get("proposal_evidence") or {}).get("quote")
                rq = (rf.get("rfp_evidence") or {}).get("quote")
                if pq:
                    cite("proposal", pq, rf.get("issue", ""))
                if rq:
                    cite("rfp", rq, (rf.get("rfp_evidence") or {}).get("section", "RFP"))
        lines.append("")
        lines.append("These scores and comments are the fixed result of the review — I explain them, I don't re-score.")

    elif intent == "missing":
        gaps = [t for t in trace if t.get("status") in ("MISSING", "PARTIAL", "CONTRADICTED")]
        lines.append(
            f"**Reviewer finding:** {len(gaps)} of {len(trace)} RFP requirements are not fully satisfied "
            f"(coverage {status.get('coverage_pct', '?')}%)."
        )
        for t in gaps:
            lines.append(f"• **{t['id']} · {t.get('status')}** — {t.get('requirement', '')} {t.get('business_impact', '')}")
            cite("rfp", (t.get("rfp_evidence") or {}).get("quote"), f"{t['id']} · {t.get('rfp_section', '')}")
            pq = (t.get("proposal_evidence") or {}).get("quote")
            if pq:
                cite("proposal", pq, f"{t['id']} · proposal")
        if not gaps:
            lines.append("No requirement is left open according to this review.")

    elif intent == "risk":
        critical = sum(1 for f in flags if f.get("severity") == "CRITICAL")
        top = [f for f in flags if f.get("severity") in ("CRITICAL", "HIGH")] or flags
        lines.append(f"**Reviewer finding:** {len(flags)} risks flagged, {critical} of them CRITICAL.")
        for f in top:
            lines.append(f"• **[{f.get('severity')}] {f.get('issue')}** — {f.get('detail', '')} Impact: {f.get('business_impact', '')}")
            cite("proposal", (f.get("proposal_evidence") or {}).get("quote"), f.get("issue", ""))
            cite("rfp", (f.get("rfp_evidence") or {}).get("quote"), (f.get("rfp_evidence") or {}).get("section", "RFP"))

    elif intent == "improve":
        lines.append(
            f"**Suggested fixes** — these are the review's proposals, not yet commitments from the vendor. "
            f"Current status: {status_label}, {score} / 5."
        )
        for f in fixes[:5]:
            rep = f.get("replacement", "")
            short = rep[:180] + ("…" if len(rep) > 180 else "")
            lines.append(f"• **[{f.get('severity')}] {f.get('title')}** ({f.get('rfp_ref', '')}): {f.get('reason', '')} → Proposed wording: “{short}”")
            cite("proposal", f.get("original_quote"), f.get("title", ""))
        lines.append("")
        lines.append("Apply them in the Inline Auditor, then hit Re-Evaluate. The current score stays fixed until then.")

    elif intent == "score":
        lines.append(f"**Reviewer finding:** weighted total **{score} / 5** ({verdict}), status {status_label}.")
        for c in review.get("criteria_scores", []):
            lines.append(f"• **{c['criterion']}** — {c['score']}/5 · weight {c.get('weight', '')}%: {c.get('comment', '')}")
        for c in crits[:2]:
            for ct in c.get("citations", [])[:1]:
                cite(ct.get("source", "proposal"), ct.get("quote"), f"{c['criterion']} · {ct.get('section', '')}")

    else:
        lines.append(f"**Reviewer finding:** {review.get('overall', {}).get('summary', '')}")
        lines.append(
            f"Weighted total **{score} / 5** ({verdict}) · status {status_label} · "
            f"coverage {status.get('coverage_pct', '?')}%."
        )
        lines.append("You can ask: *Why the low score?* · *What's missing?* · *Key risks* · *How to improve*.")
        for f in flags[:2]:
            cite("proposal", (f.get("proposal_evidence") or {}).get("quote"), f.get("issue", ""))

    seen, uniq = set(), []
    for c in cites:
        k = (c["source"], normalize(c["quote"]))
        if k not in seen:
            seen.add(k)
            uniq.append(c)

    return {
        "answer": "\n".join(lines).strip(),
        "citations": verify_citations(uniq[:6], rfp, proposal, review),
        "mode": "mock",
        "engine": "mock",
        "model": None,
    }


def chat(rfp, proposal, review, proposal_name, messages):
    """Route to whichever engine this deployment has a key for."""
    which = engine()
    if which == "claude":
        return chat_live(rfp, proposal, review, proposal_name, messages)
    if which == "gemini":
        return chat_gemini(rfp, proposal, review, proposal_name, messages)
    return chat_mock(rfp, proposal, review, proposal_name, messages)
