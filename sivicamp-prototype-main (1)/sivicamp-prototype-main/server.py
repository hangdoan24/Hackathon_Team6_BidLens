import os
import json
import re
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
from google import genai

load_dotenv()

app = Flask(__name__, static_folder="public", static_url_path="")

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
client = genai.Client(api_key=API_KEY) if API_KEY else None

# Preferred model, overridable via .env. If it is not available to this key,
# call_gemini falls back through MODEL_FALLBACKS on the first request.
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash").strip()
MODEL_FALLBACKS = [
    "gemini-3.6-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]
_resolved_model = None

SAMPLE_DIR = Path(__file__).parent / "sample-data"
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

DEFAULT_CRITERIA = [
    {"name": "Problem Understanding", "weight": 15, "description": "Does the proposal correctly reflect the client's actual stated problem/goals from the RFP, not a generic pitch?"},
    {"name": "Scope & Deliverables Clarity", "weight": 15, "description": "Are the deliverables specific and unambiguous? Is it clear what is/isn't included?"},
    {"name": "Pricing Clarity", "weight": 15, "description": "Is pricing clearly stated, broken down, and easy to understand vs. vague or 'on request'?"},
    {"name": "Timeline Clarity", "weight": 10, "description": "Are milestones and dates concrete, not vague ('in due course,' 'as soon as possible')?"},
    {"name": "Completeness vs. RFP Requirements", "weight": 20, "description": "Does the proposal address every requirement the RFP explicitly asked for?"},
    {"name": "Tone & Persuasiveness", "weight": 10, "description": "Does it read as confident, client-focused, and professional - not generic boilerplate?"},
    {"name": "Risk/Assumptions Transparency", "weight": 15, "description": "Are assumptions, dependencies, or risks clearly flagged rather than hidden or omitted?"},
]


# ─── Step 1: Extract structured requirements from RFP ───

def build_extraction_prompt(rfp_text):
    return f"""You are an expert RFP analyst. Extract every explicit requirement from this RFP into a structured list.

For each requirement, identify:
- A short ID (REQ-01, REQ-02, ...)
- The requirement text (what the client is asking for)
- Which section of the RFP it appears in
- Whether it is mandatory or optional
- Its importance: critical, high, or medium

Also identify the client's top priorities — things they emphasize, repeat, or constrain.

Return JSON:
{{
  "requirements": [
    {{
      "id": "REQ-01",
      "requirement": "...",
      "rfp_section": "...",
      "type": "mandatory|optional",
      "importance": "critical|high|medium"
    }}
  ],
  "client_priorities": [
    {{
      "priority": "...",
      "evidence": "...",
      "rfp_section": "..."
    }}
  ],
  "suggested_weights": [
    {{
      "criterion": "...",
      "weight": <5-30>,
      "reason": "..."
    }}
  ]
}}

RFP:
{rfp_text}"""


# ─── Step 2: Full analysis pipeline ───

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

### Step 2 — Risk & Contradiction Detection
Identify red flags:
- Claims that contradict explicit RFP constraints
- Unrealistic timelines or pricing
- Scope that expands beyond what the RFP asked for
- Hidden dependencies or unstated assumptions
- Vague commitments on items the RFP was specific about

Assign severity to each:
- CRITICAL: would likely cause rejection or breach of contract
- HIGH: significant gap that weakens the proposal materially
- MEDIUM: notable issue that should be addressed
- LOW: minor improvement opportunity

### Step 3 — Criteria Scoring (1-5)
Score the proposal on each criterion:
{criteria_list}

Scale:
- 1 = Not addressed or fundamentally wrong
- 2 = Mentioned but vague, incomplete, or generic
- 3 = Partially addressed with some specifics
- 4 = Well addressed with good detail
- 5 = Excellently addressed, specific, and compelling

### Step 4 — Send Readiness
Based on all findings, classify:
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
  "send_readiness": {{
    "status": "READY|REVIEW|DO_NOT_SEND",
    "summary": "<1-2 sentence verdict>",
    "critical_count": <int>,
    "high_count": <int>,
    "medium_count": <int>,
    "coverage_pct": <int 0-100>
  }},
  "requirement_traceability": [
    {{
      "id": "<REQ-XX>",
      "requirement": "<what the RFP asked>",
      "rfp_section": "<section in RFP>",
      "status": "COVERED|PARTIAL|MISSING|CONTRADICTED",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "proposal_evidence": {{
        "section": "<section in proposal or null>",
        "quote": "<exact quote from proposal or null>"
      }},
      "rfp_evidence": {{
        "quote": "<exact quote from RFP>"
      }},
      "business_impact": "<why this matters commercially>",
      "suggested_fix": "<specific, actionable fix>"
    }}
  ],
  "red_flags": [
    {{
      "issue": "<short title>",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "detail": "<explanation>",
      "rfp_evidence": {{
        "section": "<RFP section>",
        "quote": "<exact quote>"
      }},
      "proposal_evidence": {{
        "section": "<proposal section>",
        "quote": "<exact quote>"
      }},
      "business_impact": "<commercial consequence>",
      "suggested_fix": "<how to resolve>"
    }}
  ],
  "criteria_scores": [
    {{
      "criterion": "<criterion name>",
      "score": <1-5>,
      "comment": "<detailed evidence-based explanation>",
      "strengths": ["<specific strength with evidence>"],
      "weaknesses": ["<specific weakness with evidence>"],
      "citations": [
        {{
          "source": "rfp|proposal",
          "section": "<section name>",
          "quote": "<exact quote>"
        }}
      ],
      "suggested_fixes": ["<actionable fix>"]
    }}
  ],
  "overall": {{
    "score": <1.0-5.0>,
    "verdict": "Strong|Adequate|Needs Work|Weak",
    "summary": "<2-3 sentence executive summary>"
  }}
}}

