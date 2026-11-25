export function observePreviewHeight(target: HTMLElement) {
  // Contain child margins so the root's height reflects the complete component flow.
  target.style.display = 'flow-root';

  // A standalone preview scrolls in the browser; only an embedded preview reports its height.
  if (window.parent === window) return;
  document.documentElement.style.overflowY = 'hidden';
  let lastHeight = 0;
  let pending: number | undefined;

  function measure() {
    // Measure content rather than document height, which cannot shrink below the current iframe.
    pending = undefined;
    const height = Math.max(1, Math.ceil(Math.max(target.getBoundingClientRect().height, target.scrollHeight)));
    if (height === lastHeight) return;
    lastHeight = height;
    window.parent.postMessage({ type: 'svelte-preview:resize', height }, window.location.origin);
  }

  function schedule() {
    if (pending === undefined) pending = window.requestAnimationFrame(measure);
  }

  // Follow wrapping, async content, images, and fonts without polling the preview.
  const observer = new ResizeObserver(schedule);
  observer.observe(target);
  schedule();

  return () => {
    observer.disconnect();
    if (pending !== undefined) window.cancelAnimationFrame(pending);
  };
}
