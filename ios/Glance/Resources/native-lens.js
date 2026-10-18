/* Companion integration for the canonical /lens. Loaded before the hosted app.
   The web app still owns screens, actions and purchases. Native frames avoid a
   camera -> server -> phone round trip; request status is based on actual work. */
(() => {
  const native = window.webkit?.messageHandlers?.glanceNative;
  if (!native) return;
  const post = (message) => Promise.resolve(native.postMessage(message));
  const originalFetch = window.fetch.bind(window);
  let camera = { ready: false, message: 'Connect your glasses on the phone.' };
  let sequence = 0, scheduled = false, previousActivity = '', lastScreen = '';
  const requests = new Map(), results = new Map();
  const scopeFor = (screen) => screen.startsWith('grocery') ? 'grocery'
    : screen.startsWith('gourmet') ? 'gourmet'
    : /offers|listings/.test(screen) ? 'listings' : 'glimpse';
  const requestInfo = (path) => {
    // Local camera frames return in milliseconds; announcing them would only flash the display.
    if (path === '/api/relay/frame') return { scope: scopeFor(document.querySelector('.lens')?.dataset.screen || ''), title: 'Capturing a fresh image…', quiet: true };
    // The 3-second grocery sampler is background work: the phone may describe it, the glasses stay steady.
    if (path === '/api/glance/grocery') return { scope: 'grocery', title: 'Identifying your item…', background: true };
    if (path === '/api/glance/grocery/item') return { scope: 'grocery', title: 'Checking price and nutrition…' };
    if (path === '/api/glance/glimpse') return { scope: 'glimpse', title: 'Identifying what you see…' };
    if (path === '/api/glance/gourmet') return { scope: 'gourmet', title: 'Identifying your dish…' };
    if (path === '/api/glance/recipes') return { scope: 'gourmet', title: 'Finding recipes…' };
    if (/^\/api\/glance\/(listings|offers)$/.test(path)) return { scope: 'listings', title: 'Searching listings…' };
    return null;
  };
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  }
  function render() {
    const lens = document.querySelector('.lens');
    if (!lens) return;
    const screen = lens.dataset.screen || '';
    if (lastScreen !== screen) { results.clear(); lastScreen = screen; }
    const scope = scopeFor(screen);
    const active = [...requests.values()].filter(r => r.scope === scope && !r.quiet);
    const running = active.at(-1);
    // Banner text shown on the glasses ignores background sampling; the phone activity line does not.
    const foreground = active.filter(r => !r.background).at(-1);
    const last = results.get(scope);
    const scan = lens.querySelector('[data-action-id="scan"]');
    const paused = /Start scan|Scan more/.test(scan?.textContent || '') || /Scan paused/.test(lens.querySelector('.lens-status')?.textContent || '');
    let title = '', detail = '';
    if (screen === 'grocery' && paused) {
      title = 'Scanning paused'; detail = 'Choose Start scan in More to continue.';
      if (scan) detail = 'Choose Start scan to look for items.';
    } else if (screen === 'grocery' && !camera.ready) {
      title = 'Camera not ready'; detail = camera.message;
    } else if (running) {
      title = running.title; detail = scope === 'listings' ? 'Results appear as they arrive.' : 'Keep the item steady and in view.';
    } else if (last?.error) {
      title = scope === 'listings' ? 'Couldn’t load listings' : 'Couldn’t finish the scan'; detail = last.error;
    } else if (screen === 'grocery') {
      title = 'Scanning is on';
      detail = last?.empty ? 'Move closer and show the label. Scanning continues.' : 'Hold up an item. Only items added count in your cart.';
    } else if (/offers|listings/.test(screen)) {
      const text = lens.innerText;
      if (/couldn.t|failed|error/i.test(text)) { title = 'Couldn’t load listings'; detail = 'Choose Retry to search again.'; }
      else if (/No listings|No offers/.test(text)) { title = 'No listings found'; detail = 'Try a different product name.'; }
      else if (/searching|comparing/i.test(text)) { title = 'Searching listings…'; detail = 'Results appear as they arrive.'; }
      else if (lens.querySelector('.lens-offer')) { title = 'Listings ready'; detail = 'Choose a listing to see its details.'; }
      else { title = 'Search by name'; detail = 'Enter a product, then choose Search.'; }
    } else if (screen === 'glimpse' || screen === 'gourmet') {
      title = camera.ready ? 'Camera ready' : 'Camera not ready';
      detail = camera.ready ? 'Choose Scan to identify what you see.' : camera.message;
    } else if (screen === 'wallet') { title = 'Your wallet'; detail = 'Set up or manage your card on the phone.'; }
    else { title = 'Ready'; detail = 'The outlined button is selected.'; }

    // Grocery needs an always-visible status, including when its cart is empty.
    // Reuse the heading's space rather than adding another navigation bar.
    let banner = lens.querySelector('.glance-native-activity');
    const body = lens.querySelector('.lens-body');
    let bannerTitle = title, bannerDetail = detail;
    if (screen === 'grocery' && running?.background && !foreground) {
      bannerTitle = 'Scanning is on';
      bannerDetail = last?.empty ? 'Move closer and show the label. Scanning continues.' : 'Hold up an item. Only items added count in your cart.';
    }
    let changed = false;
    if (screen === 'grocery' && body) {
      if (!banner) {
        changed = true;
        banner = document.createElement('div'); banner.className = 'glance-native-activity';
        banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite');
        banner.innerHTML = '<strong></strong><span></span>';
        body.prepend(banner);
      }
      if (banner.firstChild.textContent !== bannerTitle) { banner.firstChild.textContent = bannerTitle; changed = true; }
      if (banner.lastChild.textContent !== bannerDetail) { banner.lastChild.textContent = bannerDetail; changed = true; }
    } else if (banner) { banner.remove(); changed = true; }
    // Phone-only status never costs a Bluetooth image; only a visible banner change does.
    if (changed) post({ type: 'refresh' });
    const activity = JSON.stringify({ type: 'activity', title, detail });
    if (activity !== previousActivity) {
      previousActivity = activity;
      window.webkit.messageHandlers.glance.postMessage(JSON.parse(activity));
    }
  }
  window.glanceCompanion = {
    camera: (value) => { camera = value; schedule(); },
    sync: schedule,
    walletReturned: () => {
      // Let the app's existing wallet action refresh its state; preserve the session/cart.
      const bridge = window.glanceBridge;
      if (!bridge) return;
      const state = bridge.getState();
      if (state.actions.some(a => a.id === 'hdr-wallet')) bridge.activate('hdr-wallet', state.revision);
    },
  };
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin !== location.origin) return originalFetch(input, init);
    const info = requestInfo(url.pathname);
    if (!info) return originalFetch(input, init);
    const id = ++sequence;
    requests.set(id, info); schedule();
    try {
      let response;
      if (url.pathname === '/api/relay/frame') {
        const signal = init?.signal || (input instanceof Request ? input.signal : null);
        signal?.throwIfAborted();
        const frame = await post({ type: 'frame' });
        signal?.throwIfAborted();
        response = new Response(JSON.stringify(frame), { status: 200, headers: { 'content-type': 'application/json' } });
      } else response = await originalFetch(input, init);
      if (!response.ok) throw new Error(response.status === 429 ? 'Service busy. Try again shortly.' : 'Check your connection, then try again.');
      // Inspect a copy. The app retains the original response and owns all domain changes.
      if (url.pathname === '/api/glance/grocery') {
        const data = await response.clone().json();
        results.set(info.scope, { empty: !data.observations?.length, recognized: !!data.observations?.length });
      } else results.delete(info.scope);
      return response;
    } catch (error) {
      if (error?.name !== 'AbortError') results.set(info.scope, { error: String(error.message || error) });
      throw error;
    } finally { requests.delete(id); schedule(); }
  };
  // Clicking the existing wallet handoff also opens the phone sheet, even from glasses.
  document.addEventListener('click', e => {
    if (e.target.closest?.('[data-action-id="w-setup"]')) post({ type: 'wallet' });
  }, true);
  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => !m.target.closest?.('.glance-native-activity'))) schedule();
  });
  observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-revision', 'data-screen'] });
})();