---

## RFP (Client's Request):
{rfp_text}

---

## PROPOSAL (Draft to Evaluate):
{proposal_text}

---

Analyze now. Return ONLY valid JSON."""


def build_quick_score_prompt(rfp_text, proposal_text):
    return f"""You are a senior proposal evaluator. Quickly score this proposal against the RFP.

Rate each criterion 1-5:
1. Problem Understanding — Does the proposal reflect the client's actual stated problem?
2. Scope & Deliverables Clarity — Are deliverables specific and unambiguous?
3. Pricing Clarity — Is pricing clearly stated and broken down?
4. Timeline Clarity — Are milestones and dates concrete?
5. Completeness vs. RFP Requirements — Does it address every RFP requirement?
6. Tone & Persuasiveness — Is it confident, client-focused, professional?
7. Risk/Assumptions Transparency — Are risks and assumptions clearly flagged?

Return ONLY this JSON:
{{{{
  "scores": {{{{
    "Problem Understanding": <1-5>,
    "Scope & Deliverables Clarity": <1-5>,
    "Pricing Clarity": <1-5>,
    "Timeline Clarity": <1-5>,
    "Completeness vs. RFP Requirements": <1-5>,
    "Tone & Persuasiveness": <1-5>,
    "Risk/Assumptions Transparency": <1-5>
  }}}},
  "send_readiness": "READY|REVIEW|DO_NOT_SEND",
  "coverage_pct": <0-100>,
  "critical_count": <int>,
  "high_count": <int>,
  "medium_count": <int>,
  "has_contradictions": <true|false>,
  "overall_score": <1.0-5.0>,
  "verdict": "Strong|Adequate|Needs Work|Weak"
}}}}

RFP:
{rfp_text}

