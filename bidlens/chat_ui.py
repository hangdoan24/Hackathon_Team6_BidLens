"""
Chat routes. The widget itself lives in public/js/chat.js + public/assets/
tender_assistant.svg; this module is the API it talks to.
"""
from flask import Blueprint, request, jsonify

import scorer
import claude_chat

chat_bp = Blueprint("chat", __name__)


@chat_bp.route("/api/chat/status")
def chat_status():
    return jsonify({
        "mode": claude_chat.mode(),
        "engine": claude_chat.engine(),
        "model": claude_chat.engine_model(),
        "label": claude_chat.engine_label(),
    })


@chat_bp.route("/api/mock-review/<name>")
def mock_review(name):
    review = scorer.mock_review_by_name(name)
    if not review:
        return jsonify({"error": "Unknown sample"}), 404
    out = {k: v for k, v in review.items() if k != "fingerprint"}
    out = scorer.apply_weights(out, scorer.DEFAULT_CRITERIA)
    out["extracted_requirements"] = scorer.MOCK["requirements"]
    out["mode"] = "mock"
    out["proposal_id"] = name
    return jsonify(out)


@chat_bp.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    rfp = data.get("rfpText", "")
    proposal = data.get("proposalText", "")
    review = data.get("review")
    proposal_name = data.get("proposalId") or "proposal"
    messages = data.get("messages") or []

    if not rfp or not proposal:
        return jsonify({"error": "rfpText and proposalText are required"}), 400
    if not review:
        # Client did not send its review — try the frozen one for a NordFrame sample.
        _, review = scorer.find_mock_review(proposal)
        if not review:
            return jsonify({"error": "No review available for this proposal. Run the analysis first."}), 400
        review = scorer.apply_weights(dict(review), scorer.DEFAULT_CRITERIA)
    if not messages or messages[-1].get("role") != "user":
        return jsonify({"error": "Last message must be from the user"}), 400

    try:
        result = claude_chat.chat(rfp, proposal, review, proposal_name, messages)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Chat failed: {e}", "mode": claude_chat.mode()}), 500
