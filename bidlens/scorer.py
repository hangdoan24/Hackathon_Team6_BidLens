"""
Scoring core — the ProposalGuard pipeline.

Two modes, chosen per call:
  live  — GEMINI_API_KEY is set: prompts go to Gemini.
  mock  — no key: answers come from mock/nordframe_reviews.json, and only for the
          four NordFrame sample proposals. Anything else raises ScorerUnavailable
          so the UI can say so instead of pretending.

Ported from ProposalGuard (server.py):
  - retry loop around every Gemini call
  - chunked requirement extraction for RFPs above CHUNK_THRESHOLD
  - requirement classification (HARD_CONSTRAINT / MANDATORY / PREFERENCE / INFORMATIONAL)
    plus per-requirement confidence, used for a backend-computed send-readiness override
  - output-token budget scaled to the number of requirements
  - criterion weights normalised to 100% regardless of what the UI sends
"""
import os
import json
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).parent
MOCK_PATH = ROOT / "mock" / "nordframe_reviews.json"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
MODEL_FALLBACKS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]

CHUNK_THRESHOLD = 30000   # ~15 pages — above this, extract requirements in parallel chunks
CHUNK_SIZE = 15000        # ~7-8 pages per chunk
RETRIES = 2

_client = None
_resolved_model = None

if GEMINI_API_KEY:
    try:
        from google import genai
        _client = genai.Client(api_key=GEMINI_API_KEY)
    except Exception as e:  # SDK missing or broken — behave as mock
        print(f"  [scorer] google-genai unavailable ({e}); running in mock mode")
        _client = None


class ScorerUnavailable(Exception):
    """Raised in mock mode when the document is not part of the NordFrame set."""


def gemini_available():
    return _client is not None


def mode():
    return "live" if gemini_available() else "mock"


DEFAULT_CRITERIA = [
    {"name": "Problem Understanding", "weight": 15, "description": "Does the proposal correctly reflect the client's actual stated problem/goals from the RFP, not a generic pitch?"},
    {"name": "Scope & Deliverables Clarity", "weight": 15, "description": "Are the deliverables specific and unambiguous? Is it clear what is/isn't included?"},
    {"name": "Pricing Clarity", "weight": 15, "description": "Is pricing clearly stated, broken down, and easy to understand vs. vague or 'on request'?"},
    {"name": "Timeline Clarity", "weight": 10, "description": "Are milestones and dates concrete, not vague ('in due course,' 'as soon as possible')?"},
    {"name": "Completeness vs. RFP Requirements", "weight": 20, "description": "Does the proposal address every requirement the RFP explicitly asked for?"},
    {"name": "Tone & Persuasiveness", "weight": 10, "description": "Does it read as confident, client-focused, and professional - not generic boilerplate?"},
    {"name": "Risk/Assumptions Transparency", "weight": 15, "description": "Are assumptions, dependencies, or risks clearly flagged rather than hidden or omitted?"},
]


# ─── Mock store ───

def _load_mock():
    with open(MOCK_PATH, encoding="utf-8") as f:
        return json.load(f)


MOCK = _load_mock()


def normalize(text):
    """Collapse whitespace and strip markdown bold so quotes match across line wraps."""
    return re.sub(r"\s+", " ", (text or "").replace("**", "")).strip()


def find_mock_review(proposal_text):
    """Identify a NordFrame sample by its 'Variant:' fingerprint line."""
    norm = normalize(proposal_text)
    for name, review in MOCK["reviews"].items():
        if review["fingerprint"] in norm:
            return name, review
    return None, None


def mock_review_by_name(name):
    return MOCK["reviews"].get(name)


# ─── Prompts ───

