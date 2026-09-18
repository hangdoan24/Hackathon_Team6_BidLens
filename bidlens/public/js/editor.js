// Inline Diff & Proposal Auditor — Grammarly-style: underline → click → suggestion card → 1-click replace.
window.Editor = (() => {
  let S = null; // { text, original, fixes, active, view, rfpText, onChange, els }

  const SEV_LABEL = { critical: "Disqualification blocker", high: "High-impact gap", medium: "Clarity issue", low: "Polish" };

  // ── Markdown-ish block parser (headings, bullets, table rows, paragraphs) ──
  function parseBlocks(text) {
    const lines = BL.stripMd(text).split(/\r?\n/);
    const blocks = [];
    let para = [];
    const flush = () => { if (para.length) { blocks.push({ type: "p", text: para.join(" ") }); para = []; } };
    for (const raw of lines) {
      const l = raw.trimEnd();
      if (!l.trim()) { flush(); continue; }
      if (/^#{1,2}\s/.test(l)) { flush(); blocks.push({ type: "h3", text: l.replace(/^#+\s*/, "") }); continue; }
      if (/^#{3,}\s/.test(l)) { flush(); blocks.push({ type: "h4", text: l.replace(/^#+\s*/, "") }); continue; }
      if (/^\s*[-*]\s+/.test(l)) { flush(); blocks.push({ type: "li", text: l.replace(/^\s*[-*]\s+/, "") }); continue; }
      if (/^\|/.test(l)) { flush(); if (!/^\|\s*-/.test(l)) blocks.push({ type: "row", text: l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).join("  ·  ") }); continue; }
      if (/^\*\*?Submitted by|^Submitted by|^Variant:/i.test(l)) { flush(); blocks.push({ type: "meta", text: l }); continue; }
      para.push(l.trim());
    }
    flush();
    return blocks;
  }

  // Wrap every match of the given [{quote, cls, attrs}] inside one block's text.
  function highlightBlock(text, marks) {
    const display = BL.norm(text);
    const ranges = [];
    for (const m of marks) {
      const q = BL.norm(m.quote);
      if (!q) continue;
      const i = display.indexOf(q);
      if (i < 0) continue;
      if (ranges.some((r) => i < r.end && i + q.length > r.start)) continue; // no overlaps
      ranges.push({ start: i, end: i + q.length, m });
    }
    ranges.sort((a, b) => a.start - b.start);
    let out = "", pos = 0;
    for (const r of ranges) {
      out += BL.esc(display.slice(pos, r.start));
      out += `<mark class="${r.m.cls}" ${r.m.attrs || ""}>${BL.esc(display.slice(r.start, r.end))}</mark>`;
      pos = r.end;
    }
    out += BL.esc(display.slice(pos));
    return { html: out, hit: ranges.map((r) => r.m) };
  }

  function blockTag(b, inner) {
    if (b.type === "h3") return `<h3>${inner}</h3>`;
    if (b.type === "h4") return `<h4>${inner}</h4>`;
    if (b.type === "li") return `<ul><li>${inner}</li></ul>`;
    if (b.type === "row") return `<div class="row">${inner}</div>`;
    if (b.type === "meta") return `<p class="meta">${inner}</p>`;
    return `<p>${inner}</p>`;
  }

  // ── Views ──
  function renderAnnotated() {
    const open = S.fixes.filter((f) => f.status === "open");
    const blocks = parseBlocks(S.text);
    let html = "";
    for (const b of blocks) {
      const marks = open.map((f) => ({ quote: f.original_quote, cls: `hl sev-${BL.sev(f.severity)} ${S.active === f.id ? "is-active" : ""}`, attrs: `data-fix="${f.id}" role="button" tabindex="0" title="${BL.esc(f.title)}"`, fix: f }));
      const { html: inner, hit } = highlightBlock(b.text, marks);
      html += blockTag(b, inner);
      const act = hit.find((m) => m.fix.id === S.active);
      if (act) html += fixCard(act.fix);
    }
    return html;
  }

  function renderSplit() {
    const accepted = S.fixes.filter((f) => f.status === "accepted");
    const left = parseBlocks(S.original).map((b) => blockTag(b, highlightBlock(b.text, accepted.map((f) => ({ quote: f.original_quote, cls: "removed" }))).html)).join("");
    const segs = accepted.flatMap((f) => f.replacement.split(/\n\s*\n/).map((s) => s.replace(/^#+\s*/, "").replace(/^\s*[-*]\s+/, "")).filter(Boolean));
    const right = parseBlocks(S.text).map((b) => blockTag(b, highlightBlock(b.text, segs.map((q) => ({ quote: q, cls: "applied" }))).html)).join("");
    return `<div class="grid md:grid-cols-2 gap-6">
      <div><div class="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2 font-headline">Original draft</div><div class="doc">${left}</div></div>
      <div><div class="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-2 font-headline">Revised draft · ${accepted.length} fix${accepted.length === 1 ? "" : "es"} applied</div><div class="doc">${right}</div></div>
    </div>`;
  }

  function fixCard(f) {
    const sev = BL.sev(f.severity);
    const idx = S.fixes.indexOf(f) + 1;
    const badgeCls = sev === "critical" ? "bg-rose-600 text-white" : sev === "high" ? "bg-rose-100 text-rose-800" : sev === "medium" ? "bg-amber-100 text-amber-800" : "bg-zinc-200 text-zinc-700";
    return `<div class="fix-card sev-${sev}" data-card="${f.id}">
      <div class="flex items-center gap-2 flex-wrap text-[10.5px] text-zinc-400 font-mono">
        <span class="badge ${badgeCls}">${BL.esc(SEV_LABEL[sev] || sev)}${f.rfp_ref ? ` (RFP ${BL.esc(f.rfp_ref)})` : ""}</span>
        <span>Fix #${idx} · ${BL.esc(f.criterion || "")}</span>
        <span class="ml-auto">BidLens suggestion</span>
      </div>
      <p class="text-[12.5px] text-zinc-950 mt-2 font-semibold">${BL.esc(f.title)}</p>
      <p class="text-[11.5px] text-zinc-500 mt-0.5 leading-relaxed">${BL.esc(f.reason || "")}</p>
      <div class="diff"><del>${BL.esc(f.original_quote)}</del><ins>${BL.esc(f.replacement)}</ins></div>
      <div class="flex items-center gap-2 flex-wrap">
        <button class="btn-replace" data-act="replace" data-fix="${f.id}"><span class="material-symbols-outlined" style="font-size:15px">bolt</span>1-Click Replace</button>
        <button class="btn-ghost" data-act="replace-all">Replace all</button>
        <button class="btn-ghost" data-act="dismiss" data-fix="${f.id}">Dismiss</button>
        ${f.rfp_ref ? `<button class="ml-auto text-[11.5px] font-medium text-zinc-700 hover:text-zinc-950 hover:underline inline-flex items-center gap-1" data-act="rule" data-fix="${f.id}"><span class="material-symbols-outlined" style="font-size:15px">menu_book</span>View RFP rule · ${BL.esc(f.rfp_ref)}</button>` : ""}
      </div>
    </div>`;
  }

  function renderList() {
    const open = S.fixes.filter((f) => f.status !== "dismissed");
    const crit = open.filter((f) => ["critical", "high"].includes(BL.sev(f.severity)));
    const clar = open.filter((f) => !["critical", "high"].includes(BL.sev(f.severity)));
    const item = (f) => `<div class="sug sev-${BL.sev(f.severity)} ${S.active === f.id ? "is-active" : ""} ${f.status === "accepted" ? "done" : ""}" data-sug="${f.id}">
        <div class="flex items-start justify-between gap-2">
          <span class="text-[12px] font-semibold text-zinc-950 leading-snug">${BL.esc(f.title)}</span>
          ${f.status === "accepted" ? `<span class="chip ok">Applied</span>` : `<span class="chip sev-${BL.sev(f.severity)}">${BL.esc(f.severity)}</span>`}
        </div>
        <p class="text-[11px] text-zinc-500 mt-1 leading-snug">${BL.esc(f.reason || "")}</p>
      </div>`;
    const group = (title, cls, arr) => arr.length ? `<div class="text-[10px] font-bold uppercase tracking-wider ${cls} mb-2 mt-1 flex items-center gap-1.5 font-headline"><span class="material-symbols-outlined" style="font-size:14px">${cls.includes("rose") ? "error" : "lightbulb"}</span>${title} (${arr.length})</div><div class="space-y-2 mb-4">${arr.map(item).join("")}</div>` : "";
    const openCount = S.fixes.filter((f) => f.status === "open").length;
    const bulk = openCount ? `<button class="w-full mb-3 px-3 py-2 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors" data-act="replace-all"><span class="material-symbols-outlined" style="font-size:15px">done_all</span>Replace all ${openCount} suggestion${openCount > 1 ? "s" : ""}</button>` : "";
    const groups = group("Critical fixes", "text-rose-700", crit) + group("Clarity & scope", "text-zinc-600", clar);
    return bulk + (groups || `<p class="text-[12px] text-zinc-400">No open suggestions.</p>`);
  }

  function render() {
    const { doc, list, counter } = S.els;
    doc.innerHTML = S.view === "split" ? renderSplit() : `<div class="doc">${renderAnnotated()}</div>`;
    list.innerHTML = renderList();
    const open = S.fixes.filter((f) => f.status === "open");
    const c = open.filter((f) => BL.sev(f.severity) === "critical").length;
    const h = open.filter((f) => BL.sev(f.severity) === "high").length;
    counter.textContent = `${c} critical · ${h} high · ${open.length} open suggestion${open.length === 1 ? "" : "s"}`;
    if (S.els.sugCount) S.els.sugCount.textContent = `${S.fixes.filter((f) => f.status !== "dismissed").length} suggestions`;
  }

  // ── Actions ──
  function activate(id, scroll) {
    S.active = S.active === id ? null : id;
    if (S.view === "split") S.view = "annotated";
    render();
    if (scroll && S.active) {
      const el = S.els.doc.querySelector(`mark[data-fix="${id}"]`);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    syncViewButtons();
  }

  function replace(id) {
    const f = S.fixes.find((x) => x.id === id);
    if (!f) return;
    const next = BL.replaceNorm(S.text, f.original_quote, f.replacement);
    if (next === null) { BL.toast("Could not locate that passage in the current draft"); return; }
    S.text = next;
    f.status = "accepted";
    S.active = null;
    render();
    S.onChange && S.onChange(S.text, S.fixes);
    BL.toast(`Applied: ${f.title}`, "success");
  }

  function replaceAll() {
    const open = S.fixes.filter((f) => f.status === "open");
    if (!open.length) { BL.toast("No open suggestions to apply"); return; }
    // Apply in document order so an earlier rewrite cannot shift a later quote
    // out from under itself; anything that no longer matches is reported, not lost.
    const pos = (f) => { const i = BL.norm(S.text).indexOf(BL.norm(f.original_quote)); return i < 0 ? Infinity : i; };
    const ordered = [...open].sort((a, b) => pos(a) - pos(b));
    let applied = 0;
    const failed = [];
    for (const f of ordered) {
      const next = BL.replaceNorm(S.text, f.original_quote, f.replacement);
      if (next === null) { failed.push(f.title); continue; }
      S.text = next;
      f.status = "accepted";
      applied++;
    }
    S.active = null;
    render();
    S.onChange && S.onChange(S.text, S.fixes);
    if (applied && failed.length) BL.toast(`Applied ${applied} · ${failed.length} could not be located`, "success");
    else if (applied) BL.toast(`Applied all ${applied} suggestion${applied > 1 ? "s" : ""}`, "success");
    else BL.toast("None of the passages could be located in the current draft");
  }

  function dismiss(id) {
    const f = S.fixes.find((x) => x.id === id);
    if (f) f.status = "dismissed";
    if (S.active === id) S.active = null;
    render();
    S.onChange && S.onChange(S.text, S.fixes);
  }

  function rfpSection(ref) {
    const rfp = BL.stripMd(S.rfpText || "");
    const num = (ref.match(/§\s*(\d+)/) || [])[1];
    if (num) {
      const m = rfp.match(new RegExp(`^\\s*${num}\\.\\s[\\s\\S]*?(?=^\\s*\\d+\\.\\s|^##|\\n\\n(?!\\s)|$)`, "m"));
      if (m) return m[0].trim();
    }
    const head = ref.replace(/§.*$/, "").trim().split(/[–-]/)[0].trim();
    const m2 = rfp.match(new RegExp(`^##\\s*${head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*\\n([\\s\\S]*?)(?=^##|$(?![\\r\\n]))`, "mi"));
    if (m2) return m2[1].trim();
    return "(section not found in the RFP text)";
  }

  function showRule(id) {
    const f = S.fixes.find((x) => x.id === id);
    if (!f) return;
    document.querySelectorAll(".rule-pop").forEach((p) => p.remove());
    const pop = document.createElement("div");
    pop.className = "rule-pop";
    pop.innerHTML = `<div class="flex items-center justify-between mb-2"><span class="text-[11px] font-bold uppercase tracking-wider text-amber-700 font-headline">RFP rule · ${BL.esc(f.rfp_ref)}</span><button class="text-zinc-400 hover:text-zinc-700" data-close><span class="material-symbols-outlined">close</span></button></div><pre>${BL.esc(rfpSection(f.rfp_ref))}</pre>`;
    pop.querySelector("[data-close]").onclick = () => pop.remove();
    document.body.appendChild(pop);
  }

  function syncViewButtons() {
    S.els.viewBtns.forEach((b) => {
      const on = b.dataset.view === S.view;
      b.className = "ed-view " + (on ? "px-3 py-1.5 text-[11.5px] font-semibold rounded-md bg-white border border-zinc-200 text-zinc-950 shadow-sm" : "px-3 py-1.5 text-[11.5px] font-medium rounded-md text-zinc-500 hover:text-zinc-900");
    });
  }

  function init(opts) {
    S = {
      text: BL.stripMd(opts.text || ""),
      original: BL.stripMd(opts.original || opts.text || ""),
      fixes: (opts.fixes || []).map((f, i) => ({ status: "open", ...f, id: f.id || `fix-${i + 1}` })),
      active: null, view: "annotated", rfpText: opts.rfpText || "", onChange: opts.onChange,
      els: { doc: opts.doc, list: opts.list, counter: opts.counter, sugCount: opts.sugCount, viewBtns: opts.viewBtns || [] },
    };
    S.els.doc.onclick = (e) => {
      const mark = e.target.closest("mark[data-fix]");
      if (mark) return activate(mark.dataset.fix, false);
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      if (btn.dataset.act === "replace-all") replaceAll();
      else if (btn.dataset.act === "replace") replace(btn.dataset.fix);
      else if (btn.dataset.act === "dismiss") dismiss(btn.dataset.fix);
      else if (btn.dataset.act === "rule") showRule(btn.dataset.fix);
    };
    S.els.doc.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("mark[data-fix]")) { e.preventDefault(); activate(e.target.dataset.fix, false); } };
    S.els.list.onclick = (e) => {
      if (e.target.closest('[data-act="replace-all"]')) { replaceAll(); return; }
      const s = e.target.closest("[data-sug]");
      if (s) activate(s.dataset.sug, true);
    };
    S.els.viewBtns.forEach((b) => (b.onclick = () => { S.view = b.dataset.view; S.active = null; render(); syncViewButtons(); }));
    syncViewButtons();
    render();
  }

  return { init, get text() { return S && S.text; }, get fixes() { return S && S.fixes; } };
})();
