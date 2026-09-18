const DEFAULT_CRITERIA = [
  { name: "Problem Understanding", weight: 15, description: "Does the proposal correctly reflect the client's actual stated problem/goals from the RFP?", enabled: true },
  { name: "Scope & Deliverables Clarity", weight: 15, description: "Are the deliverables specific and unambiguous?", enabled: true },
  { name: "Pricing Clarity", weight: 15, description: "Is pricing clearly stated, broken down, and easy to understand?", enabled: true },
  { name: "Timeline Clarity", weight: 10, description: "Are milestones and dates concrete?", enabled: true },
  { name: "Completeness vs. RFP Requirements", weight: 20, description: "Does the proposal address every requirement the RFP asked for?", enabled: true },
  { name: "Tone & Persuasiveness", weight: 10, description: "Does it read as confident, client-focused, and professional?", enabled: true },
  { name: "Risk/Assumptions Transparency", weight: 15, description: "Are assumptions, dependencies, or risks clearly flagged?", enabled: true },
];

let criteria = structuredClone(DEFAULT_CRITERIA);

const $ = (s) => document.querySelector(s);
const esc = (s) => { if (!s) return ""; const d = document.createElement("div"); d.textContent = s; return d.innerHTML; };

function scoreColor(s) {
  if (s >= 4) return "var(--emerald)";
  if (s >= 3) return "var(--amber)";
  if (s >= 2) return "var(--orange)";
  return "var(--coral)";
}

function normalizeWeights(changedIdx) {
  const enabled = criteria.filter(c => c.enabled);
  if (enabled.length === 0) return;

  if (changedIdx !== undefined) {
    const changed = criteria[changedIdx];
    const others = enabled.filter(c => c !== changed);
    if (others.length === 0) { changed.weight = 100; return; }
    const remaining = 100 - changed.weight;
    const othersTotal = others.reduce((s, c) => s + c.weight, 0);
    others.forEach(c => {
      c.weight = othersTotal > 0
        ? Math.max(1, Math.round((c.weight / othersTotal) * remaining))
        : Math.round(remaining / others.length);
    });
  } else {
    const total = enabled.reduce((s, c) => s + c.weight, 0);
    enabled.forEach(c => {
      c.weight = total > 0
        ? Math.max(1, Math.round((c.weight / total) * 100))
        : Math.round(100 / enabled.length);
    });
  }

  const en = criteria.filter(c => c.enabled);
  const diff = 100 - en.reduce((s, c) => s + c.weight, 0);
  if (diff !== 0 && en.length > 0) {
    en.reduce((a, b) => a.weight > b.weight ? a : b).weight += diff;
  }
}

function renderCriteria() {
  const enabledTotal = criteria.filter(c => c.enabled).reduce((s, c) => s + c.weight, 0);
  $("#criteria-list").innerHTML = criteria.map((c, i) => `
    <div class="crit-row${c.enabled ? "" : " crit-disabled"}">
      <input type="checkbox" ${c.enabled ? "checked" : ""} data-i="${i}" class="crit-chk" />
      <label title="${esc(c.description)}">${esc(c.name)}</label>
      <input type="range" min="1" max="80" value="${c.weight}" data-i="${i}" class="crit-range"${c.enabled ? "" : " disabled"} />
      <span class="crit-weight">${c.weight}%</span>
      <button class="crit-remove" data-i="${i}" title="Remove criterion">&times;</button>
    </div>`).join("") +
    '<div class="crit-total">Total: <span class="crit-total-val">' + enabledTotal + '%</span></div>';

  document.querySelectorAll(".crit-chk").forEach(el =>
    el.addEventListener("change", () => {
      criteria[el.dataset.i].enabled = el.checked;
      normalizeWeights();
      renderCriteria();
      checkReady();
    }));
  document.querySelectorAll(".crit-range").forEach(el =>
    el.addEventListener("input", () => {
      const idx = +el.dataset.i;
      criteria[idx].weight = +el.value;
      normalizeWeights(idx);
      el.value = criteria[idx].weight;
      el.nextElementSibling.textContent = criteria[idx].weight + "%";
      criteria.forEach((c, j) => {
        if (j !== idx) {
          const other = document.querySelector('.crit-range[data-i="' + j + '"]');
          if (other) {
            other.value = c.weight;
            other.nextElementSibling.textContent = c.weight + "%";
          }
        }
      });
      const total = criteria.filter(c => c.enabled).reduce((s, c) => s + c.weight, 0);
      const totalEl = document.querySelector('.crit-total-val');
      if (totalEl) totalEl.textContent = total + "%";
    }));
  document.querySelectorAll(".crit-remove").forEach(el =>
    el.addEventListener("click", () => removeCriterion(+el.dataset.i)));
}

