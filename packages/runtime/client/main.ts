import { flushSync, mount, unmount } from 'svelte';
import type { Component } from 'svelte';
import type { PreviewDefinition, PreviewSetup, PreviewTheme, PreviewViewport } from '../index.js';
import './shell.css';
import { initializeTheme, previewLink } from './theme.js';
import { attachCanvasZoom } from './zoom.js';
import { observePreviewHeight } from './sizing.js';
import PreviewRoot from './PreviewRoot.svelte';

// Establish the chosen appearance before mounting components or running their lifecycle callbacks.
initializeTheme(document.documentElement.dataset.previewTheme as PreviewTheme);

const parameters = new URLSearchParams(window.location.search);
const target = document.querySelector<HTMLDivElement>('#app')!;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function reportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  target.replaceChildren(element('pre', 'sp-error', message));
  if (parameters.has('metadata')) {
    window.parent.postMessage({ type: 'svelte-preview:error', message }, window.location.origin);
  }
}

function shell() {
  // Scope the gallery styling so imported project CSS is confined to the iframe content.
  document.body.classList.add('sp-shell');
}

async function showComponents() {
  // Keep a useful standalone landing screen when the runtime is launched outside the IDE.
  shell();
  const response = await fetch('/__preview/components');
  if (!response.ok) throw new Error('Could not discover component previews.');
  const components: string[] = await response.json();
  const list = element('nav', 'sp-components');
  for (const file of components) {
    const link = element('a', 'sp-component', file);
    link.href = previewLink('/', { file });
    list.append(link);
  }

  // Explain an empty component list without suggesting preview definitions already exist.
  if (!components.length) {
    list.append(element('p', 'sp-empty', 'No Svelte components found in this project.'));
  }
  target.append(list);
}

export function showMissingPreview(file: string) {
  // Let a gallery recover if the preview was deleted while its metadata frame was loading.
  if (parameters.has('metadata')) {
    window.parent.postMessage({ type: 'svelte-preview:missing' }, window.location.origin);
    return;
  }

  // Keep the empty state on the same themed canvas as the previews it will replace.
  shell();
  const filename = file.split('/').pop()!.replace(/\.svelte$/, '.preview.ts');
  const section = element('section', 'sp-setup');
  const heading = element('h1', 'sp-setup-title', 'No preview yet');
  heading.id = 'sp-setup-title';
  section.setAttribute('aria-labelledby', heading.id);
  const description = element('p', 'sp-empty', `Create ${filename} to define this component’s states and props.`);
  const button = element('button', 'sp-create', 'Create preview');
  button.type = 'button';
  const status = element('p', 'sp-setup-status');
  status.setAttribute('role', 'alert');

  // Create the neighboring definition on request, then load its default preview.
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = 'Creating preview…';
    status.textContent = '';
    try {
      const response = await fetch(`/__preview/create?${new URLSearchParams({ file })}`, {
        method: 'POST',
        headers: { 'X-Svelte-Preview': 'create' }
      });
      if (!response.ok) throw new Error(await response.text());
      window.location.reload();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
      button.disabled = false;
      button.textContent = 'Create preview';
    }
  };
  section.append(heading, description, button, status);
  target.replaceChildren(section);
}

export function boot(definition: PreviewDefinition<Component<any>>, defaultViewport: PreviewViewport, projectSetup?: PreviewSetup) {
  try {
    // Discover state names inside an isolated document so component global CSS never reaches the gallery.
    if (parameters.has('metadata')) {
      const states = Object.entries(definition.states).map(([name, state]) => ({ name, viewport: state.viewport ?? defaultViewport }));
      window.parent.postMessage({ type: 'svelte-preview:manifest', states }, window.location.origin);
      return;
    }

    // A frame imports and mounts its own copy of the definition, keeping module state separate.
    if (window.location.pathname === '/__preview/frame') {
      const stateName = parameters.get('state') ?? '';
      const state = definition.states[stateName];
      if (!state) throw new Error(`Unknown preview state: ${stateName}`);
      document.body.style.margin = '0';
      const stopSizing = (state.viewport ?? defaultViewport) === 'auto' ? observePreviewHeight(target) : undefined;
      const instance = mount(PreviewRoot, {
        target,
        props: { component: definition.component, props: state.props, projectSetup, setup: state.setup }
      });
      flushSync();

      // Run Svelte destruction hooks and preview cleanup on refresh or navigation, preserving bfcache restores.
      window.addEventListener('pagehide', (event) => {
        if (!event.persisted) {
          stopSizing?.();
          void unmount(instance).catch(reportError);
        }
      });
      window.addEventListener('error', (event) => reportError(event.error ?? event.message));
      window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
      return;
    }
  } catch (error) {
    reportError(error);
  }
}

export function showGallery() {
  // Load only serializable metadata into the shell; component code and CSS stay in child documents.
  shell();
  const probe = element('iframe', 'sp-probe');
  probe.title = 'Preview state discovery';
  probe.hidden = true;
  const file = parameters.get('file')!;
  probe.src = previewLink('/__preview/frame', { file, metadata: '1' });
  const loading = element('p', 'sp-empty', 'Compiling component previews…');
  target.append(loading);
  let settled = false;
  const timeout = window.setTimeout(() => {
    if (settled) return;
    loading.textContent = 'Still compiling. Check the runtime output or the compilation error below.';
    probe.hidden = false;
  }, 15000);

  // Accept messages only from this gallery's metadata frame and the local preview origin.
  window.addEventListener('message', (event: MessageEvent) => {
    if (settled || event.origin !== window.location.origin || event.source !== probe.contentWindow) return;
    if (event.data?.type === 'svelte-preview:error') {
      settled = true;
      window.clearTimeout(timeout);
      reportError(event.data.message);
      return;
    }
    if (event.data?.type === 'svelte-preview:missing') {
      settled = true;
      window.clearTimeout(timeout);
      showMissingPreview(file);
      return;
    }
    if (event.data?.type !== 'svelte-preview:manifest') return;
    settled = true;
    window.clearTimeout(timeout);
    const states: { name: string; viewport: PreviewViewport }[] = event.data.states;
    target.replaceChildren();
    const grid = element('main', 'sp-grid');
    target.append(grid);
    for (const { name, viewport } of states) {
      // Automatic previews fill a canvas row; explicit viewports keep their device dimensions.
      const view = element('figure', 'sp-preview');
      if (viewport === 'auto') view.dataset.autoSize = 'true';
      const frame = element('iframe', 'sp-frame');
      frame.title = `${name} preview`;
      frame.width = String(viewport === 'auto' ? Math.max(1, Math.floor(grid.clientWidth)) : viewport.width);
      frame.height = String(viewport === 'auto' ? 1 : viewport.height);
      frame.src = previewLink('/__preview/frame', { file, state: name });
      const canvas = element('div', 'sp-viewport');
      canvas.append(frame);
      view.append(canvas, element('figcaption', 'sp-caption', name));
      grid.append(view);
    }
    attachCanvasZoom(grid);
  });
  target.append(probe);
}

if (!parameters.has('file')) void showComponents().catch(reportError);