def build_extraction_prompt(rfp_text, criteria=None):
    names = [c["name"] for c in (criteria or DEFAULT_CRITERIA)]
    rubric = "\n".join(f'- "{n}"' for n in names)
    return f"""You are an expert RFP analyst. Extract every explicit requirement from this RFP into a structured list.

For each requirement, identify:
- A short ID (REQ-01, REQ-02, ...)
- The requirement text (what the client is asking for)
- Which section of the RFP it appears in
- Its classification:
  - HARD_CONSTRAINT: explicit, non-negotiable (budget caps, compliance, deadlines, specific technical mandates)
  - MANDATORY: must-have but with some flexibility in how it is met
  - PREFERENCE: nice-to-have, preferred but not required
  - INFORMATIONAL: context or background, not scored

Also identify the client's top priorities — things they emphasize, repeat, or constrain.

Finally, weight the evaluation rubric for THIS RFP. You MUST use exactly these criterion names,
all of them, spelled identically — do not invent, rename, merge or drop any:
{rubric}

Give each a weight of 5-40 (they should total roughly 100) and one sentence of reasoning grounded
in what this RFP emphasises.

Return JSON:
{{
  "requirements": [
    {{"id": "REQ-01", "requirement": "...", "rfp_section": "...", "classification": "HARD_CONSTRAINT|MANDATORY|PREFERENCE|INFORMATIONAL"}}
  ],
  "client_priorities": [
    {{"priority": "...", "evidence": "...", "rfp_section": "..."}}
  ],
  "suggested_weights": [
    {{"criterion": "...", "weight": <5-30>, "reason": "..."}}
  ]
}}

RFP:
{rfp_text}"""


def build_analysis_prompt(rfp_text, proposal_text, requirements_json, criteria):
    criteria_list = "\n".join(
        f'{i+1}. **{c["name"]}** (weight: {c["weight"]}): {c["description"]}'
        for i, c in enumerate(criteria)
    )
    req_context = ""
    if requirements_json:
        req_context = f"""
## Pre-extracted RFP Requirements
The following requirements were extracted from the RFP. Use them as your checklist — verify each one against the proposal.
{json.dumps(requirements_json, indent=2)}
"""
    return f"""You are a senior proposal evaluator conducting an evidence-based audit. Your review must be traceable: every claim you make must cite a specific section from the RFP or Proposal.

## Pipeline
Execute these steps in order:

### Step 1 — Requirement Traceability
For each RFP requirement, search the proposal for evidence. Classify each as:
- COVERED: requirement is fully and specifically addressed
- PARTIAL: mentioned but vague, incomplete, or only partly matching
- MISSING: not addressed anywhere in the proposal
- CONTRADICTED: proposal makes a claim that directly conflicts with this requirement
- UNCERTAIN: cannot determine status from available evidence

For each requirement, also provide:
- classification: carry forward from the extracted requirements (HARD_CONSTRAINT, MANDATORY, PREFERENCE, INFORMATIONAL)
- confidence: 0.0-1.0 how confident you are in the status assessment
- blocking: true if this is a HARD_CONSTRAINT that is CONTRADICTED or MISSING

### Step 2 — Risk & Contradiction Detection
Identify red flags:
- Claims that contradict explicit RFP constraints
- Unrealistic timelines or pricing
- Scope that expands beyond what the RFP asked for
- Hidden dependencies or unstated assumptions
- Vague commitments on items the RFP was specific about

Assign severity to each: CRITICAL, HIGH, MEDIUM, LOW.

### Step 3 — Criteria Scoring (1-5)
Score the proposal on each criterion:
{criteria_list}

Scale: 1 = Not addressed or fundamentally wrong; 2 = Mentioned but vague; 3 = Partially addressed with some specifics; 4 = Well addressed; 5 = Excellent, specific, compelling.

### Step 4 — Send Readiness
- READY: No critical or high issues, coverage > 90%
- REVIEW: Some high issues or coverage 70-90%
- DO_NOT_SEND: Any critical issues, or coverage < 70%

## Evidence Rules
- Every finding MUST include a direct quote or specific section reference from the source document
- If you cannot find evidence for a claim, mark it as UNCERTAIN rather than inventing evidence
- Quote the RFP and Proposal exactly where possible

{req_context}

## Output Format
Return this exact JSON structure:
{{
  "send_readiness": {{"status": "READY|REVIEW|DO_NOT_SEND", "summary": "<1-2 sentence verdict>", "critical_count": <int>, "high_count": <int>, "medium_count": <int>, "coverage_pct": <int 0-100>}},
  "requirement_traceability": [
    {{"id": "<REQ-XX>", "requirement": "<what the RFP asked>", "rfp_section": "<section>",
      "classification": "HARD_CONSTRAINT|MANDATORY|PREFERENCE|INFORMATIONAL",
      "status": "COVERED|PARTIAL|MISSING|CONTRADICTED|UNCERTAIN", "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "confidence": <0.0-1.0>, "blocking": <true|false>,
      "proposal_evidence": {{"section": "<section or null>", "quote": "<exact quote or null>"}},
      "rfp_evidence": {{"quote": "<exact quote from RFP>"}},
      "business_impact": "<why this matters>", "suggested_fix": "<specific fix>"}}
  ],
  "red_flags": [
    {{"issue": "<short title>", "severity": "CRITICAL|HIGH|MEDIUM|LOW", "detail": "<explanation>",
      "rfp_evidence": {{"section": "<RFP section>", "quote": "<exact quote>"}},
      "proposal_evidence": {{"section": "<proposal section>", "quote": "<exact quote>"}},
      "business_impact": "<consequence>", "suggested_fix": "<how to resolve>"}}
  ],
  "criteria_scores": [
    {{"criterion": "<criterion name>", "score": <1-5>, "comment": "<evidence-based explanation>",
      "strengths": ["..."], "weaknesses": ["..."],
      "citations": [{{"source": "rfp|proposal", "section": "<section>", "quote": "<exact quote>"}}],
      "suggested_fixes": ["<actionable fix>"]}}
  ],
  "overall": {{"score": <1.0-5.0>, "verdict": "Strong|Adequate|Needs Work|Weak", "summary": "<2-3 sentence executive summary>"}}
}}

---

## RFP (Client's Request):
{rfp_text}

---

## PROPOSAL (Draft to Evaluate):
{proposal_text}

---

Analyze now. Return ONLY valid JSON."""


