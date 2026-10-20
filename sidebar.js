(function () {
  const siteNav = document.getElementById("siteNav");
  const toggle = document.getElementById("menuToggle");
  if (!siteNav || !toggle) return;

  const scrim = document.createElement("div");
  scrim.className = "nav-scrim";
  scrim.setAttribute("aria-hidden", "true");
  document.body.appendChild(scrim);

  function setOpen(open) {
    siteNav.classList.toggle("open", open);
    document.body.classList.toggle("nav-open", open);
    scrim.classList.toggle("show", open);
    toggle.textContent = open ? "\u00d7" : "\u2630";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggle.title = open ? "Close menu" : "Menu";
  }

  const isOpen = () => siteNav.classList.contains("open");

  toggle.addEventListener("click", () => setOpen(!isOpen()));
  scrim.addEventListener("click", () => setOpen(false));
  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) setOpen(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900 && isOpen()) setOpen(false);
  });

  setOpen(false);
})();
