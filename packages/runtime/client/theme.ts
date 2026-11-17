import type { PreviewTheme } from '../index.js';

export function initializeTheme(configured: PreviewTheme = 'auto') {
  // Explicit preview configuration takes precedence over the IDE, then the browser preference.
  const ideTheme = new URLSearchParams(window.location.search).get('ideTheme');
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const theme = configured !== 'auto' ? configured
      : ideTheme === 'light' || ideTheme === 'dark' ? ideTheme
      : preference.matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.colorScheme = theme;
  };

  // Child frames inherit color-scheme for CSS media queries; classes also support selector-based themes.
  apply();
  if (configured === 'auto' && ideTheme !== 'light' && ideTheme !== 'dark') preference.addEventListener('change', apply);
}

export function previewLink(path: string, values: Record<string, string> = {}) {
  // Preserve the IDE preference while navigating, discovering states, and resetting individual frames.
  const query = new URLSearchParams(values);
  const ideTheme = new URLSearchParams(window.location.search).get('ideTheme');
  if (ideTheme === 'light' || ideTheme === 'dark') query.set('ideTheme', ideTheme);
  return query.size ? `${path}?${query}` : path;
}
