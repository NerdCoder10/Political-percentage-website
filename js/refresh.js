// Keeps an open page current: every 30 minutes, re-load data/generated/version.js (a hash of all
// data files, updated by the scheduled refresh job) and reload the page when it has changed.
// The URL hash holds the current view, so the reload returns to the same state, county or race list.
(function () {
  const INTERVAL_MS = 30 * 60 * 1000;
  const loaded = globalThis.DATA_VERSION?.version;

  let lastCheck = Date.now();
  function check() {
    lastCheck = Date.now();
    const s = document.createElement("script");
    s.src = `data/generated/version.js?t=${Date.now()}`; // cache-busting; works on file:// too
    s.onload = () => {
      s.remove();
      const latest = globalThis.DATA_VERSION?.version;
      if (loaded && latest && latest !== loaded) notifyAndReload();
    };
    s.onerror = () => s.remove(); // offline or file missing: try again next interval
    document.head.appendChild(s);
  }

  function notifyAndReload() {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.textContent = "New data available — updating…";
    document.body.appendChild(toast);
    setTimeout(() => location.reload(), 1500);
  }

  setInterval(check, INTERVAL_MS);
  // Browsers throttle timers in background tabs; check as soon as the tab is visible again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastCheck > INTERVAL_MS) check();
  });
})();
