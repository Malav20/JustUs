export function buildTelepartySidebarHtml(userName: string, avatarColor: string): string {
  return `<div id="tp-sidebar-container">
  <!-- Collapsible Tab on left edge -->
  <button class="tp-sidebar-tab" id="btn-tab-toggle" title="Hide sidebar">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
  </button>

  <!-- Top Header Bar -->
  <div class="tp-topbar">
    <div class="tp-topbar-left">
      <div class="tp-brand-icon">JU</div>
      <div class="tp-badge-btn">JUSTUS</div>
    </div>

    <div class="tp-topbar-right">
      <div class="tp-counter">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        <span id="tp-participant-count">1</span>
      </div>

      <button class="tp-btn-icon" id="btn-toggle-video-call" title="Toggle Video Call">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
      </button>

      <button class="tp-btn-icon" id="btn-share-link" title="Copy Invite Link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
      </button>

      <button class="tp-btn-icon" id="btn-leave-party" title="Leave Party" style="color: #EF4444;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <div class="tp-user-circle" style="background: ${avatarColor};">
        ${userName.charAt(0).toUpperCase()}
      </div>
    </div>
  </div>

  <!-- 1-on-1 Video Call Panel (Hidden by default) -->
  <div class="tp-video-box hidden" id="tp-video-box-panel">
    <div class="tp-video-canvas">
      <div class="tp-waiting-overlay" id="waiting-overlay">
        <div class="tp-pulse-ring"></div>
        <span>Waiting for friend to join call...</span>
      </div>
      <video class="tp-remote-video" id="remote-feed" playsinline muted></video>
      <video class="tp-local-video-pip" id="local-feed" playsinline muted></video>
    </div>

    <div class="tp-video-toolbar">
      <div class="tp-av-actions">
        <button class="tp-av-btn" id="btn-mic" title="Mute/Unmute Mic">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        </button>
        <button class="tp-av-btn" id="btn-cam" title="Camera On/Off">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
        </button>
        <button class="tp-av-btn" id="btn-audio-settings" title="Audio & Volume Controls">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        </button>
      </div>

      <div class="tp-sync-badge" id="drift-badge">0ms</div>
    </div>

    <!-- Collapsible Audio & Call Volume Sliders -->
    <div class="tp-audio-panel hidden" id="tp-audio-panel">
      <div class="tp-slider-row">
        <span class="tp-slider-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          Friend Vol
        </span>
        <input type="range" class="tp-slider-input" id="slider-call-volume" min="0" max="100" value="80" />
        <span class="tp-slider-val" id="val-call-volume">80%</span>
      </div>
      <div class="tp-slider-row">
        <span class="tp-slider-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          My Mic
        </span>
        <input type="range" class="tp-slider-input" id="slider-mic-volume" min="0" max="100" value="100" />
        <span class="tp-slider-val" id="val-mic-volume">100%</span>
      </div>
    </div>
  </div>

  <!-- Chat / Event Log Feed -->
  <div class="tp-feed" id="chat-feed-container"></div>

  <!-- Reactions Row -->
  <div class="tp-reactions-bar">
    <button class="tp-emoji-btn" data-emoji="🥰">🥰</button>
    <button class="tp-emoji-btn" data-emoji="😡">😡</button>
    <button class="tp-emoji-btn" data-emoji="😭">😭</button>
    <button class="tp-emoji-btn" data-emoji="😂">😂</button>
    <button class="tp-emoji-btn" data-emoji="🤠">🤠</button>
    <button class="tp-emoji-btn" data-emoji="🔥">🔥</button>
  </div>

  <!-- Input Bar -->
  <form class="tp-input-row" id="tp-chat-form">
    <input type="text" class="tp-input-field" id="tp-chat-input" placeholder="Type a message..." autocomplete="off" />
    <button type="submit" class="tp-btn-send">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
    </button>
  </form>
</div>`;
}
