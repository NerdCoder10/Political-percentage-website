// Installable-app support: registers the service worker and offers an "Install app" button.
(function () {
  const embedded = window.top !== window; // e.g. inside a preview frame: no service worker there
  if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !embedded) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone || embedded) return;
  const btn = document.getElementById("install-btn");
  const help = document.getElementById("install-help");
  if (!btn || !help) return;

  // Android / desktop Chrome and Edge: use the browser's install prompt.
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  window.addEventListener("appinstalled", () => { btn.hidden = true; help.hidden = true; });

  // iPhone / iPad Safari has no install prompt: show the Share → Add to Home Screen steps instead.
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) btn.hidden = false;

  btn.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      btn.hidden = true;
    } else {
      help.hidden = !help.hidden;
    }
  });
  help.querySelector("button")?.addEventListener("click", () => { help.hidden = true; });
})();
