// Shared state + tiny helpers. Everything lives in localStorage so the app runs fully local.
window.BL = (() => {
  const KEYS = { user: "bidlens.user", session: "bidlens.session", chatPrefix: "bidlens.chat." };

  const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const del = (k) => { try { localStorage.removeItem(k); } catch {} };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (t) => String(t ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const stripMd = (t) => String(t ?? "").replace(/\*\*/g, "");

  // markdown-lite: **bold**, *em*, line breaks. Escaped first, so no HTML gets through.
  const mdLite = (s) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");

  const SAMPLE_LABELS = {
    "response_1_weak.md": "Sample 1 (Weak)",
    "response_2_medium.md": "Sample 2 (Medium)",
    "response_3_strong.md": "Sample 3 (Strong)",
    "response_4_overpromise.md": "Sample 4 (Overpromise)",
  };
  const SAMPLES = Object.keys(SAMPLE_LABELS);
  const label = (id) => SAMPLE_LABELS[id] || id || "Custom proposal";
  // "Sample 1 (Weak)" -> "Weak Draft"; anything else keeps its own name.
  const shortLabel = (id) => { const m = (SAMPLE_LABELS[id] || "").match(/\(([^)]+)\)/); return m ? `${m[1]} Draft` : label(id); };

  function toast(msg, type = "error") {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  const user = () => get(KEYS.user);
  const requireUser = () => { if (!user()) { location.replace("index.html"); return false; } return true; };
  const session = () => get(KEYS.session);
  const saveSession = (s) => { set(KEYS.session, s); window.dispatchEvent(new CustomEvent("bidlens:session", { detail: s })); };

  const fmt = (n, d = 2) => (typeof n === "number" ? n.toFixed(d).replace(/\.?0+$/, "") : "–");
  // Every score in the UI is on one 0–5.0 scale, so it always shows one decimal.
  const score = (n) => (typeof n === "number" ? n.toFixed(1) : "–");
  const grade = (s) => (s >= 4.5 ? "A" : s >= 3.5 ? "B" : s >= 2.5 ? "C" : s >= 1.5 ? "D" : "E");
  const sev = (s) => String(s || "low").toLowerCase();

  const STATUS = {
    DO_NOT_SEND: { label: "Do Not Send", cls: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-600" },
    REVIEW: { label: "Needs Review", cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
    READY: { label: "Ready To Send", cls: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-600" },
  };
  const status = (s) => STATUS[s] || { label: s || "–", cls: "bg-zinc-100 text-zinc-600 border-zinc-200", dot: "bg-zinc-400" };

  // Replace a whitespace-insensitive quote inside raw text (quotes were matched against normalised text).
  function replaceNorm(raw, quote, replacement) {
    const tokens = norm(quote).split(" ").map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(tokens.join("\\s+"));
    return re.test(raw) ? raw.replace(re, replacement) : null;
  }

  return { KEYS, get, set, del, esc, norm, stripMd, mdLite, toast, user, requireUser, session, saveSession, fmt, score, grade, sev, status, label, shortLabel, SAMPLES, replaceNorm };
})();
