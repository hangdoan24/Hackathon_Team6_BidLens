// Tender Assistant — floating character + chat panel. Reads the current session, keeps one thread per
// rfp::proposal::reviewVersion, and never calls a model itself: the server decides live vs mock.
(async () => {
  const QUICK = ["Why the low score?", "What's missing?", "Key risks", "How to improve"];
  const svgText = await fetch("assets/tender_assistant.svg").then((r) => r.text()).catch(() => "");
  const svg = svgText.replace(/<\?xml[^>]*>/, "");

  let status = { mode: "mock", engine: "mock", label: "Review Mock · no AI key" };
  try { status = await API.chatStatus(); } catch {}

  const trigger = document.createElement("button");
  trigger.className = "ta-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-label", "Open the tender assistant");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "ta-panel");
  trigger.innerHTML = `${svg}<span class="ta-dot ${status.mode}" aria-hidden="true"></span><span class="ta-label">Ask assistant</span>`;

  const panel = document.createElement("section");
  panel.className = "ta-panel";
  panel.id = "ta-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Tender Assistant");
  panel.innerHTML = `
    <div class="ta-head">
      <div class="avatar" aria-hidden="true">${svg}</div>
      <div><h3>Tender Assistant</h3><p>RFP · Proposal · Review cross-check</p></div>
      <button type="button" data-close aria-label="Close assistant"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="ta-tools">
      <label for="ta-proposal">Proposal</label>
      <select id="ta-proposal"></select>
      <span class="ta-status ${status.mode}" id="ta-status"><i></i>${BL.esc(status.label)}</span>
    </div>
    <div class="ta-stream" id="ta-stream" aria-live="polite"></div>
    <div class="ta-chips" id="ta-chips">${QUICK.map((q) => `<button type="button" data-q="${BL.esc(q)}">${BL.esc(q)}</button>`).join("")}</div>
    <form class="ta-input" id="ta-form">
      <button type="button" class="clear" id="ta-clear" title="Clear conversation" aria-label="Clear conversation"><span class="material-symbols-outlined">delete</span></button>
      <textarea id="ta-text" rows="1" placeholder="Ask about the score, an RFP requirement, or how to fix it…" aria-label="Your question"></textarea>
      <button type="submit" class="send" id="ta-send" aria-label="Send"><span class="material-symbols-outlined">send</span></button>
    </form>`;
  document.body.append(trigger, panel);

  const $ = (s) => panel.querySelector(s);
  const stream = $("#ta-stream"), sel = $("#ta-proposal"), ta = $("#ta-text"), send = $("#ta-send");

  const sess = () => BL.session() || {};
  // Flattened view of the active proposal so the rest of the widget stays unchanged.
  const ctx = () => {
    const s = sess();
    const r = (s.results || {})[s.activeId] || {};
    const p = (s.proposals || []).find((x) => x.id === s.activeId) || {};
    return { rfpId: s.rfpId, rfpText: s.rfpText, proposalId: s.activeId, proposalName: p.name,
             proposalText: r.originalText || r.text, analysis: r.analysis, reviewVersion: r.reviewVersion || 1 };
  };
  const key = () => { const c = ctx(); return `${BL.KEYS.chatPrefix}${c.rfpId || "rfp"}::${c.proposalId || "custom"}::${c.reviewVersion}`; };
  const load = () => BL.get(key()) || [];
  const save = (msgs) => BL.set(key(), msgs);

  const greeting = () => {
    const c = ctx(), a = c.analysis || {};
    const score = a.weighted_overall ?? (a.overall || {}).score;
    if (score == null) return `Hi — run an evaluation first and I can explain the score, the requirements still open, and how to close them.`;
    return `Hi. I'm looking at **${c.proposalName || "this draft"}** — the review graded it **${BL.score(score)} / 5.0** (${BL.status((a.send_readiness || {}).status).label}). I explain the review and quote the sources verbatim; I don't re-score it. What would you like to know?`;
  };

  const SRC_LABEL = { rfp: "RFP", proposal: "Proposal", review: "Review" };
  const bubble = (m) => {
    const cites = (m.citations || []).map((c) => c.quote
      ? `<div class="ta-cite ${c.source}"><span class="src">${SRC_LABEL[c.source] || c.source}${c.label ? " · " + BL.esc(c.label) : ""}</span>“${BL.esc(c.quote)}”</div>`
      : `<div class="ta-cite unverified"><span class="src">${BL.esc(c.label || "")}</span>(no verbatim quote found)</div>`).join("");
    return m.role === "user"
      ? `<div class="ta-msg user"><div class="ta-bubble">${BL.mdLite(m.content)}</div></div>`
      : `<div class="ta-msg bot"><div class="av" aria-hidden="true">${svg}</div><div class="ta-bubble">${BL.mdLite(m.content)}${cites ? `<div class="ta-cites">${cites}</div>` : ""}${m.mode === "mock" ? `<div class="text-[9.5px] text-zinc-400 mt-2 uppercase tracking-wider font-medium">Review Mock · no AI key</div>` : ""}</div></div>`;
  };
  function render() {
    stream.innerHTML = bubble({ role: "assistant", content: greeting() }) + load().map(bubble).join("");
    stream.scrollTop = stream.scrollHeight;
  }
  function renderSelect() {
    const list = typeof window.BidLensProposals === "function" ? window.BidLensProposals() : [];
    const active = typeof window.BidLensActive === "function" ? window.BidLensActive() : null;
    sel.innerHTML = list.map((p) => `<option value="${BL.esc(p.id)}" ${p.id === active ? "selected" : ""}>${BL.esc(p.name)}</option>`).join("")
      || `<option>${BL.esc(ctx().proposalName || "Proposal")}</option>`;
    sel.disabled = list.length < 2;
  }

  let busy = false;
  async function ask(text) {
    const q = (text || "").trim();
    if (!q || busy) return;
    const c = ctx();
    if (!c.rfpText || !c.proposalText) { BL.toast("Run an evaluation first"); return; }
    const msgs = load();
    msgs.push({ role: "user", content: q });
    save(msgs); render();
    ta.value = ""; ta.style.height = "auto"; busy = true; send.disabled = true;
    stream.insertAdjacentHTML("beforeend", `<div class="ta-msg bot" id="ta-typing"><div class="av">${svg}</div><div class="ta-bubble ta-typing"><i></i><i></i><i></i></div></div>`);
    stream.scrollTop = stream.scrollHeight;
    try {
      // Cite against the text the review was produced for, not a draft edited since.
      const res = await API.chat({
        rfpId: c.rfpId, proposalId: c.proposalName, reviewVersion: c.reviewVersion,
        rfpText: c.rfpText, proposalText: c.proposalText, review: c.analysis,
        messages: msgs.map((m) => ({ role: m.role, content: m.content })).slice(-8),
      });
      msgs.push({ role: "assistant", content: res.answer || "(no answer returned)", citations: res.citations || [], mode: res.mode });
      if (res.mode && (res.mode !== status.mode || res.engine !== status.engine)) {
        status.mode = res.mode; status.engine = res.engine;
        const pill = $("#ta-status");
        pill.className = `ta-status ${res.mode}`;
        pill.innerHTML = `<i></i>${BL.esc(res.engine === "claude" ? "Claude Live" : res.engine === "gemini" ? "Gemini Live" : "Review Mock · no AI key")}`;
      }
    } catch (e) {
      msgs.push({ role: "assistant", content: `I couldn't answer that: ${e.message}`, citations: [], mode: status.mode });
    }
    save(msgs); busy = false; send.disabled = false; render();
  }

  const open = (v) => { panel.classList.toggle("open", v); trigger.setAttribute("aria-expanded", String(v)); if (v) { renderSelect(); render(); setTimeout(() => ta.focus(), 50); } };
  trigger.onclick = () => open(!panel.classList.contains("open"));
  $("[data-close]").onclick = () => open(false);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("open")) open(false); });
  $("#ta-form").onsubmit = (e) => { e.preventDefault(); ask(ta.value); };
  ta.onkeydown = (e) => { if ((e.key === "Enter" || e.keyCode === 13) && !e.shiftKey) { e.preventDefault(); ask(ta.value); } };
  ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 96) + "px"; };
  $("#ta-chips").onclick = (e) => { const b = e.target.closest("[data-q]"); if (b) ask(b.dataset.q); };
  $("#ta-clear").onclick = () => { BL.del(key()); render(); };
  sel.onchange = async () => {
    if (typeof window.BidLensSwitchProposal === "function") { sel.disabled = true; await window.BidLensSwitchProposal(sel.value); sel.disabled = false; }
  };
  window.addEventListener("bidlens:session", () => { renderSelect(); render(); });
})();
