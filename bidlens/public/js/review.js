(async () => {
  if (!BL.requireUser()) return;
  let S = BL.session();
  if (!S || !S.results || !S.activeId) { location.replace("build.html"); return; }
  const $ = (s) => document.querySelector(s);
  const user = BL.user();
  $("#sb-user").textContent = user.name;
  $("#sb-role").textContent = user.role || "Lead Presales";
  $("#logout").onclick = () => BL.del(BL.KEYS.user);

  // ── Session accessors (multi-proposal) ──
  const cur = () => S.results[S.activeId] || {};
  const curName = () => (S.proposals.find((p) => p.id === S.activeId) || {}).name || "Proposal";

  let health = null;
  try { health = await API.health(); } catch {}
  const scorerMode = (health && health.scorer.mode) || S.mode || "mock";
  $("#mode-text").textContent = scorerMode === "live" ? "AI Evaluator · Gemini live" : "AI Evaluator · Review Mock";
  $("#mode-dot").className = `w-1.5 h-1.5 rounded-full ${scorerMode === "live" ? "bg-emerald-500" : "bg-zinc-400"}`;

  const rfpTitle = () => { const m = (S.rfpText || "").match(/^#\s*(.+)$/m); return m ? m[1].replace(/^Request for Proposal\s*[—-]\s*/i, "").trim() : S.rfpName; };
  const client = () => { const m = (S.rfpText || "").match(/\*\*Client:\*\*\s*([^\n(]+)/); return m ? m[1].trim() : rfpTitle(); };

  // ── Weights panel ──
  let draftWeights = null;
  function renderWeights() {
    draftWeights = draftWeights || S.criteria.map((c) => ({ ...c }));
    $("#weights-grid").innerHTML = draftWeights.map((c, i) => {
      const crucial = c.weight >= 20;
      return `<div class="p-3 rounded-lg ${crucial ? "bg-rose-50/60 border-rose-200" : "bg-zinc-50/70 border-zinc-200"} border flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0"><span class="text-xs font-semibold ${crucial ? "text-rose-950" : "text-zinc-900"} truncate">${String(i + 1).padStart(2, "0")}. ${BL.esc(c.name)}</span>${crucial ? `<span class="px-1.5 rounded text-[9px] font-semibold bg-rose-100 text-rose-800 uppercase shrink-0">Crucial</span>` : ""}</div>
          <span class="font-mono text-xs font-bold ${crucial ? "text-rose-700 border-rose-200" : "text-zinc-900 border-zinc-200"} bg-white px-2 py-0.5 rounded border shrink-0">${c.weight}%</span>
        </div>
        <div class="flex items-center gap-2">
          <input type="range" min="5" max="40" step="5" value="${c.weight}" data-wi="${i}" class="wrng w-full h-1.5 ${crucial ? "bg-rose-200 accent-rose-600" : "bg-zinc-200 accent-zinc-900"} rounded-lg appearance-none cursor-pointer" />
          <span class="text-[10px] font-medium ${crucial ? "text-rose-700" : "text-zinc-500"} shrink-0 w-20 text-right">${crucial ? "High Priority" : c.weight >= 15 ? "Standard" : "Moderate"}</span>
        </div>
      </div>`;
    }).join("");
    const total = draftWeights.reduce((s, c) => s + c.weight, 0);
    const badge = $("#weights-total");
    badge.textContent = `Total: ${total}%`;
    badge.className = `px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${total === 100 ? "bg-zinc-900 text-white" : "bg-amber-100 text-amber-800"}`;
    document.querySelectorAll(".wrng").forEach((el) => (el.oninput = () => { draftWeights[el.dataset.wi].weight = +el.value; renderWeights(); }));
  }
  function toggleWeights(force) {
    const p = $("#weights-panel"), b = $("#weights-btn");
    const open = force !== undefined ? force : p.classList.contains("hidden");
    p.classList.toggle("hidden", !open); p.classList.toggle("flex", open);
    b.setAttribute("aria-expanded", String(open));
    $("#weights-chevron").textContent = open ? "expand_less" : "expand_more";
    b.classList.toggle("bg-zinc-100", open);
    if (open) renderWeights();
  }
  $("#weights-btn").onclick = () => toggleWeights();
  $("#weights-close").onclick = () => toggleWeights(false);
  $("#weights-reset").onclick = () => { draftWeights = null; renderWeights(); };
  $("#weights-apply").onclick = async () => { S.criteria = draftWeights.map((c) => ({ ...c })); toggleWeights(false); await reevaluate(); };

  // ── Main render ──
  function renderAll() {
    const R = cur();
    const a = R.analysis || {}, sr = a.send_readiness || {}, ov = a.overall || {};
    const score = a.weighted_overall ?? ov.score ?? 0;
    const st = BL.status(sr.status);
    const trace = a.requirement_traceability || [];
    const covered = trace.filter((t) => t.status === "COVERED").length;
    const partial = trace.filter((t) => t.status === "PARTIAL").length;
    const missing = trace.filter((t) => ["MISSING", "CONTRADICTED"].includes(t.status)).length;
    const uncertain = trace.filter((t) => t.status === "UNCERTAIN").length;
    const coveragePct = sr.coverage_pct ?? Math.round((covered / Math.max(trace.length, 1)) * 100);
    const flags = a.red_flags || [];
    const crit = flags.filter((f) => f.severity === "CRITICAL");
    const cs = a.criteria_scores || [];

    $("#sb-rfp").textContent = rfpTitle();
    $("#sb-proposal").textContent = curName();
    $("#sb-rfpfile").textContent = S.rfpId && /\.\w+$/.test(S.rfpId) ? S.rfpId : "pasted_rfp.md";
    $("#sb-client").textContent = client();
    $("#hd-client").textContent = client();

    // Scorecard — single 0–5.0 scale everywhere
    $("#hc-score").textContent = BL.score(score);
    $("#hc-grade").textContent = `Grade ${BL.grade(score)}`;
    $("#hc-verdict").textContent = ov.verdict ? `${ov.verdict} · ${coveragePct}% coverage · ${flags.length} flags` : "";
    const stEl = $("#hc-status");
    stEl.className = `inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide border ${st.cls}`;
    stEl.children[0].className = `w-1.5 h-1.5 rounded-full ${st.dot}`;
    stEl.children[1].textContent = sr.status === "DO_NOT_SEND" ? "Disqualification Risk" : st.label;
    $("#hc-title").textContent = `${rfpTitle()} · ${curName()}`;
    $("#hc-summary").textContent = sr.summary || "";
    $("#exec").textContent = ov.summary || "";
    const sub = cs.filter((c) => c.score < 3).length;
    $("#agg-sub").textContent =
      `${sub ? `Sub-threshold on ${sub} of ${cs.length} dimensions. ` : `All ${cs.length} dimensions at or above threshold. `}` +
      `Requirements: ${covered} covered · ${partial} partial · ${missing} open${uncertain ? ` · ${uncertain} uncertain` : ""} of ${trace.length}.`;
    renderRadar($("#radar-box"), cs);

    // Blocker banner — backend override reports the hard constraints it caught
    $("#blocker").hidden = sr.status !== "DO_NOT_SEND";
    $("#blocker-text").textContent = sr.summary || "";
    const blockerItems = (sr.blockers && sr.blockers.length)
      ? sr.blockers.map((b) => `<li class="flex gap-1.5"><span class="material-symbols-outlined text-rose-500 text-[13px] shrink-0 mt-0.5">block</span><span><strong class="font-semibold">${BL.esc(b.id || "")} hard constraint contradicted</strong> — ${BL.esc(b.requirement || "")}</span></li>`)
      : crit.map((f) => `<li class="flex gap-1.5"><span class="material-symbols-outlined text-rose-500 text-[13px] shrink-0 mt-0.5">block</span><span><strong class="font-semibold">${BL.esc(f.issue)}</strong> — ${BL.esc(f.detail)}</span></li>`);
    $("#blocker-list").innerHTML = blockerItems.join("");

    // Rubric
    $("#rb-meta").textContent = `${cs.length} Dimensions · 1.0–5.0`;
    $("#rubric").innerHTML = cs.map((c, i) => {
      const breach = c.score <= 1, low = c.score <= 2;
      const n = String(i + 1).padStart(2, "0");
      const tag = breach ? "Breach" : low ? "Gap" : c.score >= 4.5 ? "Complete" : c.score >= 3.5 ? "Solid" : "Partial";
      const detail = (c.weaknesses && c.weaknesses.length ? c.weaknesses.join(" ") : c.comment) || c.comment;
      return `<div class="bg-white border ${breach ? "border-rose-300 border-l-4 border-l-rose-600" : "border-zinc-200 hover:border-zinc-300"} rounded-lg p-4 transition-colors shadow-sm flex flex-col gap-2.5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono text-xs ${breach ? "font-bold text-rose-700" : "font-semibold text-zinc-400"}">${n}.</span>
              <span class="text-xs font-bold ${breach ? "text-rose-950" : "text-zinc-950"}">${BL.esc(c.criterion)}</span>
              ${breach ? `<span class="px-1.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 uppercase">Breach</span>` : ""}
              <button type="button" data-def="${i}" class="no-print inline-flex items-center gap-1 text-[11px] font-medium ${breach ? "text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border-rose-200" : "text-zinc-500 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 border-zinc-200"} border px-2 py-0.5 rounded transition-colors">
                <span class="material-symbols-outlined text-[14px] ${breach ? "text-rose-600" : "text-zinc-400"}">${breach ? "warning" : "info"}</span>${breach ? "Breach" : "Deficiency"} details<span class="material-symbols-outlined text-[13px] chev">expand_more</span>
              </button>
              <span class="ml-auto font-mono text-[10px] text-zinc-400 shrink-0">w ${c.weight}%</span>
            </div>
          </div>
          <div class="flex items-center gap-3 shrink-0 sm:border-l ${breach ? "sm:border-rose-100" : "sm:border-zinc-100"} sm:pl-4">
            <span class="px-2 py-0.5 rounded text-[10px] font-${breach ? "semibold bg-rose-100 text-rose-800" : "medium bg-zinc-100 text-zinc-700"}">${BL.esc(tag)}</span>
            <div class="flex items-center gap-2">
              <div class="w-14 h-1.5 ${breach ? "bg-rose-100" : "bg-zinc-100"} rounded-full overflow-hidden"><div class="h-full ${breach ? "bg-rose-600" : "bg-zinc-600"} rounded-full" style="width:${(c.score / 5) * 100}%"></div></div>
              <span class="font-mono text-xs ${breach ? "font-bold text-rose-700" : "font-semibold text-zinc-900"} tnum">${Number(c.score).toFixed(1)}</span>
            </div>
          </div>
        </div>
        <div id="def-${i}" class="hidden pt-2 border-t ${breach ? "border-rose-100" : "border-zinc-100"}">
          <div class="${breach ? "bg-rose-50/70 border-rose-200 text-rose-900" : "bg-zinc-50 border-zinc-200/80 text-zinc-600"} rounded border px-3 py-2 text-xs leading-relaxed flex items-start gap-2">
            <span class="font-${breach ? "bold text-rose-950" : "medium text-zinc-800"} text-[11px] uppercase tracking-wide shrink-0">${breach ? "Critical Breach:" : "Deficiency:"}</span><span>${BL.esc(detail)}</span>
          </div>
          ${(c.citations || []).length ? `<div class="mt-2 flex flex-col gap-1.5">${c.citations.map((ct) => `<blockquote class="text-[11.5px] text-zinc-600 border-l-2 ${ct.source === "rfp" ? "border-amber-300" : "border-zinc-300"} pl-2.5 italic">“${BL.esc(ct.quote)}” <span class="not-italic text-[10px] font-mono text-zinc-400">— ${ct.source === "rfp" ? "RFP" : "Proposal"}${ct.section ? " · " + BL.esc(ct.section) : ""}</span></blockquote>`).join("")}</div>` : ""}
        </div>
      </div>`;
    }).join("");
    document.querySelectorAll("[data-def]").forEach((b) => (b.onclick = () => {
      const el = $(`#def-${b.dataset.def}`), chev = b.querySelector(".chev");
      const open = el.classList.contains("hidden");
      el.classList.toggle("hidden", !open);
      chev.textContent = open ? "expand_less" : "expand_more";
    }));

    // Verdict + top fixes
    const ICON = { CRITICAL: ["cancel", "text-rose-600 bg-rose-50"], HIGH: ["warning", "text-amber-700 bg-amber-50"], MEDIUM: ["info", "text-zinc-600 bg-zinc-100"], LOW: ["info", "text-zinc-500 bg-zinc-100"] };
    const ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    const topFlags = [...flags].sort((x, y) => ORDER.indexOf(x.severity) - ORDER.indexOf(y.severity)).slice(0, 3);
    $("#verdict").innerHTML = topFlags.map((f) => { const [ic, cls] = ICON[f.severity] || ICON.LOW;
      return `<div class="bg-zinc-50 border border-zinc-100 rounded-lg p-3 flex gap-2.5"><span class="w-6 h-6 rounded-full ${cls} flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[15px]">${ic}</span></span><div class="min-w-0"><div class="text-[12px] font-semibold text-zinc-950">${BL.esc(f.issue)}</div><div class="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">${BL.esc(f.business_impact || f.detail || "")}</div></div></div>`;
    }).join("") + (sr.status !== "READY" ? `<div class="bg-zinc-50 border border-zinc-100 rounded-lg p-3 flex gap-2.5"><span class="w-6 h-6 rounded-full text-zinc-700 bg-zinc-200 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[15px]">trending_up</span></span><div><div class="text-[12px] font-semibold text-zinc-950">Resubmission target: ${score < 3 ? "3.5" : "4.5"} / 5.0</div><div class="text-[11px] text-zinc-500 mt-0.5">Apply the priority fixes, then re-evaluate.</div></div></div>` : "");
    renderTopFixes();

    // Requirements matrix
    $("#tr-summary").textContent = `${covered} covered · ${partial} partial · ${trace.filter((t) => t.status === "MISSING").length} missing · ${trace.filter((t) => t.status === "CONTRADICTED").length} contradicted${uncertain ? ` · ${uncertain} uncertain` : ""}`;
    const TC = { COVERED: "bg-emerald-100 text-emerald-800", PARTIAL: "bg-amber-100 text-amber-800", MISSING: "bg-rose-50 text-rose-700 border border-rose-200", CONTRADICTED: "bg-rose-100 text-rose-900", UNCERTAIN: "bg-zinc-100 text-zinc-600" };
    const CLS = { HARD_CONSTRAINT: "bg-rose-50 text-rose-700 border-rose-200", MANDATORY: "bg-zinc-100 text-zinc-700 border-zinc-200", PREFERENCE: "bg-zinc-50 text-zinc-500 border-zinc-200", INFORMATIONAL: "bg-zinc-50 text-zinc-400 border-zinc-200" };
    $("#trace-list").innerHTML = trace.map((t) => {
      const conf = typeof t.confidence === "number" ? t.confidence : parseFloat(t.confidence);
      return `<details class="group ${t.blocking ? "bg-rose-50/40" : ""}">
      <summary class="px-6 py-3 flex items-center gap-3 cursor-pointer list-none hover:bg-zinc-50 transition-colors">
        <span class="font-mono text-[11px] font-semibold text-zinc-400 w-14 shrink-0">${BL.esc(t.id)}</span>
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide w-[104px] text-center shrink-0 ${TC[t.status] || "bg-zinc-100 text-zinc-600"}">${BL.esc(t.status)}</span>
        ${t.classification ? `<span class="hidden md:inline px-1.5 py-0.5 rounded text-[9.5px] font-semibold uppercase tracking-wide border shrink-0 ${CLS[t.classification] || "bg-zinc-50 text-zinc-500 border-zinc-200"}">${BL.esc(String(t.classification).replace("_", " "))}</span>` : ""}
        <span class="text-xs text-zinc-800 flex-1 min-w-0 truncate">${BL.esc(t.requirement)}</span>
        ${!isNaN(conf) ? `<span class="text-[10px] font-mono text-zinc-400 hidden sm:inline shrink-0" title="Model confidence">${conf.toFixed(2)}</span>` : ""}
        <span class="material-symbols-outlined text-zinc-300 group-open:rotate-180 transition-transform text-[18px] shrink-0">expand_more</span>
      </summary>
      <div class="px-6 pb-4 pt-1 grid md:grid-cols-2 gap-4 text-[12px] bg-zinc-50/60">
        <div><div class="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">RFP requires</div><blockquote class="border-l-2 border-amber-300 pl-3 text-zinc-700 italic leading-relaxed">${BL.esc((t.rfp_evidence || {}).quote || "—")}</blockquote></div>
        <div><div class="text-[10px] font-bold uppercase tracking-wider text-zinc-700 mb-1">Proposal commits</div><blockquote class="border-l-2 border-zinc-300 pl-3 text-zinc-700 italic leading-relaxed">${(t.proposal_evidence || {}).quote ? BL.esc(t.proposal_evidence.quote) : `<span class="text-zinc-400 not-italic">Not addressed anywhere in the draft</span>`}</blockquote></div>
        <div class="md:col-span-2 text-zinc-600 leading-relaxed"><strong class="text-zinc-900 font-semibold">Impact:</strong> ${BL.esc(t.business_impact || "—")} <strong class="text-zinc-900 font-semibold ml-2">Suggested fix:</strong> ${BL.esc(t.suggested_fix || "—")}</div>
      </div></details>`;
    }).join("");

    // Auditor
    $("#ed-target").textContent = curName();
    Editor.init({
      text: R.text, original: R.originalText || R.text, fixes: R.fixes || [], rfpText: S.rfpText,
      doc: $("#ed-doc"), list: $("#ed-list"), counter: $("#ed-counter"), sugCount: $("#ed-sugcount"), viewBtns: [...document.querySelectorAll(".ed-view")],
      onChange: (text, fx) => { R.text = text; R.fixes = fx; BL.set(BL.KEYS.session, S); renderTopFixes(); },
    });
    renderHistory();
  }

  function renderTopFixes() {
    const ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    const top = [...(cur().fixes || [])].filter((f) => f.status !== "dismissed").sort((x, y) => ORDER.indexOf(x.severity) - ORDER.indexOf(y.severity)).slice(0, 3);
    $("#topfixes").innerHTML = top.map((f, i) => `<li class="flex gap-3">
      <span class="w-5 h-5 rounded-full bg-zinc-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">${i + 1}</span>
      <div class="min-w-0"><div class="text-[12px] font-semibold text-zinc-950 flex items-center gap-2 flex-wrap">${BL.esc(f.title)}${f.status === "accepted" ? `<span class="chip ok">Applied</span>` : ""}</div>
      <div class="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">${BL.esc(f.reason || "")}</div></div></li>`).join("")
      || `<li class="text-[11.5px] text-zinc-400">No outstanding fixes — the draft satisfies every scored dimension.</li>`;
  }

  // ── History (replaces the old document list) ──
  function renderHistory() {
    const items = S.proposals.filter((p) => S.results[p.id]);
    $("#hist-count").textContent = `${items.length}`;
    renderBenchBadge();
    $("#history").innerHTML = items.map((p) => {
      const r = S.results[p.id], a = r.analysis || {};
      const sc = a.weighted_overall ?? (a.overall || {}).score ?? 0;
      const st = (a.send_readiness || {}).status;
      const on = p.id === S.activeId;
      const dot = st === "READY" ? "bg-emerald-500" : st === "REVIEW" ? "bg-amber-400" : "bg-rose-500";
      const when = new Date(r.at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const edits = (r.fixes || []).filter((f) => f.status === "accepted").length;
      return `<button data-hist="${BL.esc(p.id)}" type="button" class="w-full text-left px-3 py-2 rounded-md ${on ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"} flex items-center gap-2 text-xs transition-colors">
        <span class="w-1.5 h-1.5 rounded-full ${dot} shrink-0"></span>
        <span class="flex-1 min-w-0">
          <span class="block truncate ${on ? "font-medium" : ""}">${BL.esc(p.name)}</span>
          <span class="block text-[10px] font-mono ${on ? "text-zinc-400" : "text-zinc-400"}">${when}${r.reviewVersion > 1 ? ` · v${r.reviewVersion}` : ""}${edits ? ` · ${edits} applied` : ""}</span>
        </span>
        <span class="font-mono text-xs shrink-0 ${on ? "font-bold text-zinc-200" : "text-zinc-400"}">${BL.score(sc)}</span>
      </button>`;
    }).join("");
    document.querySelectorAll("[data-hist]").forEach((b) => (b.onclick = () => switchProposal(b.dataset.hist)));
  }

  // The regression run is part of the session history, so it sits with it.
  function renderBenchBadge() {
    const host = $("#history");
    const old = document.querySelector("#hist-bench");
    if (old) old.remove();
    if (!S.bench) return;
    const ok = S.bench.bench.passed === S.bench.bench.total;
    const el = document.createElement("a");
    el.id = "hist-bench";
    el.href = "#benchmark";
    el.className = `mt-2 px-3 py-2 rounded-md border flex items-center gap-2 text-xs transition-colors ${ok ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900" : "border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-900"}`;
    el.innerHTML = `<span class="material-symbols-outlined text-[15px] shrink-0">${ok ? "verified" : "warning"}</span>
      <span class="flex-1 min-w-0"><span class="block font-medium truncate">Regression bench</span>
      <span class="block text-[10px] font-mono opacity-70">${new Date(S.bench.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></span>
      <span class="font-mono text-xs font-bold shrink-0">${S.bench.bench.passed}/${S.bench.bench.total}</span>`;
    host.after(el);
  }

  function switchProposal(id) {
    if (id === S.activeId || !S.results[id]) return;
    S.activeId = id;
    BL.saveSession(S);
    draftWeights = null;
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  // The chat widget switches proposals through this hook.
  window.BidLensSwitchProposal = async (id) => switchProposal(id);
  window.BidLensProposals = () => S.proposals.filter((p) => S.results[p.id]).map((p) => ({ id: p.id, name: p.name }));
  window.BidLensActive = () => S.activeId;

  // ── Re-evaluate ──
  async function reevaluate() {
    const b = $("#btn-reeval"); b.disabled = true;
    const R = cur();
    try {
      const analysis = await API.analyze(S.rfpText, R.text, S.criteria, S.requirements);
      let fixes = [];
      try { fixes = (await API.fixes(S.rfpText, R.text, analysis)).fixes || []; } catch {}
      Object.assign(R, { analysis, fixes, originalText: R.text, reviewVersion: (R.reviewVersion || 1) + 1, at: Date.now() });
      BL.saveSession(S);
      draftWeights = null;
      renderAll();
      BL.toast("Re-evaluated against the current draft", "success");
    } catch (e) { BL.toast(e.message); } finally { b.disabled = false; }
  }
  $("#btn-reeval").onclick = reevaluate;

  // ── Reset: undo every applied fix, restore the original draft ──
  $("#btn-reset").onclick = () => {
    const R = cur();
    const applied = (R.fixes || []).filter((f) => f.status === "accepted").length;
    if (!applied) { BL.toast("Nothing to undo — no fixes applied yet"); return; }
    R.text = R.originalText || R.text;
    R.fixes = (R.fixes || []).map((f) => ({ ...f, status: "open" }));
    BL.saveSession(S);
    renderAll();
    BL.toast(`Reset — ${applied} applied fix${applied > 1 ? "es" : ""} undone`, "success");
  };

  // ── Summary text + PDF export ──
  function summaryText() {
    const R = cur(), a = R.analysis || {}, sr = a.send_readiness || {}, score = a.weighted_overall ?? 0;
    return [
      `BidLens evaluation — ${rfpTitle()} · ${curName()}`,
      `Score ${BL.score(score)} / 5.0 (Grade ${BL.grade(score)}) — ${BL.status(sr.status).label}`,
      `Coverage ${sr.coverage_pct}% · ${sr.critical_count || 0} critical · ${sr.high_count || 0} high · ${sr.medium_count || 0} medium`,
      "", (a.overall || {}).summary || "", "", "Priority fixes:",
      ...(R.fixes || []).slice(0, 3).map((f, i) => `${i + 1}. [${f.severity}] ${f.title} — ${f.reason}`),
    ].join("\n");
  }
  $("#btn-copy").onclick = () => navigator.clipboard.writeText(summaryText()).then(() => BL.toast("Summary copied", "success"), () => BL.toast("Clipboard unavailable"));

  function buildPrintReport() {
    const R = cur(), a = R.analysis || {}, sr = a.send_readiness || {}, ov = a.overall || {};
    const score = a.weighted_overall ?? ov.score ?? 0;
    const cs = a.criteria_scores || [], trace = a.requirement_traceability || [], flags = a.red_flags || [];
    const row = (c) => `<tr><td>${BL.esc(c.criterion)}</td><td class="num">${Number(c.score).toFixed(1)}</td><td class="num">${c.weight}%</td><td>${BL.esc(c.comment || "")}</td></tr>`;
    const treq = (t) => `<tr><td class="num">${BL.esc(t.id)}</td><td>${BL.esc(t.status)}</td><td>${BL.esc(t.classification || "—")}</td><td>${BL.esc(t.requirement)}</td><td>${BL.esc(t.suggested_fix || "—")}</td></tr>`;
    $("#print-report").innerHTML = `
      <div class="pr-head">
        <div><div class="pr-brand">BidLens</div><div class="pr-sub">Pre-submission proposal evaluation</div></div>
        <div class="pr-meta">${new Date().toLocaleString()}<br>${BL.esc(user.name)}</div>
      </div>
      <h1>${BL.esc(rfpTitle())} · ${BL.esc(curName())}</h1>
      <div class="pr-score">
        <div class="pr-big">${BL.score(score)} <span>/ 5.0</span></div>
        <div>
          <div class="pr-status">${BL.esc(BL.status(sr.status).label)} · Grade ${BL.grade(score)} · ${BL.esc(ov.verdict || "")}</div>
          <div class="pr-line">Coverage ${sr.coverage_pct ?? "–"}% · ${sr.critical_count || 0} critical · ${sr.high_count || 0} high · ${sr.medium_count || 0} medium · ${flags.length} flags</div>
        </div>
      </div>
      <p class="pr-summary">${BL.esc(ov.summary || sr.summary || "")}</p>
      ${sr.status === "DO_NOT_SEND" ? `<div class="pr-blocker"><strong>Disqualification blocker</strong><br>${BL.esc(sr.summary || "")}</div>` : ""}
      <h2>Criteria scores</h2>
      <table><thead><tr><th>Criterion</th><th class="num">Score</th><th class="num">Weight</th><th>Reviewer comment</th></tr></thead><tbody>${cs.map(row).join("")}</tbody></table>
      <h2>Priority fixes</h2>
      <ol class="pr-fixes">${(R.fixes || []).slice(0, 5).map((f) => `<li><strong>[${BL.esc(f.severity)}] ${BL.esc(f.title)}</strong><br><span class="pr-reason">${BL.esc(f.reason || "")}</span><br><span class="pr-repl">Suggested: ${BL.esc(f.replacement || "")}</span></li>`).join("") || "<li>No outstanding fixes.</li>"}</ol>
      <h2>Requirements matrix</h2>
      <table><thead><tr><th class="num">ID</th><th>Status</th><th>Class</th><th>Requirement</th><th>Suggested fix</th></tr></thead><tbody>${trace.map(treq).join("")}</tbody></table>
      <div class="pr-foot">Generated by BidLens · scores are advisory, not a vendor commitment</div>`;
  }
  $("#btn-export").onclick = () => {
    buildPrintReport();
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 60);
  };

  $("#btn-inspect").onclick = () => {
    document.querySelectorAll(".rule-pop").forEach((p) => p.remove());
    const pop = document.createElement("div");
    pop.className = "rule-pop no-print";
    pop.innerHTML = `<div class="flex items-center justify-between mb-2"><span class="text-[11px] font-bold uppercase tracking-wider text-zinc-700 font-headline">Baseline RFP · ground truth</span><button class="text-zinc-400 hover:text-zinc-700" data-close><span class="material-symbols-outlined">close</span></button></div><pre>${BL.esc(BL.stripMd(S.rfpText))}</pre>`;
    pop.querySelector("[data-close]").onclick = () => pop.remove();
    document.body.appendChild(pop);
  };

  // ── Regression Test Bench ──
  // Fixture rows link into History: click one to pull that draft in as a full
  // evaluation, so a failed assertion can be inspected instead of just reported.
  const FIXTURES = ["response_1_weak.md", "response_2_medium.md", "response_3_strong.md", "response_4_overpromise.md"];

  function renderBench() {
    const b = S.bench;
    if (!b) return;
    const ok = b.bench.passed === b.bench.total;
    const st = $("#bench-status");
    st.textContent = `${b.bench.passed} / ${b.bench.total} checks passed`;
    st.className = `normal-case tracking-normal font-mono text-[10px] font-semibold rounded px-1.5 py-0.5 ${ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`;

    const rows = b.bench.checks.map((c) => `<tr class="${c.passed ? "" : "bg-rose-50/50"}">
      <td class="px-3 py-2 text-[12px] font-medium text-zinc-900">${BL.esc(c.test)}${c.soft ? `<span class="ml-1.5 text-[9px] font-mono uppercase tracking-wide text-zinc-400">advisory</span>` : ""}</td>
      <td class="px-3 py-2 text-[11.5px] font-mono text-zinc-500">${BL.esc(c.expected)}</td>
      <td class="px-3 py-2 text-[11.5px] font-mono ${c.passed ? "text-zinc-700" : "text-rose-700 font-semibold"}">${BL.esc(c.actual)}${c.detail ? `<div class="text-[10px] text-zinc-400 font-sans mt-0.5 max-w-xs truncate" title="${BL.esc(c.detail)}">${BL.esc(c.detail)}</div>` : ""}</td>
      <td class="px-3 py-2 text-center"><span class="material-symbols-outlined text-[18px] ${c.passed ? "text-emerald-600" : "text-rose-600"}">${c.passed ? "check_circle" : "cancel"}</span></td>
    </tr>`).join("");

    const inHistory = new Set(S.proposals.filter((p) => S.results[p.id]).map((p) => p.name));
    const cards = FIXTURES.map((id) => {
      const r = b.results[id] || {};
      const sc = r.overall_score;
      const loaded = inHistory.has(id);
      const dot = r.send_readiness === "READY" ? "bg-emerald-500" : r.send_readiness === "REVIEW" ? "bg-amber-400" : "bg-rose-500";
      return `<button type="button" data-fixture="${BL.esc(id)}" class="text-left rounded-xl border p-4 transition-colors ${loaded ? "bg-zinc-50 border-zinc-300" : "bg-white border-zinc-200 hover:border-zinc-400"}">
        <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full ${dot} shrink-0"></span>
          <span class="text-[12px] font-semibold truncate">${BL.esc(BL.label(id))}</span>
          <span class="material-symbols-outlined text-[14px] text-zinc-300 ml-auto shrink-0">${loaded ? "task_alt" : "open_in_new"}</span>
        </div>
        <div class="mt-3 flex items-baseline gap-1.5"><span class="font-headline text-[26px] font-bold tnum">${sc != null ? BL.score(sc) : "–"}</span><span class="font-mono text-[10.5px] text-zinc-400">/ 5.0</span></div>
        <div class="mt-1 text-[10px] font-mono uppercase tracking-wide ${r.error ? "text-rose-600" : "text-zinc-400"}">${BL.esc(r.error ? "error" : r.send_readiness || "")}</div>
        <div class="mt-2 text-[10px] text-zinc-400">${loaded ? "In history" : "Open in history"}</div>
      </button>`;
    }).join("");

    $("#bench").innerHTML = `
      <div class="overflow-x-auto border border-zinc-200 rounded-lg">
        <table class="w-full border-collapse">
          <thead><tr class="bg-zinc-50 border-b border-zinc-200">
            <th class="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Test</th>
            <th class="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Expected</th>
            <th class="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actual</th>
            <th class="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">Result</th>
          </tr></thead>
          <tbody class="divide-y divide-zinc-100">${rows}</tbody>
        </table>
      </div>
      <div class="mt-3 flex items-center gap-2 text-[12px] font-semibold ${ok ? "text-emerald-700" : "text-rose-700"}">
        <span class="material-symbols-outlined text-[17px]">${ok ? "verified" : "warning"}</span>
        ${ok ? "No regression — every known behaviour still holds." : `Regression detected — ${b.bench.total - b.bench.passed} assertion(s) changed behaviour.`}
        <span class="ml-auto font-normal font-mono text-[10.5px] text-zinc-400">${b.mode === "mock" ? "Review Mock · " : ""}${new Date(b.at).toLocaleString()}</span>
      </div>
      <div class="mt-5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Fixtures · click to inspect in History</div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">${cards}</div>
      </div>`;
    $("#bench").classList.remove("hidden");
    document.querySelectorAll("[data-fixture]").forEach((el) => (el.onclick = () => openFixture(el.dataset.fixture)));
  }

  async function openFixture(name) {
    const existing = S.proposals.find((p) => p.name === name && S.results[p.id]);
    if (existing) { switchProposal(existing.id); BL.toast(`Switched to ${BL.label(name)}`, "success"); return; }
    BL.toast(`Evaluating ${BL.label(name)} into history…`, "success");
    try {
      const r = await API.benchFixture(name);
      const text = BL.stripMd(r.content);
      const analysis = await API.analyze(S.rfpText, text, S.criteria, S.requirements);
      let fixes = [];
      try { fixes = (await API.fixes(S.rfpText, text, analysis)).fixes || []; } catch {}
      const id = `bench-${name}-${Date.now()}`;
      S.proposals.push({ id, name });
      S.results[id] = { analysis, fixes, text, originalText: text, reviewVersion: 1, at: Date.now() };
      S.activeId = id;
      BL.saveSession(S);
      draftWeights = null;
      renderAll();
      renderBench();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { BL.toast(e.message); }
  }

  $("#btn-validate").onclick = async () => {
    const b = $("#btn-validate"); b.disabled = true;
    const label = b.innerHTML;
    b.innerHTML = '<span class="material-symbols-outlined text-[15px]">hourglass_top</span>Running…';
    try {
      const v = await API.validate(S.rfpText);
      S.bench = { ...v, at: Date.now() };
      BL.saveSession(S);
      renderBench();
      renderHistory();
      const ok = v.bench.passed === v.bench.total;
      BL.toast(ok ? `Regression bench: ${v.bench.passed}/${v.bench.total} passed` : `Regression detected — ${v.bench.total - v.bench.passed} check(s) failed`, ok ? "success" : "error");
    } catch (e) { BL.toast(e.message); } finally { b.disabled = false; b.innerHTML = label; }
  };

  renderAll();
  if (S.bench) renderBench();
})();