function addCriterion() {
  const nameInput = $("#new-crit-name");
  const descInput = $("#new-crit-desc");
  const name = nameInput.value.trim();
  const desc = descInput.value.trim();
  if (!name) { toast("Enter a criterion name"); return; }
  if (criteria.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast("Criterion already exists"); return; }
  criteria.push({ name, weight: 10, description: desc || name, enabled: true });
  normalizeWeights();
  nameInput.value = "";
  descInput.value = "";
  renderCriteria();
  toast(`Added "${name}"`, "success");
}

function removeCriterion(i) {
  if (criteria.length <= 1) { toast("Need at least one criterion"); return; }
  const name = criteria[i].name;
  criteria.splice(i, 1);
  normalizeWeights();
  renderCriteria();
  toast(`Removed "${name}"`, "success");
}

function checkReady() {
  const ok = $("#rfp-text").value.trim() && $("#proposal-text").value.trim() && criteria.some(c => c.enabled);
  $("#btn-analyze").disabled = !ok;
}

function toast(msg, type = "error") {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function loadSample(name) {
  const r = await fetch(`/api/sample-data/${name}`);
  if (!r.ok) throw new Error("Load failed");
  return (await r.json()).content;
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error("Upload failed");
  return (await r.json()).content;
}

// ── Progress stages ──
function showProgress(stage) {
  const panel = $("#progress-panel");
  panel.hidden = false;
  const stages = ["extract", "analyze", "report"];
  const pcts = { extract: 15, analyze: 55, report: 100 };

  stages.forEach((s, i) => {
    const el = $(`#stage-${s}`);
    el.classList.remove("active", "done");
    const si = stages.indexOf(stage);
    if (i < si) el.classList.add("done");
    else if (i === si) el.classList.add("active");
  });

  $("#progress-fill").style.width = (pcts[stage] || 0) + "%";
}

function hideProgress() {
  $("#progress-fill").style.width = "100%";
  setTimeout(() => { $("#progress-panel").hidden = true; }, 600);
}

// ── SVG Radar Chart ──
function renderRadarChart(scores) {
  if (!scores || !scores.length) return "";
  const shortNames = {
    "Problem Understanding": "Problem",
    "Scope & Deliverables Clarity": "Scope",
    "Pricing Clarity": "Pricing",
    "Timeline Clarity": "Timeline",
    "Completeness vs. RFP Requirements": "Completeness",
    "Tone & Persuasiveness": "Tone",
    "Risk/Assumptions Transparency": "Risk",
  };

  const n = scores.length;
  const cx = 160, cy = 160, maxR = 110;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  function pt(i, r) {
    const a = startAngle + i * angleStep;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function polygon(radius) {
    return Array.from({ length: n }, (_, i) => pt(i, radius))
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join(" ") + " Z";
  }

  let svg = `<svg viewBox="0 0 320 320" class="radar-chart" xmlns="http://www.w3.org/2000/svg">`;

  for (let level = 1; level <= 5; level++) {
    const r = (level / 5) * maxR;
    svg += `<path d="${polygon(r)}" fill="none" stroke="var(--border)" stroke-width="1" opacity="${level === 5 ? 0.6 : 0.3}"/>`;
  }

  for (let i = 0; i < n; i++) {
    const [x2, y2] = pt(i, maxR);
    svg += `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--border)" stroke-width="1" opacity="0.3"/>`;
  }

  const scorePoints = scores.map((s, i) => pt(i, (s.score / 5) * maxR));
  const scoreD = scorePoints.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
  svg += `<path d="${scoreD}" fill="var(--amber)" fill-opacity="0.15" stroke="var(--amber)" stroke-width="2.5"/>`;

  scorePoints.forEach(([x, y]) => {
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--amber)" stroke="var(--midnight)" stroke-width="2"/>`;
  });

  for (let i = 0; i < n; i++) {
    const a = startAngle + i * angleStep;
    const labelR = maxR + 28;
    const x = cx + labelR * Math.cos(a);
    const y = cy + labelR * Math.sin(a);
    const name = shortNames[scores[i].criterion] || scores[i].criterion;
    const anchor = Math.abs(Math.cos(a)) < 0.15 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
    const dy = Math.abs(Math.sin(a)) < 0.15 ? (Math.cos(a) > 0 ? 0 : 0) : (Math.sin(a) > 0 ? 4 : -2);
    svg += `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" class="radar-label">${esc(name)}</text>`;
  }

  for (let level = 1; level <= 5; level += 2) {
    const r = (level / 5) * maxR;
    svg += `<text x="${cx + 4}" y="${cy - r + 3}" class="radar-score-label">${level}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// ── SVG Donut Chart ──
function renderDonutChart(pct) {
  if (pct == null) return "";
  const r = 40, sw = 8;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const color = pct >= 90 ? "var(--emerald)" : pct >= 70 ? "var(--amber)" : "var(--coral)";

  return `<svg viewBox="0 0 100 100" class="donut-chart">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--border)" stroke-width="${sw}" opacity="0.3"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
      stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
      stroke-linecap="round" transform="rotate(-90 50 50)"
      style="transition: stroke-dashoffset 1s ease"/>
    <text x="50" y="46" text-anchor="middle" class="donut-pct" style="fill:${color}">${pct}%</text>
    <text x="50" y="58" text-anchor="middle" class="donut-label">coverage</text>
  </svg>`;
}

// ── Render: Send Readiness ──
function renderReadiness(sr) {
  if (!sr) return;
  const card = $("#readiness-card");
  const key = (sr.final_readiness || sr.status || "").toLowerCase();
  card.className = "readiness-card " + key;

  const labels = { ready: "Ready to send", review: "Review recommended", do_not_send: "Do not send yet" };
  const icons = { ready: "✔", review: "⚠", do_not_send: "✖" };
  $("#readiness-icon").textContent = icons[key] || "";
  $("#readiness-label").textContent = labels[key] || sr.status;

  const cov = sr.coverage_pct ?? "—";
  const ws = sr.weighted_score != null ? sr.weighted_score.toFixed(1) : "—";
  $("#readiness-stats").innerHTML = `
    <div class="stat-item"><span class="stat-val" style="color:${scoreColor(sr.weighted_score || 0)}">${ws}</span><span class="stat-label">weighted score</span></div>
    <div class="stat-item"><span class="stat-val" style="color:var(--coral)">${sr.critical_count ?? 0}</span><span class="stat-label">critical</span></div>
    <div class="stat-item"><span class="stat-val" style="color:var(--orange)">${sr.high_count ?? 0}</span><span class="stat-label">high</span></div>
    <div class="stat-item"><span class="stat-val" style="color:var(--amber)">${sr.medium_count ?? 0}</span><span class="stat-label">medium</span></div>
    <div class="stat-item"><span class="stat-val" style="color:var(--emerald)">${cov}%</span><span class="stat-label">RFP coverage</span></div>`;

  let summaryHtml = esc(sr.summary || "");
  if (sr.blocker_override && sr.base_readiness && sr.base_readiness !== sr.final_readiness) {
    summaryHtml += '<div class="readiness-override">Base readiness was <strong>' + esc(sr.base_readiness) + '</strong>, overridden to <strong>' + esc(sr.final_readiness) + '</strong> due to hard constraint violation(s).</div>';
  }
  $("#readiness-summary").innerHTML = summaryHtml;

  const blockerEl = $("#readiness-blockers");
  const blockers = sr.blockers || [];
  if (blockers.length > 0) {
    blockerEl.hidden = false;
    blockerEl.innerHTML = '<div class="blocker-title">Hard constraint blockers (' + blockers.length + ')</div>' +
      blockers.map(b => '<div class="blocker-item">' +
        '<span class="blocker-id">' + esc(b.id) + '</span>' +
        '<span class="blocker-req">' + esc(b.requirement) + '</span>' +
        '<span class="blocker-conf">confidence: ' + (b.confidence * 100).toFixed(0) + '%</span>' +
      '</div>').join("");
  } else {
    blockerEl.hidden = true;
    blockerEl.innerHTML = "";
  }

  $("#readiness-donut").innerHTML = renderDonutChart(sr.coverage_pct);
}

// ── Render: Critical Issues ──
function renderCriticals(flags) {
  const criticals = (flags || []).filter(f => f.severity === "CRITICAL");
  if (!criticals.length) { $("#critical-section").hidden = true; return; }
  $("#critical-section").hidden = false;
  $("#critical-list").innerHTML = criticals.map((f, i) => buildFindingCard(f, `crit-${i}`)).join("");
}

// ── Render: Red Flags ──
function renderFlags(flags) {
  if (!flags || !flags.length) { $("#flags-section").hidden = true; return; }
  $("#flags-section").hidden = false;
  $("#flags-list").innerHTML = flags.map((f, i) => buildFindingCard(f, `flag-${i}`)).join("");
}

function buildFindingCard(f, id) {
  const sev = (f.severity || "medium").toLowerCase();
  const rfpEv = f.rfp_evidence;
  const propEv = f.proposal_evidence;
  return `
    <div class="finding-card">
      <div class="finding-header" onclick="togglePanel('${id}')">
        <span class="severity-badge ${sev}">${sev}</span>
        <span class="finding-title">${esc(f.issue)}</span>
        <span class="finding-chevron" id="chev-${id}">▼</span>
      </div>
      <div class="finding-body" id="body-${id}">
        <div class="finding-detail">${esc(f.detail)}</div>
        ${rfpEv && rfpEv.quote ? `<div class="evidence-block rfp-ev"><div class="ev-label">RFP — ${esc(rfpEv.section || "")}</div><div class="ev-quote">"${esc(rfpEv.quote)}"</div></div>` : ""}
        ${propEv && propEv.quote ? `<div class="evidence-block prop-ev"><div class="ev-label">Proposal — ${esc(propEv.section || "")}</div><div class="ev-quote">"${esc(propEv.quote)}"</div></div>` : ""}
        ${f.business_impact ? `<div class="impact-line">${esc(f.business_impact)}</div>` : ""}
        ${f.suggested_fix ? `<div class="fix-line">${esc(f.suggested_fix)}</div>` : ""}
      </div>
    </div>`;
}

// ── Render: Traceability Matrix (compact table + detail panel) ──
function renderTraceability(reqs) {
  if (!reqs || !reqs.length) { $("#trace-section").hidden = true; return; }
  $("#trace-section").hidden = false;

  const counts = { covered: 0, partial: 0, missing: 0, contradicted: 0, uncertain: 0 };
  reqs.forEach(r => { const s = (r.status || "").toLowerCase(); if (counts[s] !== undefined) counts[s]++; });
  $("#trace-summary").innerHTML = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `<span class="trace-stat ${k}">${v} ${k}</span>`).join("");

  $("#trace-thead").innerHTML = '<tr>' +
    '<th></th><th>ID</th><th>Requirement</th><th>Status</th><th>Severity</th><th>Evidence</th>' +
  '</tr>';

  $("#trace-tbody").innerHTML = reqs.map((r, i) => {
    const st = (r.status || "").toLowerCase();
    const sev = (r.severity || "medium").toLowerCase();
    const cls = (r.classification || "").toUpperCase();
    const conf = r.confidence != null ? (r.confidence * 100).toFixed(0) + "%" : "";
    const rfpQ = r.rfp_evidence?.quote;
    const propQ = r.proposal_evidence?.quote;
    const propS = r.proposal_evidence?.section;
    const rfpSec = r.rfp_section || r.rfp_evidence?.section || "";
    const hasEvidence = rfpQ || propQ;

    const detailPairs = [
      rfpQ ? ["RFP Evidence", '<span class="trace-detail-src">' + esc(rfpSec) + '</span>' + esc(rfpQ), "rfp-ev"] : null,
      propQ ? ["Proposal Evidence", '<span class="trace-detail-src">' + esc(propS) + '</span>' + esc(propQ), "prop-ev"] : ["Proposal Evidence", '<span class="text-muted">No matching evidence found</span>', "no-ev"],
      r.business_impact ? ["Business Impact", esc(r.business_impact), "impact"] : null,
      r.suggested_fix ? ["Suggested Fix", esc(r.suggested_fix), "fix"] : null,
    ].filter(Boolean);

    const clsBadge = cls ? '<span class="cls-badge cls-' + cls.toLowerCase() + '">' + cls.replace("_", " ") + '</span>' : "";
    const confBadge = conf ? '<span class="conf-badge">' + conf + '</span>' : "";

    return '<tr class="trace-row" data-i="' + i + '" onclick="toggleTraceDetail(' + i + ')">' +
      '<td class="trace-td-chevron"><span class="trace-chevron" id="tchev-' + i + '">&#9654;</span></td>' +
      '<td class="trace-td-id">' + esc(r.id) + '</td>' +
      '<td class="trace-td-req">' + esc(r.requirement) + (clsBadge ? ' ' + clsBadge : '') + '</td>' +
      '<td><span class="status-tag ' + st + '">' + st + '</span>' + (confBadge ? ' ' + confBadge : '') + '</td>' +
      '<td><span class="severity-badge ' + sev + '">' + sev + '</span></td>' +
      '<td class="trace-td-ev">' + (hasEvidence ? '<span class="ev-btn" title="Click row to expand">View</span>' : '<span class="ev-btn ev-none">None</span>') + '</td>' +
    '</tr>' +
    '<tr class="trace-detail-row" id="tdetail-' + i + '">' +
      '<td colspan="6">' +
        '<div class="trace-detail-grid">' +
          detailPairs.map(function(p) { return '<div class="trace-detail-item ' + p[2] + '">' +
              '<div class="trace-detail-label">' + p[0] + '</div>' +
              '<div class="trace-detail-content">' + p[1] + '</div>' +
            '</div>'; }).join("") +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join("");
}

function toggleTraceDetail(i) {
  const row = document.getElementById(`tdetail-${i}`);
  const chev = document.getElementById(`tchev-${i}`);
  if (!row) return;
  row.classList.toggle("open");
  if (chev) chev.classList.toggle("open");
}

// ── Render: Criteria Scores ──
function renderScores(data) {
  const o = data.overall || {};
  const score = data.weighted_overall || o.score || 0;
  const color = scoreColor(score);
  const vKey = (o.verdict || "").toLowerCase().replace(/\s+/g, "-");

  $("#overall-row").innerHTML = `
    <div><span class="overall-score-big" style="color:${color}">${score.toFixed(1)}</span><span class="overall-sub"> / 5.0</span></div>
    <span class="verdict-tag ${vKey}">${esc(o.verdict)}</span>
    <span class="overall-summary">${esc(o.summary)}</span>`;

  const list = data.criteria_scores || [];
  $("#radar-container").innerHTML = renderRadarChart(list);

  $("#scores-list").innerHTML = list.map((cs, i) => {
    const pct = (cs.score / 5) * 100;
    const c = scoreColor(cs.score);
    return `
      <div class="score-card">
        <div class="score-header" onclick="togglePanel('sc-${i}')">
          <span class="score-name">${esc(cs.criterion)}</span>
          <div class="score-bar-track"><div class="score-bar-fill" style="width:${pct}%;background:${c}"></div></div>
          <span class="score-num" style="color:${c}">${cs.score}/5</span>
          <span class="score-chevron" id="chev-sc-${i}">▼</span>
        </div>
        <div class="score-detail" id="body-sc-${i}">
          <p class="score-comment">${esc(cs.comment)}</p>
          ${renderDetailSection("Strengths", cs.strengths, "strengths")}
          ${renderDetailSection("Weaknesses", cs.weaknesses, "weaknesses")}
          ${cs.citations?.length ? `<div class="detail-section"><div class="detail-heading">Evidence</div>${cs.citations.map(ci => `<div class="evidence-block ${ci.source === "rfp" ? "rfp-ev" : "prop-ev"}"><div class="ev-label">${esc(ci.source)} — ${esc(ci.section)}</div><div class="ev-quote">"${esc(ci.quote)}"</div></div>`).join("")}</div>` : ""}
          ${renderDetailSection("Suggested fixes", cs.suggested_fixes, "fixes")}
        </div>
      </div>`;
  }).join("");
}

function renderDetailSection(title, items, cls) {
  if (!items || !items.length) return "";
  return `<div class="detail-section"><div class="detail-heading">${title}</div><ul class="detail-items ${cls}">${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
}

function togglePanel(id) {
  const body = document.getElementById(`body-${id}`);
  const chev = document.getElementById(`chev-${id}`);
  if (body) body.classList.toggle("open");
  if (chev) chev.classList.toggle("open");
}

// ── Full render ──
function renderResults(data) {
  const sec = $("#results");
  sec.hidden = false;
  sec.scrollIntoView({ behavior: "smooth", block: "start" });

  // Order: Readiness -> Blockers(critical) -> Coverage(flags) -> Traceability -> Scores -> Charts
  renderReadiness(data.send_readiness);
  renderCriticals(data.red_flags);
  renderFlags(data.red_flags);
  renderTraceability(data.requirement_traceability);
  renderScores(data);
}

// ── 2-step Analyze with progress ──
async function analyze() {
  const btn = $("#btn-analyze");
  const label = btn.querySelector(".btn-label");
  const busy = btn.querySelector(".btn-busy");
  btn.disabled = true;
  label.hidden = true;
  busy.hidden = false;
  $("#results").hidden = true;

  const rfpText = $("#rfp-text").value;
  const proposalText = $("#proposal-text").value;
  const active = criteria.filter(c => c.enabled);

  try {
    // Stage 1: Extract requirements
    showProgress("extract");
    let requirements = null;
    try {
      const extractRes = await fetch("/api/extract-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfpText }),
      });
      if (extractRes.ok) {
        const extractData = await extractRes.json();
        requirements = extractData.requirements || null;
      }
    } catch (_) {}

    // Stage 2: Full analysis
    showProgress("analyze");
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rfpText,
        proposalText,
        criteria: active,
        requirements,
      }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Analysis failed"); }

    // Stage 3: Render
    showProgress("report");
    const data = await res.json();
    renderResults(data);
    hideProgress();
    toast("Analysis complete", "success");
  } catch (e) {
    hideProgress();
    toast(e.message);
  } finally {
    btn.disabled = false;
    label.hidden = false;
    busy.hidden = true;
    checkReady();
  }
}

