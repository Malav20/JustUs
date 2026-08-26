  // ─── JustUS Video Call PIP ─────────────────────────────────────────────────
  //
  // Architecture: The entire PIP window lives in document.body, never in the
  // Shadow DOM. This is the only way iOS WKWebView applies its inline-playback
  // policy to <video> elements.
  //
  // Camera: getUserMedia() directly — no LiveKit camera management.
  //   LiveKit is used only for signalling/transport (publishTrack).
  //   This prevents LiveKit's internal mute/restart logic from touching the
  //   track and causing the "flash then black" symptom on iOS WKWebView.
  //
  // Mute: mediaStreamTrack.enabled = false — instant, no re-acquire.
  // Camera off: same. Never call track.stop() mid-call on iOS.
  // Remote audio: track.attach() appended to body (not Shadow DOM).
  // ──────────────────────────────────────────────────────────────────────────

  // ── state ─────────────────────────────────────────────────────────────────
  let livekitRoom        = null;
  let lkLocalAudioTrack  = null;   // LiveKit LocalAudioTrack (mic)
  let lkLocalVideoTrack  = null;   // LiveKit LocalVideoTrack (published camera)
  let localCameraStream  = null;   // raw MediaStream from getUserMedia
  let remoteAudioEl      = null;   // <audio> in body for remote voice

  // The PIP container and its children (all in document.body)
  let pipContainer       = null;
  let pipRemoteVideo     = null;
  let pipLocalVideo      = null;
  let pipWaitOverlay     = null;
  let pipCtrlOverlay     = null;
  let pipStatusText      = null;

  let isVideoCallActive  = false;
  let isMicEnabled       = false;
  let isCamEnabled       = true;
  let currentFacingMode  = "user";
  let isLkConnecting     = false;
  let reconnectTimer     = null;
  let autoCallScheduled  = false;
  let userHungUp         = false;
  let ctrlHideTimer      = null;
  let captureUsesCombinedAv = false;
  let iosHeldAudioTrack     = null; // iOS: audio captured at join, published when mic tapped
  // Simple stroke icons for PIP controls (no emoji)
  const PIP_ICONS = {
    close: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    mic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  micOff: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-1.32"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
    cam: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>',
    camOff: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m2 2 20 20"/><path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/><path d="m9.5 7.5 3 2.5 3-2.5"/></svg>',
    flip: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>',
    end: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 1.72 1.84 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/></svg>',
  };

  const PIP_BTN = "width:32px;height:32px;border-radius:16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:manipulation;padding:0;";

  // ── identity ───────────────────────────────────────────────────────────────
  function getLkIdentity() {
    try {
      let id = sessionStorage.getItem("justus_lk_id");
      if (!id) { id = currentUserName + "_" + Math.random().toString(36).slice(2, 8); sessionStorage.setItem("justus_lk_id", id); }
      return id;
    } catch { return currentUserName + "_" + Math.random().toString(36).slice(2, 8); }
  }
  function clearLkIdentity() { try { sessionStorage.removeItem("justus_lk_id"); } catch {} }

  // ── SDK loader ─────────────────────────────────────────────────────────────
  function loadLiveKitSDK(cb) {
    if (window.LivekitClient) { cb(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/livekit-client@2.6.0/dist/livekit-client.umd.min.js";
    s.onload = () => { if (window.LivekitClient) cb(); };
    s.onerror = () => addEventLog("⚠️ Could not load video SDK", "System");
    (document.head || document.documentElement).appendChild(s);
  }

  // ── PIP DOM builder ────────────────────────────────────────────────────────
  // Everything here is a plain document.body element so iOS WKWebView inline-
  // playback policy applies. All styles are inline to prevent page CSS bleed.
  function buildPip() {
    if (document.getElementById("justus-pip")) return; // already built

    // ── container ────────────────────────────────────────────────────────────
    const pip = document.createElement("div");
    pip.id = "justus-pip";
    pip.style.cssText = [
      "position:fixed",
      "bottom:80px",
      "right:16px",
      "width:240px",
      "height:180px",
      "min-width:160px",
      "min-height:120px",
      "background:#090a14",
      "border-radius:16px",
      "border:1.5px solid rgba(255,255,255,0.22)",
      "box-shadow:0 12px 40px rgba(0,0,0,0.85)",
      "z-index:2147483646",
      "overflow:hidden",
      "display:none",
      "touch-action:none",
      "user-select:none",
      "-webkit-user-select:none",
      "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
      "box-sizing:border-box",
    ].join(";");

    // ── remote video — fills entire pip ──────────────────────────────────────
    const rv = document.createElement("video");
    rv.id = "justus-rv";
    rv.muted = true;
    rv.playsInline = true;
    rv.setAttribute("playsinline", "");
    rv.setAttribute("webkit-playsinline", "");
    rv.setAttribute("x-webkit-airplay", "deny");
    rv.setAttribute("disablepictureinpicture", "");
    rv.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
    rv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;background:#090a14;";
    pip.appendChild(rv);

    // ── local camera preview — small, top-left ────────────────────────────────
    const lv = document.createElement("video");
    lv.id = "justus-lv";
    lv.muted = true;
    lv.playsInline = true;
    lv.setAttribute("playsinline", "");
    lv.setAttribute("webkit-playsinline", "");
    lv.setAttribute("x-webkit-airplay", "deny");
    lv.setAttribute("disablepictureinpicture", "");
    lv.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
    lv.style.cssText = "position:absolute;top:8px;left:8px;width:64px;height:48px;object-fit:cover;border-radius:8px;border:1.5px solid rgba(255,255,255,0.55);background:#1a1c2a;display:none;z-index:2;";
    pip.appendChild(lv);

    // ── waiting overlay ───────────────────────────────────────────────────────
    const wait = document.createElement("div");
    wait.id = "justus-pip-wait";
    wait.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#0d0f1a;z-index:1;pointer-events:none;";
    wait.innerHTML = `
      <div style="width:10px;height:10px;border-radius:50%;background:#6366f1;"></div>
      <span id="justus-pip-status" style="color:#94a3b8;font-size:11px;font-weight:600;text-align:center;padding:0 12px;">Connecting…</span>
    `;
    pip.appendChild(wait);

    // ── controls overlay (tap to reveal) ──────────────────────────────────────
    const ctrl = document.createElement("div");
    ctrl.id = "justus-pip-ctrl";
    ctrl.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:6px;z-index:3;opacity:0;pointer-events:none;transition:opacity 0.2s;background:linear-gradient(to bottom,rgba(0,0,0,0.65) 0%,transparent 40%,transparent 55%,rgba(0,0,0,0.85) 100%);";
    ctrl.innerHTML = `
      <button id="justus-btn-close" title="Close" style="align-self:flex-end;width:26px;height:26px;border-radius:13px;background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.3);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:manipulation;padding:0;">${PIP_ICONS.close}</button>
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:4px 8px;background:rgba(8,10,20,0.92);border:1px solid rgba(255,255,255,0.15);border-radius:20px;">
        <button id="justus-btn-mic" title="Mic" style="${PIP_BTN} opacity:0.35;">${PIP_ICONS.micOff}</button>
        <button id="justus-btn-cam" title="Camera" style="${PIP_BTN}">${PIP_ICONS.cam}</button>
        <button id="justus-btn-flip" title="Flip" style="${PIP_BTN}">${PIP_ICONS.flip}</button>
        <button id="justus-btn-end" title="End call" style="${PIP_BTN} background:#7f1d1d;border-color:rgba(239,68,68,0.4);">${PIP_ICONS.end}</button>
      </div>
    `;
    pip.appendChild(ctrl);

    document.body.appendChild(pip);

    pipContainer   = pip;
    pipRemoteVideo = rv;
    pipLocalVideo  = lv;
    pipWaitOverlay = wait;
    pipCtrlOverlay = ctrl;
    pipStatusText  = wait.querySelector("#justus-pip-status");

    setupPipInteractions(pip, ctrl);
    updatePipCtrlButtons();
  }

  // ── PIP drag + tap-to-reveal controls ─────────────────────────────────────
  function setupPipInteractions(pip, ctrl) {
    let dragStartX = 0, dragStartY = 0;
    let pipStartX = 0, pipStartY = 0;
    let dragging = false, moved = false;
    const DRAG_THRESHOLD = 8;

    function getPoint(e) {
      return e.touches ? e.touches[0] : e;
    }

    function onStart(e) {
      if (e.target.closest("button")) return;
      const pt = getPoint(e);
      dragStartX = pt.clientX;
      dragStartY = pt.clientY;
      const r = pip.getBoundingClientRect();
      pipStartX = r.left;
      pipStartY = r.top;
      dragging = true;
      moved = false;
      try { e.preventDefault(); } catch {}
    }

    function onMove(e) {
      if (!dragging) return;
      const pt = getPoint(e);
      const dx = pt.clientX - dragStartX;
      const dy = pt.clientY - dragStartY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) moved = true;
      if (moved) {
        const W = pip.offsetWidth, H = pip.offsetHeight;
        const newX = Math.max(4, Math.min(window.innerWidth - W - 4, pipStartX + dx));
        const newY = Math.max(4, Math.min(window.innerHeight - H - 4, pipStartY + dy));
        pip.style.right  = "auto";
        pip.style.bottom = "auto";
        pip.style.left   = newX + "px";
        pip.style.top    = newY + "px";
        try { e.preventDefault(); } catch {}
      }
    }

    function onEnd(e) {
      if (!dragging) return;
      dragging = false;
      if (!moved) togglePipControls();
      try { e.preventDefault(); } catch {}
    }

    // Touch (iOS primary path)
    pip.addEventListener("touchstart", onStart, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: false });

    // Pointer (desktop fallback)
    pip.addEventListener("pointerdown", onStart);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);

    // Controls: prevent touch from bubbling to drag handler
    ctrl.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });

    // Buttons
    function pipBtn(id, fn) {
      const btn = pip.querySelector("#" + id);
      if (!btn) return;
      btn.addEventListener("touchstart", (e) => { e.stopPropagation(); e.preventDefault(); fn(); schedulePipControlsHide(); }, { passive: false });
      btn.addEventListener("click", (e) => { e.stopPropagation(); fn(); schedulePipControlsHide(); });
    }

    pipBtn("justus-btn-close", () => { pipContainer.style.display = "none"; });
    pipBtn("justus-btn-end",   () => { leaveLiveKitCall(); });
    pipBtn("justus-btn-mic",   () => { toggleMic(); });
    pipBtn("justus-btn-cam",   () => { toggleCam(); });
    pipBtn("justus-btn-flip",  () => { flipCamera(); });
  }

  function togglePipControls() {
    if (!pipCtrlOverlay) return;
    const visible = pipCtrlOverlay.style.opacity === "1";
    pipCtrlOverlay.style.opacity = visible ? "0" : "1";
    pipCtrlOverlay.style.pointerEvents = visible ? "none" : "auto";
    if (!visible) schedulePipControlsHide();
  }

  function schedulePipControlsHide() {
    clearTimeout(ctrlHideTimer);
    ctrlHideTimer = setTimeout(() => {
      if (pipCtrlOverlay) { pipCtrlOverlay.style.opacity = "0"; pipCtrlOverlay.style.pointerEvents = "none"; }
    }, 4000);
  }

  function restoreLocalVideoPreview() {
    if (!pipLocalVideo || !localCameraStream || !isCamEnabled) return;
    const vt = localCameraStream.getVideoTracks()[0];
    if (!vt || vt.readyState !== "live") return;

    const existing =
      pipLocalVideo.srcObject instanceof MediaStream
        ? pipLocalVideo.srcObject.getVideoTracks()[0]
        : null;

    if (existing !== vt) {
      setVideoSrc(pipLocalVideo, new MediaStream([vt]));
    } else if (pipLocalVideo.paused) {
      pipLocalVideo.play().catch(() => {});
    }
    pipLocalVideo.style.display = "block";
  }

  function updatePipCtrlButtons() {
    const micBtn = pipContainer?.querySelector("#justus-btn-mic");
    const camBtn = pipContainer?.querySelector("#justus-btn-cam");
    if (micBtn) {
      micBtn.style.opacity = isMicEnabled ? "1" : "0.35";
      micBtn.innerHTML = isMicEnabled ? PIP_ICONS.mic : PIP_ICONS.micOff;
    }
    if (camBtn) {
      camBtn.style.opacity = isCamEnabled ? "1" : "0.35";
      camBtn.innerHTML = isCamEnabled ? PIP_ICONS.cam : PIP_ICONS.camOff;
    }
  }

  function notifyNativePrepareCallAudio() {
    try {
      if (window.webkit?.messageHandlers?.prepareCallAudio) {
        window.webkit.messageHandlers.prepareCallAudio.postMessage({});
      }
      if (window.AndroidPrepareCallAudio?.prepareCallAudio) {
        window.AndroidPrepareCallAudio.prepareCallAudio();
      }
    } catch {}
  }

  // iOS: capture mic+camera ONCE at join. Mic toggle only unmutes — never re-acquires.
  async function startLocalCaptureIOS() {
    if (!navigator.mediaDevices?.getUserMedia || livekitRoom?.state !== "connected") return;
    const LK = window.LivekitClient;
    if (!LK) return;

    try {
      notifyNativePrepareCallAudio();

      if (lkLocalVideoTrack) {
        try { await livekitRoom.localParticipant.unpublishTrack(lkLocalVideoTrack); } catch {}
        lkLocalVideoTrack = null;
      }
      if (lkLocalAudioTrack) {
        try { await livekitRoom.localParticipant.unpublishTrack(lkLocalAudioTrack); } catch {}
        try { lkLocalAudioTrack.stop(); } catch {}
        lkLocalAudioTrack = null;
      }
      iosHeldAudioTrack = null;

      if (localCameraStream) {
        localCameraStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        localCameraStream = null;
      }
      if (pipLocalVideo) pipLocalVideo.srcObject = null;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 480 },
          height: { ideal: 360 },
          frameRate: { ideal: 24 },
        },
      });

      localCameraStream = stream;
      captureUsesCombinedAv = true;

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (audioTrack) {
        audioTrack.enabled = false;
        iosHeldAudioTrack = audioTrack;
      }

      if (pipLocalVideo && videoTrack && isCamEnabled) {
        setVideoSrc(pipLocalVideo, new MediaStream([videoTrack]));
        pipLocalVideo.style.display = "block";
      }

      if (videoTrack && isCamEnabled) await publishCameraTrack(videoTrack);
    } catch (err) {
      console.warn("[JustUS] iOS AV capture:", err);
      captureUsesCombinedAv = false;
      iosHeldAudioTrack = null;
      addEventLog("⚠️ Camera — " + (err.message || err.name), "System");
    }
  }

  async function enableMicFromHeldTrack() {
    if (!livekitRoom || livekitRoom.state !== "connected") return;
    const LK = window.LivekitClient;
    if (!LK) return;

    const audioTrack = iosHeldAudioTrack || localCameraStream?.getAudioTracks()[0];
    if (!audioTrack) {
      isMicEnabled = false;
      updatePipCtrlButtons();
      addEventLog("⚠️ Mic unavailable — rejoin the call", "System");
      return;
    }

    notifyNativePrepareCallAudio();
    audioTrack.enabled = true;

    try {
      if (!lkLocalAudioTrack) {
        lkLocalAudioTrack = new LK.LocalAudioTrack(audioTrack, undefined, false);
        await livekitRoom.localParticipant.publishTrack(lkLocalAudioTrack);
      } else {
        lkLocalAudioTrack.mediaStreamTrack.enabled = true;
      }
    } catch (err) {
      console.warn("[JustUS] Mic publish:", err);
      isMicEnabled = false;
      audioTrack.enabled = false;
      updatePipCtrlButtons();
      return;
    }

    // Publishing audio can stall the camera preview on iOS — refresh without re-acquiring.
    restoreLocalVideoPreview();
    setTimeout(() => restoreLocalVideoPreview(), 200);
    setTimeout(() => restoreLocalVideoPreview(), 600);
  }

  async function restartLocalCameraAfterMic() {
    await new Promise((r) => setTimeout(r, 250));
    const vt = localCameraStream?.getVideoTracks()[0];
    if (vt && vt.readyState === "live") {
      restoreLocalVideoPreview();
      return;
    }
    await startLocalCamera(true);
  }

  async function startLocalMic() {
    if (!navigator.mediaDevices?.getUserMedia || livekitRoom?.state !== "connected") return;

    if (IS_IOS && captureUsesCombinedAv) {
      await enableMicFromHeldTrack();
      return;
    }

    if (captureUsesCombinedAv && lkLocalAudioTrack?.mediaStreamTrack) {
      lkLocalAudioTrack.mediaStreamTrack.enabled = true;
      return;
    }

    const LK = window.LivekitClient;
    if (!LK) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const rawTrack = stream.getAudioTracks()[0];
      if (!rawTrack) return;

      if (lkLocalAudioTrack) {
        try { await livekitRoom.localParticipant.unpublishTrack(lkLocalAudioTrack); } catch {}
        try { lkLocalAudioTrack.stop(); } catch {}
        lkLocalAudioTrack = null;
      }

      lkLocalAudioTrack = new LK.LocalAudioTrack(rawTrack, undefined, false);
      await livekitRoom.localParticipant.publishTrack(lkLocalAudioTrack);
      lkLocalAudioTrack.mediaStreamTrack.enabled = true;

      await restartLocalCameraAfterMic();
    } catch (err) {
      console.warn("[JustUS] Mic:", err);
      isMicEnabled = false;
      updatePipCtrlButtons();
      addEventLog("⚠️ Mic unavailable — check permissions", "System");
    }
  }

  // Mirrors LiveKit's own Safari workaround in Track.ts:
  //   - No `autoplay` attribute (iOS low-power mode shows pause overlay)
  //   - srcObject assigned twice with setTimeout(0) to force WebKit repaint
  //   - play() called exactly once, inside the timeout
  function setVideoSrc(videoEl, stream) {
    if (!videoEl || !stream) return;
    videoEl.srcObject = stream;
    setTimeout(() => {
      videoEl.srcObject = stream;
      videoEl.play().catch((err) => {
        // AbortError = a second play() raced us; ignore.
        if (err?.name !== "AbortError") console.warn("[JustUS] play():", err);
      });
    }, 0);
  }

  // ── local camera via getUserMedia (bypasses LiveKit camera management) ─────
  async function startLocalCamera(force = false) {
    if (!navigator.mediaDevices?.getUserMedia) {
      addEventLog("⚠️ getUserMedia not available", "System");
      return;
    }
    try {
      if (!force && localCameraStream) {
        const tracks = localCameraStream.getVideoTracks();
        if (tracks.length && tracks[0].readyState === "live") {
          tracks[0].enabled = isCamEnabled;
          if (isCamEnabled && pipLocalVideo) {
            setVideoSrc(pipLocalVideo, new MediaStream([tracks[0]]));
            pipLocalVideo.style.display = "block";
          }
          return;
        }
      }

      if (localCameraStream) {
        localCameraStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        localCameraStream = null;
      }
      if (lkLocalVideoTrack && livekitRoom?.state === "connected") {
        try { await livekitRoom.localParticipant.unpublishTrack(lkLocalVideoTrack); } catch {}
        lkLocalVideoTrack = null;
      }

      localCameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode  : { ideal: currentFacingMode },
          width       : { ideal: 480 },
          height      : { ideal: 360 },
          frameRate   : { ideal: 24 },
        },
        audio: false,
      });
      captureUsesCombinedAv = false;

      if (pipLocalVideo) {
        const vt = localCameraStream.getVideoTracks()[0];
        if (vt) {
          setVideoSrc(pipLocalVideo, new MediaStream([vt]));
        }
        pipLocalVideo.style.display = isCamEnabled ? "block" : "none";
      }

      // Publish the raw track to LiveKit so the remote sees it
      if (livekitRoom?.state === "connected") {
        await publishCameraTrack(localCameraStream.getVideoTracks()[0]);
      }
    } catch (err) {
      console.warn("[JustUS] Camera:", err);
      addEventLog("⚠️ Camera — " + (err.message || err.name), "System");
    }
  }

  async function publishCameraTrack(rawTrack) {
    if (!rawTrack || !livekitRoom) return;
    const LK = window.LivekitClient;
    try {
      // Unpublish any existing camera track first
      if (lkLocalVideoTrack) {
        try { await livekitRoom.localParticipant.unpublishTrack(lkLocalVideoTrack); } catch {}
        lkLocalVideoTrack = null;
      }
      lkLocalVideoTrack = new LK.LocalVideoTrack(rawTrack, undefined, false);
      await livekitRoom.localParticipant.publishTrack(lkLocalVideoTrack, {
        videoCodec: "vp8",
        simulcast : false,
      });
    } catch (err) {
      console.warn("[JustUS] publishCamera:", err);
    }
  }

  // ── token fetch ────────────────────────────────────────────────────────────
  async function fetchLkToken(roomName, identity) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${API_BASE}/api/livekit/token`, {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ roomName, identity, name: currentUserName, isHost: !!isHost }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.token) return { token: d.token, wsUrl: d.wsUrl || "" };
        }
      } catch {}
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 800));
    }
    return null;
  }

  // ── connect ────────────────────────────────────────────────────────────────
  async function connectLiveKitCall() {
    if (!activeRoomId || isLkConnecting) return;
    if (livekitRoom?.state === "connected") return;

    isLkConnecting = true;
    userHungUp = false;
    buildPip();

    if (pipStatusText) pipStatusText.textContent = "Connecting…";

    loadLiveKitSDK(async () => {
      try {
        const LK = window.LivekitClient;
        const td = await fetchLkToken(activeRoomId, getLkIdentity());
        if (!td) throw new Error("Could not get video call token");

        const room = new LK.Room({
          adaptiveStream : false,
          dynacast       : false,
          publishDefaults: { simulcast: false, videoCodec: "vp8" },
        });
        livekitRoom = room;

        // Remote video ── use srcObject, not track.attach() on our element
        room.on(LK.RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === LK.Track.Kind.Video && pipRemoteVideo) {
            setVideoSrc(pipRemoteVideo, new MediaStream([track.mediaStreamTrack]));
            if (pipWaitOverlay) pipWaitOverlay.style.display = "none";
          }
          if (track.kind === LK.Track.Kind.Audio) {
            if (remoteAudioEl) { try { remoteAudioEl.remove(); } catch {} }
            remoteAudioEl = track.attach(); // creates an <audio> element
            remoteAudioEl.volume = 1.0;
            document.body.appendChild(remoteAudioEl); // MUST be in body, not Shadow DOM
          }
        });

        room.on(LK.RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === LK.Track.Kind.Video) {
            if (pipRemoteVideo) pipRemoteVideo.srcObject = null;
            if (pipWaitOverlay) pipWaitOverlay.style.display = "flex";
          }
          try { track.detach(); } catch {}
        });

        room.on(LK.RoomEvent.ParticipantDisconnected, () => {
          if (pipRemoteVideo) pipRemoteVideo.srcObject = null;
          if (pipWaitOverlay) { pipWaitOverlay.style.display = "flex"; }
          if (pipStatusText) pipStatusText.textContent = "Friend left call";
        });

        // iOS: WebKit pauses videos when app backgrounds; resume them
        room.on(LK.RoomEvent.VideoPlaybackStatusChanged, () => {
          if (!room.canPlaybackVideo) room.startVideo().catch(() => {});
        });

        room.on(LK.RoomEvent.Disconnected, onLkDisconnected);

        await room.connect(td.wsUrl, td.token);
        isVideoCallActive = true;
        updateVideoPillState();

        // iOS: one combined capture at join; mic is unmuted later without re-acquiring.
        if (isCamEnabled) {
          if (IS_IOS) await startLocalCaptureIOS();
          else await startLocalCamera();
        }

        // Pick up tracks already in room
        room.remoteParticipants.forEach((p) => {
          p.videoTrackPublications.forEach((pub) => {
            if (pub.track && pub.isSubscribed && pipRemoteVideo) {
              setVideoSrc(pipRemoteVideo, new MediaStream([pub.track.mediaStreamTrack]));
              if (pipWaitOverlay) pipWaitOverlay.style.display = "none";
            }
          });
        });

        if (pipStatusText) pipStatusText.textContent = "Waiting for friend…";
      } catch (err) {
        console.error("[JustUS] LiveKit:", err);
        if (pipStatusText) pipStatusText.textContent = "Error: " + (err.message || "failed");
      } finally {
        isLkConnecting = false;
      }
    });
  }

  // ── disconnect ─────────────────────────────────────────────────────────────
  function onLkDisconnected() {
    livekitRoom = null;
    isVideoCallActive = false;
    isLkConnecting = false;
    if (remoteAudioEl) { try { remoteAudioEl.remove(); } catch {} remoteAudioEl = null; }
    updateVideoPillState();
    if (!userHungUp && activeRoomId) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        if (!userHungUp && activeRoomId && !livekitRoom) connectLiveKitCall();
      }, 2500);
    }
  }

  // ── hang up ────────────────────────────────────────────────────────────────
  function leaveLiveKitCall() {
    userHungUp = true;
    autoCallScheduled = false;
    clearTimeout(reconnectTimer);
    clearLkIdentity();
    captureUsesCombinedAv = false;
    iosHeldAudioTrack = null;

    // Stop camera hardware (safe to stop on hangup — not toggling)
    if (localCameraStream) {
      localCameraStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      localCameraStream = null;
    }
    lkLocalVideoTrack = null;

    if (lkLocalAudioTrack) {
      try { lkLocalAudioTrack.stop(); } catch {}
      lkLocalAudioTrack = null;
    }
    if (remoteAudioEl) { try { remoteAudioEl.remove(); } catch {} remoteAudioEl = null; }

    if (pipRemoteVideo) pipRemoteVideo.srcObject = null;
    if (pipLocalVideo)  { pipLocalVideo.srcObject = null; pipLocalVideo.style.display = "none"; }
    if (pipWaitOverlay) { pipWaitOverlay.style.display = "flex"; }
    if (pipStatusText)  { pipStatusText.textContent = "Call ended"; }
    if (pipContainer)   { pipContainer.style.display = "none"; }

    if (livekitRoom) { try { livekitRoom.disconnect(true); } catch {} livekitRoom = null; }

    isVideoCallActive = false;
    updateVideoPillState();
  }

  // ── mic toggle ─────────────────────────────────────────────────────────────
  async function toggleMic() {
    if (!livekitRoom || livekitRoom.state !== "connected") return;

    isMicEnabled = !isMicEnabled;
    updatePipCtrlButtons();

    if (isMicEnabled) {
      await startLocalMic();
    } else {
      if (iosHeldAudioTrack) iosHeldAudioTrack.enabled = false;
      if (lkLocalAudioTrack?.mediaStreamTrack) {
        lkLocalAudioTrack.mediaStreamTrack.enabled = false;
      }
      restoreLocalVideoPreview();
    }
  }

  // ── camera toggle ──────────────────────────────────────────────────────────
  async function toggleCam() {
    isCamEnabled = !isCamEnabled;
    updatePipCtrlButtons();

    if (localCameraStream) {
      localCameraStream.getVideoTracks().forEach((t) => { t.enabled = isCamEnabled; });
    }
    if (lkLocalVideoTrack?.mediaStreamTrack) {
      lkLocalVideoTrack.mediaStreamTrack.enabled = isCamEnabled;
    }

    if (pipLocalVideo) pipLocalVideo.style.display = isCamEnabled ? "block" : "none";
  }

  // ── flip camera ────────────────────────────────────────────────────────────
  async function flipCamera() {
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    if (IS_IOS) {
      const micWasOn = isMicEnabled;
      isMicEnabled = false;
      await startLocalCaptureIOS();
      if (micWasOn) {
        isMicEnabled = true;
        updatePipCtrlButtons();
        await enableMicFromHeldTrack();
      }
      return;
    }
    if (localCameraStream) {
      localCameraStream.getVideoTracks().forEach((t) => { try { t.stop(); } catch {} });
      localCameraStream = null;
    }
    if (pipLocalVideo) { pipLocalVideo.srcObject = null; pipLocalVideo.style.display = "none"; }
    await startLocalCamera();
  }

  // ── show / hide PIP ────────────────────────────────────────────────────────
  function toggleVideoCallWindow() {
    if (!activeRoomId) {
      addEventLog("⚠️ Join or create a watch party first", "System");
      toggleDrawer();
      return;
    }
    buildPip();
    const pip = pipContainer;
    if (!pip) return;

    if (pip.style.display === "none" || !pip.style.display) {
      pip.style.display = "block";
      if (!livekitRoom && !isLkConnecting) connectLiveKitCall();
    } else {
      pip.style.display = "none";
    }
  }

  // ── pill / drawer state ────────────────────────────────────────────────────
  function updateVideoPillState() {
    const dot  = shadow.getElementById("ju-video-dot");
    const text = shadow.getElementById("ju-video-pill-text");
    const pill = shadow.getElementById("ju-video-pill");
    if (!pill) return;

    if (!activeRoomId) { pill.classList.add("hidden"); return; }
    pill.classList.remove("hidden");

    if (isVideoCallActive) {
      if (dot) dot.className = "status-dot active";
      pill.classList.add("active");
      if (text) text.textContent = "📹 In Call";
    } else {
      if (dot) dot.className = "status-dot idle";
      pill.classList.remove("active");
      if (text) text.textContent = "📹 Video Call";
    }

    const drawerBtn = shadow.getElementById("ju-drawer-video-btn");
    if (drawerBtn) {
      drawerBtn.className = `action-btn ${isVideoCallActive ? "emerald" : "indigo"}`;
      drawerBtn.textContent = isVideoCallActive ? "📹 Open Video PIP" : "📹 Start / Join Video Call";
    }
  }

  // Video call is user-initiated only — no auto-connect on party join.
  function scheduleAutoVideoCall() {}