def build_suggest_fixes_prompt(rfp_text, proposal_text, analysis):
    findings = json.dumps({
        "red_flags": analysis.get("red_flags", []),
        "traceability": [t for t in analysis.get("requirement_traceability", []) if t.get("status") != "COVERED"],
    }, indent=2)
    return f"""You are a proposal editor producing inline, Grammarly-style fixes.

For each finding below, locate the EXACT sentence or phrase in the PROPOSAL that should change and write a replacement. Rules:
- "original_quote" MUST be a verbatim, contiguous substring of the proposal (copy it exactly; it will be string-matched). Prefer a full sentence or bullet.
- If the fix is a missing section, anchor it: quote the last sentence of the proposal's closing paragraph and put that sentence back at the start of "replacement", followed by the new section(s) in markdown.
- "replacement" must be concrete: numbers, dates, names, roles. It is a suggestion, not a vendor commitment.
- Keep 4-8 fixes, most severe first. Severity: CRITICAL, HIGH, MEDIUM, LOW.

Findings:
{findings}

Return ONLY JSON:
{{"fixes": [
  {{"id": "fix-1", "severity": "CRITICAL", "criterion": "<one of the criteria>", "title": "<short title>",
    "original_quote": "<verbatim substring of the proposal>", "replacement": "<new text>",
    "reason": "<why, citing the RFP>", "rfp_ref": "<RFP section>"}}
]}}

RFP:
{rfp_text}

PROPOSAL:
{proposal_text}"""