Proposal:
{proposal_text}"""


def _candidate_models():
    """MODEL first, then the fallbacks, without duplicates."""
    seen, out = set(), []
    for m in [MODEL] + MODEL_FALLBACKS:
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    return out


def call_gemini(prompt, max_tokens=8192, temperature=0.3):
    global _resolved_model

    if client is None:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Copy .env.example to .env and put your "
            "key from https://aistudio.google.com/apikey in it."
        )

    config = {
        "response_mime_type": "application/json",
        "temperature": temperature,
        "max_output_tokens": max_tokens,
    }

    models = [_resolved_model] if _resolved_model else _candidate_models()
    last_err = None
    response = None

    for name in models:
        try:
            response = client.models.generate_content(
                model=name, contents=prompt, config=config
            )
            if name != _resolved_model:
                print(f"  [model] using {name}")
                _resolved_model = name
            break
        except Exception as e:
            msg = str(e)
            # Only walk the fallback list for "no such model" errors; a bad key
            # or a quota problem will fail the same way on every model.
            if "NOT_FOUND" in msg or "not found" in msg.lower() or "404" in msg:
                last_err = e
                continue
            if "API_KEY_INVALID" in msg or "API key not valid" in msg:
                raise RuntimeError(
                    "Gemini rejected the API key. Check GEMINI_API_KEY in .env "
                    "— get a fresh one at https://aistudio.google.com/apikey"
                ) from e
            raise

    if response is None:
        raise RuntimeError(
            f"None of these models were available: {', '.join(models)}. "
            f"Set GEMINI_MODEL in .env to one your key can use. Last error: {last_err}"
        )

    text = response.text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            return json.loads(match.group())
        raise ValueError("Failed to parse AI response as JSON")


# ─── Routes ───

@app.route("/")
def index():
    return send_from_directory("public", "index.html")


@app.route("/api/health")
def health():
    return jsonify({
        "ok": bool(API_KEY),
        "api_key_configured": bool(API_KEY),
        "model": _resolved_model or MODEL,
        "sample_data_dir": str(SAMPLE_DIR),
        "sample_files": sorted(f.name for f in SAMPLE_DIR.glob("*.md")) if SAMPLE_DIR.exists() else [],
    })


@app.route("/api/sample-data")
def list_samples():
    if not SAMPLE_DIR.exists():
        return jsonify({"files": []})
    files = [f.name for f in SAMPLE_DIR.iterdir() if f.suffix == ".md"]
    return jsonify({"files": sorted(files)})


@app.route("/api/sample-data/<filename>")
def get_sample(filename):
    filepath = SAMPLE_DIR / Path(filename).name
    if not filepath.exists() or filepath.suffix != ".md":
        return jsonify({"error": "File not found"}), 404
    return jsonify({"content": filepath.read_text(encoding="utf-8")})


@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    ext = Path(file.filename).suffix.lower()
    try:
        if ext == ".pdf":
            from PyPDF2 import PdfReader
            import io
            reader = PdfReader(io.BytesIO(file.read()))
            content = "\n".join(page.extract_text() or "" for page in reader.pages)
        else:
            content = file.read().decode("utf-8")
        return jsonify({"content": content, "filename": file.filename})
    except Exception as e:
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500


@app.route("/api/extract-requirements", methods=["POST"])
def extract_requirements():
    data = request.get_json()
    rfp_text = data.get("rfpText", "")
    if not rfp_text:
        return jsonify({"error": "RFP text is required."}), 400
    try:
        prompt = build_extraction_prompt(rfp_text)
        result = call_gemini(prompt, max_tokens=4096, temperature=0.2)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Extraction failed: {str(e)}"}), 500


@app.route("/api/analyze", methods=["POST"])
def analyze():
    data = request.get_json()
    rfp_text = data.get("rfpText", "")
    proposal_text = data.get("proposalText", "")
    criteria = data.get("criteria", DEFAULT_CRITERIA)
    requirements = data.get("requirements")

    if not rfp_text or not proposal_text:
        return jsonify({"error": "Both RFP and Proposal text are required."}), 400

    try:
        # Step 1: Extract requirements if not provided
        if not requirements:
            try:
                req_prompt = build_extraction_prompt(rfp_text)
                req_result = call_gemini(req_prompt, max_tokens=4096, temperature=0.2)
                requirements = req_result.get("requirements", [])
            except Exception:
                requirements = []

        # Step 2: Full analysis
        prompt = build_analysis_prompt(rfp_text, proposal_text, requirements, criteria)
        analysis = call_gemini(prompt, max_tokens=8192, temperature=0.3)

        # Compute weighted scores
        total_weight = sum(c["weight"] for c in criteria)
        if "criteria_scores" in analysis:
            weighted_sum = 0
            for cs in analysis["criteria_scores"]:
                match_c = next((c for c in criteria if c["name"] == cs.get("criterion")), None)
                w = match_c["weight"] if match_c else total_weight / len(criteria)
                cs["weight"] = w
                cs["weighted_score"] = round((cs["score"] * w) / total_weight, 2)
                weighted_sum += cs["score"] * w
            analysis["weighted_overall"] = round(weighted_sum / total_weight, 2)

        # Attach extracted requirements for frontend
        analysis["extracted_requirements"] = requirements

        return jsonify(analysis)

    except Exception as e:
        print(f"Analysis error: {e}")
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500


@app.route("/api/validate", methods=["POST"])
def validate():
    data = request.get_json()
    rfp_text = data.get("rfpText", "")
    if not rfp_text:
        return jsonify({"error": "RFP text is required."}), 400

    samples = [
        ("response_1_weak.md", "Weak"),
        ("response_2_medium.md", "Medium"),
        ("response_3_strong.md", "Strong"),
        ("response_4_overpromise.md", "Overpromise"),
    ]

    proposals = {}
    for filename, label in samples:
        path = SAMPLE_DIR / filename
        if path.exists():
            proposals[filename] = {"text": path.read_text(encoding="utf-8"), "label": label}

    from concurrent.futures import ThreadPoolExecutor, as_completed

    def score_one(name, proposal_text):
        prompt = build_quick_score_prompt(rfp_text, proposal_text)
        result = call_gemini(prompt, max_tokens=2048, temperature=0.2)
        return name, result

    results = {}
    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {}
            for name, info in proposals.items():
                future = executor.submit(score_one, name, info["text"])
                futures[future] = (name, info["label"])

            for future in as_completed(futures):
                name, label = futures[future]
                try:
                    _, result = future.result()
                    result["label"] = label
                    results[name] = result
                except Exception as e:
                    results[name] = {"label": label, "error": str(e)}
    except Exception as e:
        return jsonify({"error": f"Validation failed: {str(e)}"}), 500

    def get_score(name):
        return results.get(name, {}).get("overall_score", 0)

    weak = get_score("response_1_weak.md")
    medium = get_score("response_2_medium.md")
    strong = get_score("response_3_strong.md")

    checks = [
        {"test": "Strong > Medium", "passed": strong > medium,
         "detail": f"{strong:.1f} vs {medium:.1f}"},
        {"test": "Medium > Weak", "passed": medium > weak,
         "detail": f"{medium:.1f} vs {weak:.1f}"},
        {"test": "Overpromise flagged",
         "passed": results.get("response_4_overpromise.md", {}).get("has_contradictions", False),
         "detail": f"contradictions={results.get('response_4_overpromise.md', {}).get('has_contradictions', 'N/A')}"},
        {"test": "Weak → DO_NOT_SEND",
         "passed": results.get("response_1_weak.md", {}).get("send_readiness") == "DO_NOT_SEND",
         "detail": results.get("response_1_weak.md", {}).get("send_readiness", "N/A")},
        {"test": "Strong → READY/REVIEW",
         "passed": results.get("response_3_strong.md", {}).get("send_readiness") in ("READY", "REVIEW"),
         "detail": results.get("response_3_strong.md", {}).get("send_readiness", "N/A")},
    ]

    return jsonify({
        "results": results,
        "consistency": {
            "checks": checks,
            "passed": sum(1 for c in checks if c["passed"]),
            "total": len(checks),
        },
    })


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    print(f"\n  ProposalGuard running at http://localhost:{port}")
    if not API_KEY:
        print("  [!] GEMINI_API_KEY is not set - the UI loads but analysis will fail.")
        print("      Copy .env.example to .env and add a key from https://aistudio.google.com/apikey")
    if not SAMPLE_DIR.exists() or not any(SAMPLE_DIR.glob("*.md")):
        print(f"  [!] No sample data in {SAMPLE_DIR} - the 'Load sample' dropdowns will be empty.")
    print()
    app.run(host="0.0.0.0", port=port, debug=True)
