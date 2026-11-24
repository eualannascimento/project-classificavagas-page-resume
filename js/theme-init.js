(function () {
  'use strict';

  const THEMES = ['light', 'dark', 'black'];
  const THEME_META = {
    light: '#f2f2f3',
    dark: '#1a1a24',
    black: '#000000'
  };

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function applyTheme(theme) {
    if (!THEMES.includes(theme)) theme = 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_META[theme] || THEME_META.light);
  }

  const savedTheme = readStorage('cv_theme');
  let initialTheme = 'light';
  if (savedTheme && THEMES.includes(savedTheme)) {
    initialTheme = savedTheme;
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    initialTheme = 'dark';
  }
  applyTheme(initialTheme);

  window.cvThemeInit = {
    THEMES,
    THEME_META,
    applyTheme,
    cycleTheme() {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const idx = THEMES.indexOf(current);
      const next = THEMES[(idx + 1) % THEMES.length];
      applyTheme(next);
      try {
        localStorage.setItem('cv_theme', next);
      } catch { /* ignore */ }
      return next;
    }
  };
}());
