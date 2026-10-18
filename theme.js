(function () {
  const KEY = "mina.settings";

  const DEFAULTS = {
    theme: "midnight",
    design: "classic",
  };

  const THEMES = ["midnight", "daylight", "ocean", "sunset", "forest"];
  const DESIGNS = ["classic", "minimal", "rounded", "sharp", "glass"];
  const DARK_THEMES = ["midnight", "ocean", "sunset", "forest"];
  const LIGHT_THEME = "daylight";
  const DARK_THEME = "midnight";

  function read() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function normalize(raw) {
    const s = { ...DEFAULTS, ...raw };
    return {
      theme: THEMES.includes(s.theme) ? s.theme : DEFAULTS.theme,
      design: DESIGNS.includes(s.design) ? s.design : DEFAULTS.design,
    };
  }

  let settings = normalize(read());

  function apply() {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.design = settings.design;
  }

  function emit() {
    document.dispatchEvent(new CustomEvent("minasettings:change", { detail: { ...settings } }));
  }

  function save(partial) {
    settings = normalize({ ...settings, ...partial });
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch (e) {
      /* storage unavailable — keep in-memory only */
    }
    apply();
    emit();
    return { ...settings };
  }

  function reset() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
    settings = { ...DEFAULTS };
    apply();
    emit();
    return { ...settings };
  }

  apply();

  function isDark() {
    return DARK_THEMES.includes(settings.theme);
  }

  function initToggle() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    function update() {
      const dark = isDark();
      btn.textContent = dark ? "\u2600" : "\u263E";
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      btn.title = dark ? "Light mode" : "Dark mode";
    }

    btn.addEventListener("click", () => {
      if (window.MinaAuth && !window.MinaAuth.can("changeAppearance")) return;
      save({ theme: isDark() ? LIGHT_THEME : DARK_THEME });
    });

    document.addEventListener("minasettings:change", update);
    update();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initToggle);
  } else {
    initToggle();
  }

  window.MinaSettings = {
    get: () => ({ ...settings }),
    save,
    reset,
    isDark,
    defaults: { ...DEFAULTS },
    themes: THEMES.slice(),
    designs: DESIGNS.slice(),
  };
})();
