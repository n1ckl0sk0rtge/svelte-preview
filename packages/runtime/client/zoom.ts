const minimum = 0.25;
const maximum = 4;
const steps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const storageKey = 'svelte-preview.zoom';

export function attachCanvasZoom(grid: HTMLElement) {
  // Keep the actual iframe dimensions intact so zoom never changes responsive breakpoints.
  const views = Array.from(grid.querySelectorAll<HTMLElement>('.sp-preview')).map((view) => ({
    view,
    viewport: view.querySelector<HTMLElement>('.sp-viewport')!,
    frame: view.querySelector<HTMLIFrameElement>('.sp-frame')!
  }));
  let scale = 1;
  try {
    const saved = Number(sessionStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= minimum && saved <= maximum) scale = saved;
  } catch {
    // Zoom remains usable when browser storage is unavailable.
  }
  let renderPending = false;
  let wheelZoomEnabled = false;
  const inputWindows = new Set<Window>();

  // Float a compact control over the canvas instead of adding another header or toolbar row.
  const controls = document.createElement('div');
  controls.className = 'sp-zoom';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Preview zoom');
  const button = (text: string, label: string) => {
    const result = document.createElement('button');
    result.type = 'button';
    result.textContent = text;
    result.title = label;
    result.setAttribute('aria-label', label);
    return result;
  };
  const zoomOut = button('−', 'Zoom out');
  const reset = button('100%', 'Reset zoom to 100%');
  const zoomIn = button('+', 'Zoom in');
  reset.className = 'sp-zoom-value';
  controls.append(zoomOut, reset, zoomIn);

  function apply(next: number) {
    // Accumulate gesture input immediately, then render at most once per screen refresh.
    scale = Math.min(maximum, Math.max(minimum, Math.round(next * 100) / 100));
    if (renderPending) return;
    renderPending = true;
    window.requestAnimationFrame(render);
  }

  function render() {
    // Resize the frame's outer footprint while scaling its contents without remounting them.
    renderPending = false;
    for (const { view, viewport, frame } of views) {
      const width = `${Number(frame.width) * scale}px`;
      view.style.width = width;
      viewport.style.width = width;
      viewport.style.height = `${Number(frame.height) * scale}px`;
      frame.style.transform = `scale(${scale})`;
    }

    // Keep captions and controls readable at every zoom and remember zoom across live reloads.
    reset.textContent = `${Math.round(scale * 100)}%`;
    zoomOut.disabled = scale <= minimum;
    zoomIn.disabled = scale >= maximum;
    try {
      sessionStorage.setItem(storageKey, String(scale));
    } catch {
      // A storage restriction must not interrupt canvas interactions.
    }
  }

  function step(direction: number) {
    const next = direction > 0 ? steps.find((value) => value > scale)
      : [...steps].reverse().find((value) => value < scale);
    if (next !== undefined) apply(next);
  }

  function keydown(event: KeyboardEvent) {
    // Install cancellable wheel handlers only while the user explicitly holds a zoom modifier.
    setWheelZoom(event.ctrlKey || event.metaKey);

    // Leave editing shortcuts in component inputs alone, including inputs inside child frames.
    const target = event.target as Element | null;
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey
      || target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if (!['+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === '0') apply(1);
    else step(event.key === '-' ? -1 : 1);
  }

  function wheel(event: WheelEvent) {
    // A released modifier must not leave subsequent ordinary scrolls waiting on JavaScript.
    if (!(event.ctrlKey || event.metaKey)) {
      setWheelZoom(false);
      return;
    }

    // Ctrl/Command + scroll zooms the canvas rather than the browser document.
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
    apply(scale * Math.exp(-pixels * 0.01));
  }

  function setWheelZoom(enabled: boolean) {
    // With no wheel listener installed, Chromium can scroll the canvas on its compositor thread.
    if (wheelZoomEnabled === enabled) return;
    wheelZoomEnabled = enabled;
    for (const input of inputWindows) {
      try {
        if (enabled) input.addEventListener('wheel', wheel, { passive: false });
        else input.removeEventListener('wheel', wheel);
      } catch {
        // A component may have navigated its frame to another origin since it was bound.
        inputWindows.delete(input);
      }
    }
  }

  function bindInput(input: Window) {
    // Keep modifier state in sync across frame focus changes and missed key releases outside the IDE.
    inputWindows.add(input);
    input.addEventListener('keydown', keydown);
    input.addEventListener('keyup', event => setWheelZoom(event.ctrlKey || event.metaKey));
    input.addEventListener('pointermove', event => setWheelZoom(event.ctrlKey || event.metaKey), { passive: true });
    input.addEventListener('blur', () => setWheelZoom(false));
    if (wheelZoomEnabled) input.addEventListener('wheel', wheel, { passive: false });
  }

  // Apply the same zoom gestures over both the canvas and the interactive component documents.
  zoomOut.onclick = () => step(-1);
  zoomIn.onclick = () => step(1);
  reset.onclick = () => apply(1);
  bindInput(window);
  for (const { frame } of views) {
    frame.addEventListener('load', () => {
      try {
        if (frame.contentWindow) bindInput(frame.contentWindow);
      } catch {
        // A component can navigate its iframe away from the local preview origin.
      }
    });
  }
  apply(scale);
  grid.after(controls);
}
