if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // Optional for GitHub Pages. The landing page still works without it.
    });
  });
}
