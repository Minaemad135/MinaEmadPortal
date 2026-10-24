(function () {
  const KEY = "mina.settings";

  const DEFAULTS = {
    theme: "auto",
    design: "classic",
  };

  const THEMES = ["auto", "midnight", "daylight", "ocean", "sunset", "forest", "amoled", "nord"];
  const DESIGNS = ["classic", "minimal", "rounded", "sharp", "glass"];
  const DARK_THEMES = ["midnight", "ocean", "sunset", "forest", "amoled", "nord"];
  const LIGHT_THEME = "daylight";
  const DARK_THEME = "midnight";
  const AUTO_THEME_KEY = "mina.theme.auto"; 

  function getSystemTheme() {
    if (typeof window === "undefined" || !window.matchMedia) return DARK_THEME;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? LIGHT_THEME : DARK_THEME;
  }

  function resolveTheme(theme) {
    if (theme === "auto") {
      return getSystemTheme();
    }
    return THEMES.includes(theme) && theme !== "auto" ? theme : DEFAULTS.theme === "auto" ? getSystemTheme() : DEFAULTS.theme;
  }

  function read() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function normalize(raw) {
    const s = { ...DEFAULTS, ...raw };
    const theme = THEMES.includes(s.theme) ? s.theme : DEFAULTS.theme;
    const design = DESIGNS.includes(s.design) ? s.design : DEFAULTS.design;
    return { theme, design };
  }

  let settings = normalize(read());

  function apply() {
    const root = document.documentElement;
    const resolved = resolveTheme(settings.theme);
    root.dataset.theme = resolved;
    root.dataset.themePref = settings.theme;
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
    if (settings.theme === "auto") {
      return getSystemTheme() !== LIGHT_THEME;
    }
    if (settings.theme === LIGHT_THEME) return false;
    if (DARK_THEMES.includes(settings.theme)) return true;
    return false;
  }

  function initToggle() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    function update() {
      const dark = isDark();
      btn.textContent = dark ? "\u2600" : "\u263E";
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", settings.theme === "auto" ? "Auto theme (toggle to manual)" : dark ? "Switch to light mode" : "Switch to dark mode");
      btn.title = settings.theme === "auto" ? "Auto (system)" : dark ? "Light mode" : "Dark mode";
    }

    btn.addEventListener("click", () => {
      if (settings.theme === "auto") {
        save({ theme: DARK_THEME });
        return;
      }
      if (isDark()) {
        save({ theme: LIGHT_THEME });
        return;
      }
      save({ theme: DARK_THEME });
    });

    document.addEventListener("minasettings:change", update);
    update();

    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const handler = () => {
        if (settings.theme === "auto") {
          apply();
          emit();
        }
        update();
      };
      if (mq.addEventListener) {
        mq.addEventListener("change", handler);
      } else if (mq.addListener) {
        mq.addListener(handler);
      }
    }
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
    apply,
    resolveTheme,
    getSystemTheme,
    defaults: { ...DEFAULTS },
    themes: THEMES.slice(),
    designs: DESIGNS.slice(),
  };
})();
