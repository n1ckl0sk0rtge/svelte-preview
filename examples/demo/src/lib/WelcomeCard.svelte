<script>
  let greeted = $state(false);
</script>

<article class="welcome-card">
  <h2>Welcome to the studio</h2>
  <p>A small component, ready for its first preview.</p>
  <button aria-pressed={greeted} onclick={() => greeted = !greeted}>
    {greeted ? 'Hello!' : 'Say hello'}
  </button>
</article>

<style>
  .welcome-card {
    box-sizing: border-box;
    width: 100%;
    max-width: 420px;
    padding: 24px;
    border: 1px solid color-mix(in srgb, CanvasText 16%, Canvas);
    border-radius: 12px;
    background: Canvas;
    color: CanvasText;
  }

  h2 { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.3; }
  p { margin: 10px 0 20px; color: GrayText; font-size: 13px; line-height: 1.55; }
  button { padding: 8px 12px; border: 1px solid color-mix(in srgb, CanvasText 24%, Canvas); border-radius: 6px; background: Canvas; color: CanvasText; font: inherit; font-size: 12px; cursor: pointer; }
  button:hover, button[aria-pressed="true"] { background: color-mix(in srgb, CanvasText 8%, Canvas); }
  button:focus-visible { outline: 2px solid Highlight; outline-offset: 3px; }
</style>