def build_quick_score_prompt(rfp_text, proposal_text):
    """Cheap scoring pass for the regression bench. It also has to surface the
    hard-constraint blocker (with both quotes) so the bench can assert on evidence,
    not just on the readiness label."""
    return f"""You are a senior proposal evaluator. Quickly score this proposal against the RFP.

Rate each criterion 1-5: Problem Understanding; Scope & Deliverables Clarity; Pricing Clarity; Timeline Clarity; Completeness vs. RFP Requirements; Tone & Persuasiveness; Risk/Assumptions Transparency.

Then check specifically for a HARD CONSTRAINT breach — an explicit, non-negotiable RFP demand
(budget cap, mandated technology, compliance rule, hard deadline) that the proposal directly
CONTRADICTS. Only report one if the proposal actively conflicts with the constraint; a mere
omission is NOT a contradiction. If there is one, quote both sides verbatim.

Return ONLY this JSON:
{{
  "scores": {{"Problem Understanding": <1-5>, "Scope & Deliverables Clarity": <1-5>, "Pricing Clarity": <1-5>, "Timeline Clarity": <1-5>, "Completeness vs. RFP Requirements": <1-5>, "Tone & Persuasiveness": <1-5>, "Risk/Assumptions Transparency": <1-5>}},
  "send_readiness": "READY|REVIEW|DO_NOT_SEND",
  "coverage_pct": <0-100>, "critical_count": <int>, "high_count": <int>, "medium_count": <int>,
  "has_contradictions": <true|false>,
  "hard_constraint_contradicted": <true|false>,
  "blocker": {{
    "requirement": "<the hard constraint, or null if none>",
    "rfp_quote": "<exact quote from the RFP stating it, or null>",
    "proposal_quote": "<exact quote from the proposal contradicting it, or null>"
  }},
  "overall_score": <1.0-5.0>, "verdict": "Strong|Adequate|Needs Work|Weak"
}}

RFP:
{rfp_text}

Proposal:
{proposal_text}"""


# ─── Gemini call: model fallback + retries ───

def _candidate_models():
    seen, out = set(), []
    for m in [MODEL] + MODEL_FALLBACKS:
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    return out


def _generate(prompt, config):
    """One pass over the model candidates. Returns the response or raises."""
    global _resolved_model
    models = [_resolved_model] if _resolved_model else _candidate_models()
    last_err = None
    for name in models:
        try:
            resp = _client.models.generate_content(model=name, contents=prompt, config=config)
            if name != _resolved_model:
                print(f"  [scorer] using {name}")
                _resolved_model = name
            return resp
        except Exception as e:
            msg = str(e)
            if "NOT_FOUND" in msg or "not found" in msg.lower() or "404" in msg:
                last_err = e
                continue
            if "API_KEY_INVALID" in msg or "API key not valid" in msg:
                raise RuntimeError("Gemini rejected the API key — check GEMINI_API_KEY in .env") from e
            raise
    raise RuntimeError(f"No usable Gemini model among {', '.join(models)}. Last error: {last_err}")


def call_gemini(prompt, max_tokens=8192, temperature=0.3, schema=None, tolerant=False, retries=RETRIES):
    """schema: an OpenAPI-subset dict, which makes Gemini emit structurally valid JSON.
    tolerant: on an unrecoverable parse failure return the raw text instead of raising."""
    if _client is None:
        raise RuntimeError("GEMINI_API_KEY is not set")

    config = {"response_mime_type": "application/json", "temperature": temperature, "max_output_tokens": max_tokens}
    if schema:
        config["response_schema"] = schema

    last_text = ""
    for attempt in range(retries + 1):
        try:
            response = _generate(prompt, config)
            last_text = response.text or ""
            try:
                return json.loads(last_text)
            except json.JSONDecodeError:
                match = re.search(r"\{[\s\S]*\}", last_text)
                if match:
                    try:
                        return json.loads(match.group())
                    except json.JSONDecodeError:
                        pass
                if attempt < retries:
                    print(f"  [scorer] JSON parse failed (attempt {attempt + 1}/{retries + 1}), retrying…")
                    continue
        except RuntimeError:
            raise  # bad key / no model — retrying will not help
        except Exception as e:
            if attempt < retries:
                print(f"  [scorer] Gemini call failed (attempt {attempt + 1}/{retries + 1}): {e}, retrying…")
                continue
            raise

    if tolerant:
        # Usually a hit on max_output_tokens: the JSON is cut mid-string.
        return {"_parse_error": True, "_raw": last_text}
    raise ValueError("Failed to parse AI response as JSON")


