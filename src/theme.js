import { createIcons, Moon, Sun } from 'lucide';

const THEME_KEY = 'iladitquoi.theme';
const ICONS = { Moon, Sun };

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function renderThemeControls() {
  const light = currentTheme() === 'light';
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-label', light ? 'Passer au thème sombre' : 'Passer au thème clair');
    button.setAttribute('title', light ? 'Passer au thème sombre' : 'Passer au thème clair');
    button.setAttribute('aria-pressed', String(light));
    const icon = document.createElement('i');
    icon.dataset.lucide = light ? 'moon' : 'sun';
    button.replaceChildren(icon);
    createIcons({ icons: ICONS, root: button, attrs: { 'stroke-width': 1.8 } });
  });
}

function applyTheme(theme, persist = true) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, nextTheme); } catch { /* storage may be unavailable */ }
  }
  renderThemeControls();
  window.dispatchEvent(new CustomEvent('iladitquoi:theme', { detail: { theme: nextTheme } }));
}

function initialize() {
  let savedTheme = '';
  try { savedTheme = localStorage.getItem(THEME_KEY) || ''; } catch { /* storage may be unavailable */ }
  applyTheme(savedTheme || currentTheme(), false);
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light'));
  });
  renderThemeControls();
}

initialize();
