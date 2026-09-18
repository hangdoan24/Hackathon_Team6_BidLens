window.API = (() => {
  async function req(path, opts = {}) {
    const r = await fetch(path, opts);
    let data = null;
    try { data = await r.json(); } catch {}
    if (!r.ok) {
      const err = new Error((data && data.error) || `${r.status} ${r.statusText}`);
      err.status = r.status; err.data = data;
      throw err;
    }
    return data;
  }
  const json = (path, body) => req(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  return {
    health: () => req("/api/health"),
    chatStatus: () => req("/api/chat/status"),
    sample: (name) => req(`/api/sample-data/${encodeURIComponent(name)}`),
    upload: (file) => { const fd = new FormData(); fd.append("file", file); return req("/api/upload", { method: "POST", body: fd }); },
    uploadMany: (files) => { const fd = new FormData(); [...files].forEach((f) => fd.append("files", f)); return req("/api/upload", { method: "POST", body: fd }); },
    extract: (rfpText, criteria) => json("/api/extract-requirements", { rfpText, criteria }),
    analyze: (rfpText, proposalText, criteria, requirements) => json("/api/analyze", { rfpText, proposalText, criteria, requirements }),
    fixes: (rfpText, proposalText, analysis) => json("/api/suggest-fixes", { rfpText, proposalText, analysis }),
    validate: (rfpText) => json("/api/validate", { rfpText }),
    benchFixture: (name) => req(`/api/bench-fixture/${encodeURIComponent(name)}`),
    chat: (payload) => json("/api/chat", payload),
  };
})();