# ─── Chunking for large documents ───

def chunk_text(text, chunk_size=CHUNK_SIZE):
    """Split on page/slide markers when the upload provided them, else on blank lines."""
    segments = [s for s in re.split(r'(?=\[Page \d+\]|--- Slide \d+ ---)', text) if s.strip()]

    if len(segments) <= 1:
        chunks, remaining = [], text
        while remaining:
            if len(remaining) <= chunk_size:
                chunks.append(remaining)
                break
            split_at = remaining.rfind("\n\n", 0, chunk_size)
            if split_at == -1 or split_at < chunk_size // 2:
                split_at = remaining.rfind("\n", 0, chunk_size)
            if split_at == -1 or split_at < chunk_size // 2:
                split_at = chunk_size
            chunks.append(remaining[:split_at])
            remaining = remaining[split_at:].lstrip()
        return chunks

    chunks, current = [], ""
    for seg in segments:
        if len(current) + len(seg) > chunk_size and current:
            chunks.append(current)
            current = seg
        else:
            current += seg
    if current:
        chunks.append(current)
    return chunks


def merge_extraction_results(results):
    """De-duplicate requirements across chunks and average the suggested weights."""
    all_reqs, all_priorities = [], []
    weight_sums, weight_counts = {}, {}

    for result in results:
        all_reqs.extend(result.get("requirements", []))
        all_priorities.extend(result.get("client_priorities", []))
        for sw in result.get("suggested_weights", []):
            crit, w = sw.get("criterion", ""), sw.get("weight", 10)
            weight_sums[crit] = weight_sums.get(crit, 0) + w
            weight_counts[crit] = weight_counts.get(crit, 0) + 1

    seen, unique_reqs = set(), []
    for req in all_reqs:
        key = req.get("requirement", "").strip().lower()[:80]
        if key and key not in seen:
            seen.add(key)
            unique_reqs.append(req)
    for i, req in enumerate(unique_reqs, 1):
        req["id"] = f"REQ-{i:02d}"

    suggested_weights = [
        {"criterion": crit, "weight": round(total / weight_counts[crit]), "reason": f"Averaged across {weight_counts[crit]} section(s)"}
        for crit, total in weight_sums.items()
    ]

    seen_p, unique_priorities = set(), []
    for p in all_priorities:
        key = p.get("priority", "").strip().lower()[:60]
        if key and key not in seen_p:
            seen_p.add(key)
            unique_priorities.append(p)

    return {"requirements": unique_reqs, "client_priorities": unique_priorities, "suggested_weights": suggested_weights}


def extract_requirements_chunked(rfp_text, criteria=None):
    if len(rfp_text) <= CHUNK_THRESHOLD:
        return call_gemini(build_extraction_prompt(rfp_text, criteria), max_tokens=4096, temperature=0.2)

    chunks = chunk_text(rfp_text)
    print(f"  [scorer] large RFP — extracting requirements from {len(chunks)} chunks")

    def extract_chunk(idx, chunk):
        prompt = build_extraction_prompt(chunk, criteria).replace(
            "Extract every explicit requirement from this RFP",
            f"Extract every explicit requirement from this section (part {idx + 1}/{len(chunks)}) of a larger RFP",
        )
        return call_gemini(prompt, max_tokens=4096, temperature=0.2)

    results = []
    with ThreadPoolExecutor(max_workers=min(4, len(chunks))) as ex:
        futures = {ex.submit(extract_chunk, i, c): i for i, c in enumerate(chunks)}
        for fut in as_completed(futures):
            try:
                results.append(fut.result())
            except Exception as e:
                print(f"  [scorer] chunk extraction failed: {e}")

    merged = merge_extraction_results(results)
    print(f"  [scorer] {len(merged['requirements'])} unique requirements from {len(chunks)} chunks")
    return merged


