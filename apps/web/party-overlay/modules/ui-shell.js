  const badgesContainer = document.createElement("div");
  badgesContainer.className = "badges-container";
  badgesContainer.innerHTML = `
    <div class="floating-pill video-pill hidden" id="ju-video-pill">
      <span class="status-dot idle" id="ju-video-dot"></span>
      <span id="ju-video-pill-text">📹 Video Call</span>
    </div>
    <div class="floating-pill" id="ju-party-pill">
      <span class="status-dot idle" id="ju-status-dot"></span>
      <span id="ju-pill-text">🎉 Watch Party</span>
    </div>
  `;
  shadow.appendChild(badgesContainer);

  const partyPill = shadow.getElementById("ju-party-pill");
  const videoPill = shadow.getElementById("ju-video-pill");

  // Drawer Overlay Element (stays in Shadow DOM — no video inside)
  const drawer = document.createElement("div");
  drawer.className = "drawer-overlay";
  shadow.appendChild(drawer);

  function ensureOverlayMounted() {
    try {
      const existing = document.getElementById("justus-party-overlay-root");
      const target = document.body || document.documentElement;
      if (!existing && target) {
        target.appendChild(hostDiv);
      } else if (existing && target && existing.parentElement !== target) {
        target.appendChild(existing);
      }
    } catch (e) {}
  }
  let mountScheduled = false;
  function scheduleEnsureMounted() {
    if (mountScheduled) return;
    mountScheduled = true;
    requestAnimationFrame(() => {
      mountScheduled = false;
      ensureOverlayMounted();
    });
  }

  if (document.body || document.documentElement) ensureOverlayMounted();
  window.__JUSTUS_ENSURE_MOUNTED__ = ensureOverlayMounted;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureOverlayMounted);
  }
  window.addEventListener("yt-navigate-finish", ensureOverlayMounted);
  window.addEventListener("popstate", ensureOverlayMounted);
  window.addEventListener("load", ensureOverlayMounted);
  try {
    const observer = new MutationObserver(() => {
      if (!document.getElementById("justus-party-overlay-root")) scheduleEnsureMounted();
    });
    observer.observe(document.documentElement, { childList: true, subtree: false });
  } catch (e) {}

  let isDrawerOpen = false;

  function openDrawer() {
    try { isDrawerOpen = true; drawer.classList.add("open"); renderDrawerContent(); } catch {}
  }
  function closeDrawer(e) {
    if (e) { try { e.preventDefault(); e.stopPropagation(); } catch {} }
    isDrawerOpen = false;
    drawer.classList.remove("open");
  }
  function toggleDrawer() {
    if (isDrawerOpen || drawer.classList.contains("open")) closeDrawer();
    else openDrawer();
  }

  // Badge taps — bindOverlayTap avoids double-fire on iPad
  bindOverlayTap(partyPill, () => toggleDrawer());
  bindOverlayTap(videoPill, () => toggleVideoCallWindow());

  // Prevent touches inside drawer from reaching the streaming page
  drawer.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: false });
  drawer.addEventListener("touchmove",  (e) => e.stopPropagation(), { passive: false });
  drawer.addEventListener("touchend",   (e) => e.stopPropagation(), { passive: false });
  drawer.addEventListener("click",      (e) => e.stopPropagation());

  // ─────────────────────────────────────────────────────────────────
  // NOTE: The video call PIP window is built in document.body by
  // livekit.js so that iOS WKWebView applies its inline-playback
  // policy to the <video> elements (Shadow DOM blocks inline playback).
  // ─────────────────────────────────────────────────────────────────
