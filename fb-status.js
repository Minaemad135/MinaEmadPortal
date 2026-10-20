/* ---------- Firebase connection status badge ---------- */
/* Shows a small badge in the bottom corner when the app is NOT connected to
   Firestore, so silent failures (e.g. production rules denying access) are
   visible. Disappears once the connection is online. */

(function () {
  if (!window.MinaDB) return;

  const badge = document.createElement("div");
  badge.id = "fbStatus";
  badge.style.cssText = [
    "position:fixed",
    "left:16px",
    "bottom:16px",
    "z-index:9999",
    "display:none",
    "max-width:320px",
    "padding:.55rem .75rem",
    "border-radius:10px",
    "font:600 12px system-ui, sans-serif",
    "line-height:1.35",
    "color:#fff",
    "background:#b3261e",
    "box-shadow:0 6px 20px rgba(0,0,0,.35)",
    "cursor:pointer",
  ].join(";");
  badge.title = "Click to dismiss";

  let dismissed = false;
  badge.addEventListener("click", () => {
    dismissed = true;
    badge.style.display = "none";
  });

  function paint() {
    if (dismissed) return;
    if (window.MinaDB.isOnline()) {
      badge.style.display = "none";
      return;
    }
    const err = window.MinaDB.lastError || "";
    badge.textContent =
      "Not saving to Firebase — data is local only. " +
      (err && /permission|denied/i.test(err)
        ? "Firestore rules are denying access; publish the rules from firestore.rules."
        : "Open the console (F12) and check for [MinaDB] warnings.");
    badge.style.display = "block";
  }

  function mount() {
    if (document.body) document.body.appendChild(badge);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
  paint();

  window.MinaDB.ready().then(() => {
    paint();
    setInterval(paint, 3000);
  });
})();