# ─── Weighting + readiness (shared by live and mock) ───

def apply_weights(analysis, criteria):
    """Normalise criterion weights to 100% no matter what the UI sent."""
    total_weight = sum(c["weight"] for c in criteria) or 100
    weighted_sum = 0
    for cs in analysis.get("criteria_scores", []):
        match_c = next((c for c in criteria if c["name"] == cs.get("criterion")), None)
        w = match_c["weight"] if match_c else total_weight / max(len(criteria), 1)
        cs["weight"] = round((w / total_weight) * 100, 1)
        cs["weighted_score"] = round((cs["score"] * w) / total_weight, 2)
        weighted_sum += cs["score"] * w
    analysis["weighted_overall"] = round(weighted_sum / total_weight, 2)
    return analysis


def apply_blocker_override(analysis):
    """A contradicted hard constraint forces DO_NOT_SEND, whatever the model concluded."""
    blockers = []
    for req in analysis.get("requirement_traceability", []):
        classification = (req.get("classification") or "").upper()
        status = (req.get("status") or "").upper()
        confidence = req.get("confidence", 0)
        if isinstance(confidence, str):
            try:
                confidence = float(confidence)
            except ValueError:
                confidence = 0
        if classification == "HARD_CONSTRAINT" and status == "CONTRADICTED" and confidence >= 0.7:
            blockers.append({
                "id": req.get("id"),
                "requirement": req.get("requirement"),
                "status": status,
                "confidence": confidence,
                "rfp_evidence": req.get("rfp_evidence"),
                "proposal_evidence": req.get("proposal_evidence"),
            })
            req["blocking"] = True

    sr = analysis.get("send_readiness", {})
    base = sr.get("status", "REVIEW")
    final = "DO_NOT_SEND" if blockers else base
    sr.update({
        "base_readiness": base,
        "final_readiness": final,
        "status": final,
        "blockers": blockers,
        "blocker_override": bool(blockers),
        "weighted_score": analysis.get("weighted_overall", 0),
    })
    if blockers:
        sr["summary"] = f"DO NOT SEND — {len(blockers)} hard constraint(s) contradicted. " + (sr.get("summary") or "")
    analysis["send_readiness"] = sr
    return analysis


# ─── Public API ───

def extract_requirements(rfp_text, criteria=None):
    if gemini_available():
        result = extract_requirements_chunked(rfp_text, criteria)
        result["mode"] = "live"
        return result
    return {
        "requirements": MOCK["requirements"],
        "client_priorities": MOCK["client_priorities"],
        "suggested_weights": MOCK["suggested_weights"],
        "mode": "mock",
    }


