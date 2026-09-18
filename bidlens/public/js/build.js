(async () => {
  if (!BL.requireUser()) return;
  const $ = (s) => document.querySelector(s);
  const user = BL.user();
  $("#user-name").textContent = user.name;
  $("#user-role").textContent = user.role || "Lead Presales";

  const DEFAULT_CRITERIA = [
    { name: "Problem Understanding", weight: 15, description: "Does the proposal correctly reflect the client's actual stated problem and goals from the RFP?" },
    { name: "Scope & Deliverables Clarity", weight: 15, description: "Are the deliverables specific and unambiguous?" },
    { name: "Pricing Clarity", weight: 15, description: "Is pricing clearly stated, broken down and easy to compare?" },
    { name: "Timeline Clarity", weight: 10, description: "Are milestones and dates concrete?" },
    { name: "Completeness vs. RFP Requirements", weight: 20, description: "Does the proposal address every requirement the RFP asked for?" },
    { name: "Tone & Persuasiveness", weight: 10, description: "Does it read as confident, client-focused and professional?" },
    { name: "Risk/Assumptions Transparency", weight: 15, description: "Are assumptions, dependencies or risks clearly flagged?" },
  ];
  const withDefaults = (c) => ({ enabled: true, ...c });
  let criteria = DEFAULT_CRITERIA.map(withDefaults);
  let proposals = [];          // [{ id, name, text }]
  let rfpName = "";
  let requirements = null;     // cached from the auto-detect pass
  let mode = "mock";
  let autoKey = "";            // RFP fingerprint the current calibration belongs to

  try {
    const h = await API.health();
    mode = h.scorer.mode;
    $("#mode-text").textContent = mode === "live" ? "Gemini live" : "Review Mock · benchmark set";
    $("#mode-dot").className = `w-1.5 h-1.5 rounded-full ${mode === "live" ? "bg-emerald-500" : "bg-zinc-400"}`;
    $("#mock-note").hidden = mode === "live";
  } catch { $("#mode-text").textContent = "Server offline"; }

  const tier = (w) => (w >= 20 ? "High Priority" : w >= 15 ? "Standard" : "Moderate");

  // ── Criteria grid ──
  function renderCriteria() {
    $("#criteria").innerHTML = criteria.map((c, i) => {
      const crucial = c.weight >= 20;
      return `<div class="p-3 rounded-lg ${crucial ? "bg-rose-50/60 border-rose-200" : "bg-zinc-50/70 border-zinc-200"} border flex flex-col gap-2 ${c.enabled ? "" : "opacity-45"}">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <input type="checkbox" ${c.enabled ? "checked" : ""} data-i="${i}" class="chk rounded border-zinc-400 text-zinc-900 focus:ring-zinc-900/20 w-3.5 h-3.5 shrink-0" />
            <span class="font-mono text-[11px] font-semibold ${crucial ? "text-rose-700" : "text-zinc-400"}">${String(i + 1).padStart(2, "0")}.</span>
            <span class="text-[11.5px] font-semibold ${crucial ? "text-rose-950" : "text-zinc-900"} truncate" title="${BL.esc(c.description)}">${BL.esc(c.name)}</span>
            ${crucial ? `<span class="px-1.5 rounded text-[9px] font-semibold bg-rose-100 text-rose-800 uppercase shrink-0">Crucial</span>` : ""}
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <span class="font-mono text-[11px] font-bold ${crucial ? "text-rose-700 border-rose-200" : "text-zinc-900 border-zinc-200"} bg-white px-2 py-0.5 rounded border">${c.weight}%</span>
            <button class="rm text-zinc-300 hover:text-rose-600 transition-colors" data-i="${i}" title="Remove criterion"><span class="material-symbols-outlined text-[15px]">close</span></button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <input type="range" min="5" max="40" step="5" value="${c.weight}" data-i="${i}" class="rng w-full h-1.5 ${crucial ? "bg-rose-200 accent-rose-600" : "bg-zinc-200 accent-zinc-900"} rounded-lg appearance-none cursor-pointer" />
          <span class="text-[10px] font-medium ${crucial ? "text-rose-700" : "text-zinc-500"} shrink-0 w-20 text-right">${BL.esc(tier(c.weight))}</span>
        </div>
      </div>`;
    }).join("");
    document.querySelectorAll(".chk").forEach((el) => (el.onchange = () => { criteria[el.dataset.i].enabled = el.checked; renderCriteria(); }));
    document.querySelectorAll(".rng").forEach((el) => (el.oninput = () => { criteria[el.dataset.i].weight = +el.value; renderCriteria(); }));
    document.querySelectorAll(".rm").forEach((el) => (el.onclick = () => {
      if (criteria.length > 1) { criteria.splice(+el.dataset.i, 1); renderCriteria(); }
      else BL.toast("At least one criterion is required");
    }));
    sync();
  }
  function sync() {
    const active = criteria.filter((c) => c.enabled);
    const total = active.reduce((s, c) => s + c.weight, 0);
    const badge = $("#weight-badge");
    badge.textContent = `Total: ${total}%`;
    badge.className = `px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${total === 100 ? "bg-zinc-900 text-white" : "bg-amber-100 text-amber-800"}`;
    badge.title = total === 100 ? "" : "Weights are normalised to 100% at scoring time";
    $("#btn-analyze").disabled = !($("#rfp-text").value.trim() && proposals.length && active.length);
    $("#btn-analyze").querySelector(".label").textContent =
      proposals.length > 1 ? `Run Evaluation · ${proposals.length} drafts` : "Run Evaluation";
  }

  // The model is told to reuse our exact criterion names, but a stray rename still
  // shouldn't silently drop a weight — fall back to significant-word overlap.
  const STOP = new Set(["and", "the", "of", "vs", "vs.", "&", "a", "to", "for", "in", "on"]);
  const words = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  function matchCriterion(name) {
    const exact = criteria.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact;
    const sub = criteria.find((c) => c.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.name.toLowerCase()));
    if (sub) return sub;
    const target = new Set(words(name));
    let best = null, bestScore = 0;
    for (const c of criteria) {
      const overlap = words(c.name).filter((w) => target.has(w)).length;
      if (overlap > bestScore) { bestScore = overlap; best = c; }
    }
    return bestScore >= 1 ? best : null;
  }

  // ── Auto-detect: fires on its own once an RFP is present ──
  async function autoDetect(manual) {
    const rfp = $("#rfp-text").value.trim();
    if (!rfp) { if (manual) BL.toast("Load the RFP first"); return; }
    const key = rfp.length + "::" + rfp.slice(0, 120);
    if (!manual && key === autoKey) return;       // already calibrated for this RFP
    autoKey = key;

    $("#auto-busy").hidden = false;
    $("#auto-badge").hidden = true;
    $("#btn-auto").disabled = true;
    try {
      const data = await API.extract(rfp, criteria.map(({ name, weight, description }) => ({ name, weight, description })));
      requirements = data.requirements || null;
      const sug = data.suggested_weights || [];
      let hits = 0;
      sug.forEach((sw) => {
        const m = matchCriterion(sw.criterion);
        if (m) { m.weight = Math.max(5, Math.min(40, Math.round(sw.weight / 5) * 5)); hits++; }
      });
      renderCriteria();
      $("#auto-badge").hidden = hits === 0;
      if (sug.length) {
        $("#ai-sug").hidden = false;
        $("#ai-sug").innerHTML =
          `<div class="font-semibold text-zinc-950 mb-2 text-[11px] uppercase tracking-wider font-headline">Detected client priorities${data.mode === "mock" ? " · Review Mock" : ""} · ${(requirements || []).length} requirements</div>` +
          sug.map((sw) => `<div class="flex justify-between gap-3 py-0.5"><span class="shrink-0 font-medium">${BL.esc(sw.criterion)} — ${sw.weight}%</span><span class="text-zinc-500 text-right">${BL.esc(sw.reason || "")}</span></div>`).join("");
      }
      if (manual) BL.toast("Rubric recalibrated to this RFP", "success");
    } catch (e) {
      autoKey = "";  // let it retry
      if (manual) BL.toast(e.message);
      else console.warn("auto-detect failed:", e.message);
    } finally {
      $("#auto-busy").hidden = true;
      $("#btn-auto").disabled = false;
    }
  }

  $("#btn-auto").onclick = () => autoDetect(true);
  $("#btn-reset").onclick = () => {
    criteria = DEFAULT_CRITERIA.map(withDefaults);
    $("#ai-sug").hidden = true; $("#auto-badge").hidden = true; autoKey = "";
    renderCriteria();
    BL.toast("Rubric reset to defaults", "success");
  };
  $("#btn-add").onclick = () => {
    const name = $("#new-name").value.trim(), desc = $("#new-desc").value.trim();
    if (!name) return BL.toast("Enter a criterion name");
    if (criteria.some((c) => c.name.toLowerCase() === name.toLowerCase())) return BL.toast("That criterion already exists");
    criteria.push({ name, weight: 10, description: desc || name, enabled: true });
    $("#new-name").value = ""; $("#new-desc").value = "";
    renderCriteria();
    BL.toast(`Added “${name}”`, "success");
  };

  // ── RFP input ──
  let rfpTimer = null;
  $("#rfp-text").addEventListener("input", () => {
    $("#rfp-count").textContent = $("#rfp-text").value.length;
    if (rfpName) { rfpName = ""; $("#rfp-name").textContent = "pasted"; }
    sync();
    clearTimeout(rfpTimer);
    rfpTimer = setTimeout(() => autoDetect(false), 1200);   // settle before calling the model
  });
  $("#rfp-file").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = await API.upload(f);
      $("#rfp-text").value = r.content;
      $("#rfp-count").textContent = r.content.length;
      rfpName = f.name; $("#rfp-name").textContent = f.name;
      sync();
      BL.toast(`RFP loaded · ${r.content.length.toLocaleString()} chars`, "success");
      autoDetect(false);
    } catch (err) { BL.toast(err.message); }
    e.target.value = "";
  };

  // ── Proposal list ──
  function renderProposals() {
    $("#prop-empty").hidden = proposals.length > 0;
    $("#prop-count-badge").textContent = proposals.length;
    $("#prop-list").innerHTML = proposals.map((p, i) => `
      <div class="flex items-center gap-2.5 p-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70">
        <span class="w-7 h-7 rounded-md bg-white border border-zinc-200 flex items-center justify-center shrink-0 text-zinc-500"><span class="material-symbols-outlined text-[15px]">draft</span></span>
        <div class="min-w-0 flex-1">
          <div class="text-[12px] font-semibold text-zinc-950 truncate">${BL.esc(p.name)}</div>
          <div class="text-[10.5px] font-mono text-zinc-400">${p.text.length.toLocaleString()} chars</div>
        </div>
        <button class="prm text-zinc-300 hover:text-rose-600 transition-colors shrink-0" data-i="${i}" title="Remove"><span class="material-symbols-outlined text-[16px]">close</span></button>
      </div>`).join("");
    document.querySelectorAll(".prm").forEach((el) => (el.onclick = () => { proposals.splice(+el.dataset.i, 1); renderProposals(); }));
    sync();
  }
  function addProposal(name, text) {
    const clean = BL.stripMd(text || "");
    if (!clean.trim()) { BL.toast(`${name}: no readable text`); return false; }
    let base = name, n = 2;
    while (proposals.some((p) => p.name === base)) base = `${name} (${n++})`;
    proposals.push({ id: `${Date.now()}-${proposals.length}`, name: base, text: clean });
    return true;
  }
  $("#proposal-file").onchange = async (e) => {
    const files = [...e.target.files]; if (!files.length) return;
    try {
      const r = await API.uploadMany(files);
      (r.files || []).forEach((f) => addProposal(f.filename, f.content));
      (r.errors || []).forEach((x) => BL.toast(`${x.filename}: ${x.error}`));
      renderProposals();
      const ok = (r.files || []).length;
      if (ok) BL.toast(`${ok} proposal${ok > 1 ? "s" : ""} added`, "success");
    } catch (err) { BL.toast(err.message); }
    e.target.value = "";
  };
  $("#btn-add-paste").onclick = () => {
    const t = $("#paste-text").value;
    if (!t.trim()) return BL.toast("Paste some proposal text first");
    if (addProposal(`Pasted draft ${proposals.length + 1}`, t)) {
      $("#paste-text").value = "";
      renderProposals();
      BL.toast("Proposal added", "success");
    }
  };

  // ── Progress ──
  const STAGES = ["extract", "analyze", "fixes"];
  function stage(s, pct, sub) {
    $("#progress").hidden = false;
    const i = STAGES.indexOf(s);
    STAGES.forEach((n, j) => { const el = $(`#st-${n}`); el.classList.toggle("done", j < i); el.classList.toggle("active", j === i); });
    $("#progress-fill").style.width = pct + "%";
    if (sub) $("#st-analyze-sub").textContent = sub;
  }

  // ── Run ──
  $("#btn-analyze").onclick = async () => {
    const btn = $("#btn-analyze"); btn.disabled = true;
    const label = btn.querySelector(".label"); label.textContent = "Evaluating…";
    const rfpText = $("#rfp-text").value;
    const active = criteria.filter((c) => c.enabled).map(({ name, weight, description }) => ({ name, weight, description }));

    try {
      stage("extract", 12);
      if (!requirements) {
        try { requirements = (await API.extract(rfpText)).requirements || null; } catch {}
      }

      const results = {};
      const total = proposals.length;
      for (let i = 0; i < total; i++) {
        const p = proposals[i];
        const base = 12 + (i / total) * 76;
        stage("analyze", Math.round(base + 20 / total), total > 1 ? `Draft ${i + 1} of ${total} — ${p.name}` : p.name);
        const analysis = await API.analyze(rfpText, p.text, active, requirements);
        stage("fixes", Math.round(base + 60 / total), total > 1 ? `Draft ${i + 1} of ${total} — ${p.name}` : p.name);
        let fixes = [];
        try { fixes = (await API.fixes(rfpText, p.text, analysis)).fixes || []; } catch {}
        results[p.id] = { analysis, fixes, text: p.text, originalText: p.text, reviewVersion: 1, at: Date.now() };
      }
      stage("fixes", 100);

      BL.saveSession({
        rfpId: rfpName || "rfp-custom", rfpName: rfpName || "Pasted RFP", rfpText,
        criteria: active, requirements,
        proposals: proposals.map(({ id, name }) => ({ id, name })),
        results, activeId: proposals[0].id,
        mode, createdAt: Date.now(),
      });
      location.href = "review.html";
    } catch (e) {
      BL.toast(e.message);
      $("#progress").hidden = true;
      btn.disabled = false; label.textContent = "Run Evaluation";
      sync();
    }
  };

  renderCriteria();
  renderProposals();
})();
