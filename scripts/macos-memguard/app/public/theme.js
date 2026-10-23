// Apply the saved appearance before CSS loads to avoid a light flash.
(() => {
  const key = 'memguard.theme';
  let theme = 'dark';
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (error) {
    // Storage may be disabled. The switch still works for the current page.
    console.info('MemGuard: Darstellung wird nur für diese Seite gespeichert.', error.name);
  }
  function apply(value) {
    theme = value;
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      document.getElementById('theme-label').textContent = theme === 'dark' ? 'Schwarz' : 'Hell';
    }
    document.dispatchEvent(new Event('memguard:themechange'));
  }
  apply(theme);
  document.addEventListener('DOMContentLoaded', () => {
    apply(theme);
    document.getElementById('theme-toggle').addEventListener('click', () => {
      apply(theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem(key, theme); }
      catch (error) { console.info('MemGuard: Darstellung konnte nicht dauerhaft gespeichert werden.', error.name); }
    });
  });
  window.addEventListener('storage', event => {
    if (event.key === key) apply(event.newValue === 'light' ? 'light' : 'dark');
  });
})();
