/* Companion integration for the canonical /lens. Loaded before the hosted app.
   The web app owns every screen, word, action and purchase; this adds nothing visible.
   It supplies glasses-camera frames locally (no camera -> server -> phone round trip),
   reports camera status to the lens, opens the phone wallet, and asks the phone to
   resend the display when the page changes without a new lens revision. */
(() => {
  const native = window.webkit?.messageHandlers?.glanceNative;
  if (!native) return;
  const post = (message) => Promise.resolve(native.postMessage(message));
  const originalFetch = window.fetch.bind(window);
  let scheduled = false;

  function refreshSoon() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; post({ type: 'refresh' }); });
  }

  window.glanceCompanion = {
    cameraState: { ready: false, message: 'Connecting your glasses…' },
    camera(value) {
      this.cameraState = value;
      window.dispatchEvent(new CustomEvent('glance:camera', { detail: value }));
    },
    sync: refreshSoon,
    walletReturned() {
      // Let the app's existing wallet action refresh its state; preserve the session/cart.
      const bridge = window.glanceBridge;
      if (!bridge) return;
      const state = bridge.getState();
      if (state.actions.some(a => a.id === 'hdr-wallet')) bridge.activate('hdr-wallet', state.revision);
    },
  };

  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin !== location.origin || url.pathname !== '/api/relay/frame' || (init?.method ?? 'GET') !== 'GET') return originalFetch(input, init);
    const signal = init?.signal || (input instanceof Request ? input.signal : null);
    signal?.throwIfAborted();
    const frame = await post({ type: 'frame' });
    signal?.throwIfAborted();
    return new Response(JSON.stringify(frame), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  // Clicking the existing wallet handoff also opens the phone sheet, even from glasses.
  document.addEventListener('click', e => {
    if (e.target.closest?.('[data-action-id="w-setup"]')) post({ type: 'wallet' });
  }, true);
  // Images and text that change without a new lens revision still reach the glasses.
  // The phone skips any frame whose pixels match what the glasses already show.
  document.addEventListener('load', e => { if (e.target instanceof HTMLImageElement) refreshSoon(); }, true);
  new MutationObserver(refreshSoon).observe(document, { subtree: true, childList: true, characterData: true });
})();
