import './shell.css';
import { initializeTheme } from './theme.js';
import type { PreviewTheme } from '../index.js';

// Show the paused screen using the same appearance as the preview gallery.
initializeTheme(document.documentElement.dataset.previewTheme as PreviewTheme);
document.body.classList.add('sp-shell');
const button = document.querySelector<HTMLButtonElement>('#sp-resume')!;
const status = document.querySelector<HTMLParagraphElement>('#sp-resume-status')!;
button.disabled = false;

button.onclick = async () => {
  // Wait for the server to accept the resume action before requesting the current preview.
  button.disabled = true;
  status.textContent = '';
  try {
    const response = await fetch('/__preview/resume', {
      method: 'POST',
      headers: { 'X-Svelte-Preview': 'resume' }
    });
    if (!response.ok) throw new Error(await response.text());
    window.location.reload();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    button.disabled = false;
  }
};