def analyze(rfp_text, proposal_text, criteria=None, requirements=None):
    criteria = criteria or DEFAULT_CRITERIA

    if gemini_available():
        if not requirements:
            try:
                requirements = extract_requirements_chunked(rfp_text, criteria).get("requirements", [])
            except Exception:
                requirements = []
        # Give the model more room when there are many requirements to walk through.
        num_reqs = len(requirements or [])
        analysis_tokens = min(16384, max(8192, 8192 + max(0, num_reqs - 15) * 200))
        analysis = call_gemini(build_analysis_prompt(rfp_text, proposal_text, requirements, criteria),
                               max_tokens=analysis_tokens, temperature=0.3)
        analysis = apply_weights(analysis, criteria)
        analysis = apply_blocker_override(analysis)
        analysis["extracted_requirements"] = requirements
        analysis["mode"] = "live"
        analysis["proposal_id"] = None
        return analysis

    name, review = find_mock_review(proposal_text)
    if not review:
        raise ScorerUnavailable(
            "Review Mock only covers the four NordFrame sample proposals. "
            "Set GEMINI_API_KEY in .env to score other documents."
        )
    analysis = json.loads(json.dumps({k: v for k, v in review.items() if k not in ("fingerprint", "label")}))
    analysis = apply_weights(analysis, criteria)
    analysis = apply_blocker_override(analysis)
    analysis["extracted_requirements"] = MOCK["requirements"]
    analysis["mode"] = "mock"
    analysis["proposal_id"] = name
    return analysis


def suggest_fixes(rfp_text, proposal_text, analysis):
    if gemini_available():
        result = call_gemini(build_suggest_fixes_prompt(rfp_text, proposal_text, analysis), max_tokens=6144, temperature=0.2)
        fixes = result.get("fixes", [])
        # Drop anything whose quote is not actually in the proposal — no phantom highlights.
        norm_prop = normalize(proposal_text)
        fixes = [f for f in fixes if f.get("original_quote") and normalize(f["original_quote"]) in norm_prop]
        return {"fixes": fixes, "mode": "live"}

    name, review = find_mock_review(proposal_text)
    if not review:
        raise ScorerUnavailable("Review Mock only covers the NordFrame samples.")
    return {"fixes": review["suggested_fixes"], "mode": "mock", "proposal_id": name}


def quick_score(rfp_text, proposal_text):
    if gemini_available():
        return call_gemini(build_quick_score_prompt(rfp_text, proposal_text), max_tokens=2048, temperature=0.2)

    name, review = find_mock_review(proposal_text)
    if not review:
        raise ScorerUnavailable("Review Mock only covers the NordFrame samples.")
    scores = {cs["criterion"]: cs["score"] for cs in review["criteria_scores"]}
    sr = review["send_readiness"]
    weighted = apply_weights(json.loads(json.dumps(review)), DEFAULT_CRITERIA)["weighted_overall"]
    contradicted = [t for t in review["requirement_traceability"] if t["status"] == "CONTRADICTED"]
    hard = next((t for t in contradicted if (t.get("classification") or "").upper() == "HARD_CONSTRAINT"), None)
    # The frozen fixtures predate the classification field; fall back to severity.
    if hard is None:
        hard = next((t for t in contradicted if t.get("severity") == "CRITICAL"), None)
    blocker = {"requirement": None, "rfp_quote": None, "proposal_quote": None}
    if hard:
        blocker = {
            "requirement": hard.get("requirement"),
            "rfp_quote": (hard.get("rfp_evidence") or {}).get("quote"),
            "proposal_quote": (hard.get("proposal_evidence") or {}).get("quote"),
        }
    return {
        "scores": scores,
        "send_readiness": sr["status"],
        "coverage_pct": sr["coverage_pct"],
        "critical_count": sr["critical_count"],
        "high_count": sr["high_count"],
        "medium_count": sr["medium_count"],
        "has_contradictions": bool(contradicted),
        "hard_constraint_contradicted": hard is not None,
        "blocker": blocker,
        "overall_score": weighted,
        "verdict": review["overall"]["verdict"],
    }


# ─── Regression Test Bench ───
#
# This is a regression bench, not a validation set: it asserts that known-outcome
# fixtures still behave the same after a prompt / model / rubric change. Assertions
# are behavioural (ordering, readiness, blocker evidence) rather than exact scores,
# because an LLM legitimately returns 4.6 one run and 4.4 the next.

