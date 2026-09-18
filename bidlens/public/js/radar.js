// 7-axis radar (the graph from the brief). Pure SVG, no library.
window.renderRadar = function renderRadar(container, criteriaScores) {
  const SHORT = {
    "Problem Understanding": "Problem",
    "Scope & Deliverables Clarity": "Scope",
    "Pricing Clarity": "Pricing",
    "Timeline Clarity": "Timeline",
    "Completeness vs. RFP Requirements": "Completeness",
    "Tone & Persuasiveness": "Tone",
    "Risk/Assumptions Transparency": "Risk",
  };
  const scores = (criteriaScores || []).map((c) => ({ name: SHORT[c.criterion] || c.criterion.split(" ")[0], score: Number(c.score) || 0 }));
  if (!scores.length) { container.innerHTML = ""; return; }

  const W = 380, H = 330, cx = W / 2, cy = H / 2 + 6, R = 108, n = scores.length;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];

  let g = "";
  for (let ring = 1; ring <= 5; ring++) {
    const r = (R * ring) / 5;
    g += `<polygon class="grid" points="${scores.map((_, i) => pt(i, r).join(",")).join(" ")}"/>`;
  }
  scores.forEach((_, i) => { const [x, y] = pt(i, R); g += `<line class="axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`; });

  const poly = scores.map((s, i) => pt(i, (R * Math.max(s.score, 0.2)) / 5).join(",")).join(" ");
  const dots = scores.map((s, i) => { const [x, y] = pt(i, (R * Math.max(s.score, 0.2)) / 5); return `<circle class="pt ${s.score <= 2 ? "low" : ""}" cx="${x}" cy="${y}" r="3.5"/>`; }).join("");

  const labels = scores.map((s, i) => {
    const [x, y] = pt(i, R + 22);
    const a = ang(i);
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
    return `<text class="${s.score <= 2 ? "low" : ""}" x="${x}" y="${y + 4}" text-anchor="${anchor}">${BL.esc(s.name)} (${s.score})</text>`;
  }).join("");

  container.innerHTML = `
    <svg class="radar" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="7-axis criteria radar">
      ${g}<polygon class="poly" points="${poly}"/>${dots}${labels}
    </svg>
    <p class="text-center text-[11px] font-mono text-slate-400 -mt-1">${n}-Axis Polygon (Normalized 1.0 – 5.0)</p>`;
};