// ── Validation: Evaluate the Evaluator ──
async function runValidation() {
  const rfp = $("#rfp-text").value.trim();
  if (!rfp) { toast("Load the RFP first to run validation"); return; }

  const btn = $("#btn-validate");
  const label = btn.querySelector(".btn-label");
  const busy = btn.querySelector(".btn-busy");
  btn.disabled = true;
  label.hidden = true;
  busy.hidden = false;

  const container = $("#validation-results");
  container.hidden = false;
  container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:1rem;">Running all 4 sample proposals in parallel…</p>';

  try {
    const res = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfpText: rfp }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Validation failed"); }
    const data = await res.json();
    renderValidation(data);
    toast("Validation complete", "success");
  } catch (e) {
    container.innerHTML = `<p style="color:var(--coral);padding:1rem;">${esc(e.message)}</p>`;
    toast(e.message);
  } finally {
    btn.disabled = false;
    label.hidden = false;
    busy.hidden = true;
  }
}

function renderValidation(data) {
  const container = $("#validation-results");
  const results = data.results || {};
  const consistency = data.consistency || {};

  const order = ["response_1_weak.md", "response_2_medium.md", "response_3_strong.md", "response_4_overpromise.md"];
  const cardColors = {
    "Weak": "var(--coral)",
    "Medium": "var(--amber)",
    "Strong": "var(--emerald)",
    "Overpromise": "var(--orange)",
  };

  let cardsHtml = order.map(name => {
    const r = results[name];
    if (!r || r.error) return `<div class="val-card"><div class="val-card-header"><span class="val-card-label">${esc(r?.label || name)}</span></div><p style="color:var(--coral)">Error: ${esc(r?.error || "Missing")}</p></div>`;

    const color = cardColors[r.label] || "var(--text)";
    const readinessColors = { "READY": "var(--emerald)", "REVIEW": "var(--amber)", "DO_NOT_SEND": "var(--coral)" };
    const rColor = readinessColors[r.send_readiness] || "var(--text-muted)";

    const scoreRows = r.scores ? Object.entries(r.scores).map(([k, v]) => {
      const shortK = k.replace("vs. RFP Requirements", "").replace("& Deliverables ", "").replace("& Persuasiveness", "").replace("/Assumptions ", "/Assum. ");
      return `<div class="val-card-row"><span>${esc(shortK)}</span><span style="color:${scoreColor(v)};font-family:'JetBrains Mono',monospace;font-weight:600">${v}/5</span></div>`;
    }).join("") : "";

    return `<div class="val-card">
      <div class="val-card-header">
        <span class="val-card-label" style="color:${color}">${esc(r.label)}</span>
        <span class="val-card-score" style="color:${color}">${(r.overall_score || 0).toFixed(1)}</span>
      </div>
      ${scoreRows}
      <div class="val-card-row" style="margin-top:0.4rem;border-top:2px solid var(--border);padding-top:0.4rem">
        <span>Readiness</span>
        <span class="val-verdict" style="color:${rColor};background:${rColor}18">${r.send_readiness || "N/A"}</span>
      </div>
      <div class="val-card-row">
        <span>Coverage</span>
        <span style="color:var(--emerald);font-family:'JetBrains Mono',monospace">${r.coverage_pct ?? "N/A"}%</span>
      </div>
      <div class="val-card-row">
        <span>Issues</span>
        <span style="font-family:'JetBrains Mono',monospace"><span style="color:var(--coral)">${r.critical_count || 0}C</span> <span style="color:var(--orange)">${r.high_count || 0}H</span> <span style="color:var(--amber)">${r.medium_count || 0}M</span></span>
      </div>
    </div>`;
  }).join("");

  const checks = consistency.checks || [];
  let checksHtml = checks.map(c => `
    <div class="val-check-row">
      <span class="val-check-icon">${c.passed ? "✅" : "❌"}</span>
      <span class="val-check-name">${esc(c.test)}</span>
      <span class="val-check-detail">${esc(c.detail)}</span>
    </div>`).join("");

  const passedAll = consistency.passed === consistency.total;
  const summaryColor = passedAll ? "var(--emerald)" : "var(--orange)";

  container.innerHTML = `
    <div class="val-grid">${cardsHtml}</div>
    <div class="val-checks">
      <div class="val-checks-title">Consistency checks</div>
      ${checksHtml}
      <div class="val-summary" style="color:${summaryColor}">
        ${consistency.passed}/${consistency.total} checks passed ${passedAll ? "— evaluator is consistent" : "— review scoring calibration"}
      </div>
    </div>`;
}