BENCH_FIXTURES = [
    ("response_1_weak.md", "Weak"),
    ("response_2_medium.md", "Medium"),
    ("response_3_strong.md", "Strong"),
    ("response_4_overpromise.md", "Overpromise"),
]

# Bands on the unified 0-5.0 scale.
BAND = {"Strong": (4.0, 5.0), "Medium": (2.8, 3.9), "Weak": (0.0, 2.7)}


def _quote_ok(quote, source):
    return bool(quote) and normalize(quote) in normalize(source)


def run_regression(rfp_text, load_fixture):
    """load_fixture(filename) -> proposal text. Returns results + the 8 assertions."""
    results, texts = {}, {}
    for name, label in BENCH_FIXTURES:
        try:
            texts[name] = load_fixture(name)
        except Exception as e:
            results[name] = {"label": label, "error": f"fixture missing: {e}"}

    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(quick_score, rfp_text, t): n for n, t in texts.items()}
        for fut in as_completed(futures):
            name = futures[fut]
            label = dict(BENCH_FIXTURES)[name]
            try:
                r = fut.result()
                r["label"] = label
                results[name] = r
            except Exception as e:
                results[name] = {"label": label, "error": str(e)}

    def g(name, key, default=None):
        return results.get(name, {}).get(key, default)

    weak, med, strong, over = (n for n, _ in BENCH_FIXTURES)
    sw, sm, ss = (g(n, "overall_score", 0) or 0 for n in (weak, med, strong))
    over_blocker = g(over, "blocker") or {}
    med_blocker = g(med, "blocker") or {}

    def readiness_check(name, label, expected):
        actual = g(name, "send_readiness") or "ERROR"
        return {"test": f"{label} readiness", "expected": expected, "actual": actual, "passed": actual == expected}

    ordering_ok = ss > sm > sw
    bands_ok = all(BAND[l][0] <= v <= BAND[l][1] for l, v in (("Strong", ss), ("Medium", sm), ("Weak", sw)))
    evidence_ok = (_quote_ok(over_blocker.get("rfp_quote"), rfp_text)
                   and _quote_ok(over_blocker.get("proposal_quote"), texts.get(over, "")))

    checks = [
        readiness_check(weak, "Weak", "DO_NOT_SEND"),
        readiness_check(med, "Medium", "REVIEW"),
        readiness_check(strong, "Strong", "READY"),
        readiness_check(over, "Overpromise", "DO_NOT_SEND"),
        {"test": "Score ordering", "expected": "Strong > Medium > Weak",
         "actual": f"{ss:.1f} > {sm:.1f} > {sw:.1f}", "passed": ordering_ok},
        {"test": "Score bands", "expected": "S 4.0-5.0 / M 2.8-3.9 / W <= 2.7",
         "actual": f"S {ss:.1f} · M {sm:.1f} · W {sw:.1f}", "passed": bands_ok,
         "soft": True},
        {"test": "Hard constraint detection", "expected": "Yes",
         "actual": "Yes" if g(over, "hard_constraint_contradicted") else "No",
         "passed": bool(g(over, "hard_constraint_contradicted")),
         "detail": over_blocker.get("requirement") or ""},
        {"test": "Blocker evidence present", "expected": "RFP + Proposal quote",
         "actual": ("Both verbatim" if evidence_ok else
                    "Missing" if not (over_blocker.get("rfp_quote") or over_blocker.get("proposal_quote")) else "Not verbatim"),
         "passed": evidence_ok},
        {"test": "No false blocker on Medium", "expected": "None",
         "actual": "None" if not g(med, "hard_constraint_contradicted") else (med_blocker.get("requirement") or "Blocker raised"),
         "passed": not g(med, "hard_constraint_contradicted")},
    ]

    passed = sum(1 for c in checks if c["passed"])
    return {
        "results": results,
        "bench": {
            "checks": checks,
            "passed": passed,
            "total": len(checks),
            "regression": passed < len(checks),
        },
        "mode": mode(),
    }