// ── Auto-detect weights ──
async function autoDetect() {
  const rfp = $("#rfp-text").value.trim();
  if (!rfp) { toast("Load the RFP first"); return; }
  const btn = $("#btn-auto-weights");
  const orig = btn.textContent;
  btn.textContent = "Detecting…";
  btn.disabled = true;
  try {
    const r = await fetch("/api/extract-requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfpText: rfp }),
    });
    if (!r.ok) throw new Error("Detection failed");
    const data = await r.json();
    if (data.suggested_weights) {
      data.suggested_weights.forEach(sw => {
        const m = criteria.find(c =>
          c.name.toLowerCase().includes(sw.criterion.toLowerCase()) ||
          sw.criterion.toLowerCase().includes(c.name.toLowerCase())
        );
        if (m) m.weight = Math.max(1, sw.weight);
      });
      normalizeWeights();
      renderCriteria();

      const sugPanel = $("#ai-suggestions");
      sugPanel.hidden = false;
      sugPanel.innerHTML = `<div class="ai-sug-title">AI-suggested weights based on RFP priorities</div>` +
        data.suggested_weights.map(sw =>
          `<div class="ai-sug-item"><span>${esc(sw.criterion)}: <strong>${sw.weight}%</strong></span><span class="ai-sug-reason">${esc(sw.reason || "")}</span></div>`
        ).join("");

      toast("Weights updated from RFP priorities", "success");
    }
  } catch (e) { toast(e.message); }
  finally { btn.textContent = orig; btn.disabled = false; }
}

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  renderCriteria();

  $("#rfp-text").addEventListener("input", () => { $("#rfp-count").textContent = $("#rfp-text").value.length; checkReady(); });
  $("#proposal-text").addEventListener("input", () => { $("#proposal-count").textContent = $("#proposal-text").value.length; checkReady(); });

  $("#rfp-file").addEventListener("change", async (e) => {
    if (!e.target.files[0]) return;
    try { $("#rfp-text").value = await uploadFile(e.target.files[0]); $("#rfp-count").textContent = $("#rfp-text").value.length; checkReady(); toast("Uploaded", "success"); }
    catch { toast("Upload failed"); }
  });
  $("#proposal-file").addEventListener("change", async (e) => {
    if (!e.target.files[0]) return;
    try { $("#proposal-text").value = await uploadFile(e.target.files[0]); $("#proposal-count").textContent = $("#proposal-text").value.length; checkReady(); toast("Uploaded", "success"); }
    catch { toast("Upload failed"); }
  });

  $("#btn-analyze").addEventListener("click", analyze);
  $("#btn-auto-weights").addEventListener("click", autoDetect);
  $("#btn-reset-weights").addEventListener("click", () => {
    criteria = structuredClone(DEFAULT_CRITERIA);
    renderCriteria();
    $("#ai-suggestions").hidden = true;
    toast("Weights reset", "success");
  });
  $("#btn-add-criterion").addEventListener("click", addCriterion);
  $("#new-crit-name").addEventListener("keydown", (e) => { if (e.key === "Enter") addCriterion(); });
  $("#new-crit-desc").addEventListener("keydown", (e) => { if (e.key === "Enter") addCriterion(); });
  $("#btn-validate").addEventListener("click", runValidation);
});
