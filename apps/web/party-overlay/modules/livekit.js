  // ─── LiveKit Video Call ────────────────────────────────────────────────────
  //
  // WHY body-level <video> elements?
  //   iOS WKWebView refuses inline playback for <video> inside Shadow DOM.
  //   The fix is to render video in document.body (light DOM), positioned to
  //   match the Shadow DOM window shell. The shell stays in Shadow DOM for
  //   controls, borders, drag, and event isolation.
  //
  // iOS WKWebView rules:
  //   1. No `autoplay` attribute — call play() programmatically.
  //   2. Reset srcObject in setTimeout(0) — forces WebKit repaint.
  //   3. muted + playsinline required for autoplay without gesture.
  //   4. Never stop() a track mid-call — iOS can't re-acquire without gesture.
  //   5. Use mediaStreamTrack.enabled for mute — no round-trip to server.
  //   6. Remote audio: track.attach() on a body <audio> — not Shadow DOM.
  // ──────────────────────────────────────────────────────────────────────────

  let livekitRoom       = null;
  let lkLocalVideoTrack = null;
  let lkLocalAudioTrack = null;
  let remoteAudioEl     = null;

  // Body-level video elements (live in document.body, not Shadow DOM)
  let bodyRemoteVideo   = null;
  let bodyLocalVideo    = null;

  let isVideoCallActive = false;
  let isMicEnabled      = true;
  let isCamEnabled      = true;
  let currentFacingMode = "user";
  let isLkConnecting    = false;
  let reconnectTimer    = null;
  let autoCallScheduled = false;
  let userHungUp        = false;

  // ── identity ───────────────────────────────────────────────────────────────
  function getLkIdentity() {
    try {
      let id = sessionStorage.getItem("justus_lk_id");
      if (!id) {
        id = currentUserName + "_" + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem("justus_lk_id", id);
      }
      return id;
    } catch { return currentUserName + "_" + Math.random().toString(36).slice(2, 8); }
  }
  function clearLkIdentity() {
    try { sessionStorage.removeItem("justus_lk_id"); } catch {}
  }

  // ── SDK loader ─────────────────────────────────────────────────────────────
  function loadLiveKitSDK(cb) {
    if (window.LivekitClient) { cb(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/livekit-client@2.6.0/dist/livekit-client.umd.min.js";
    s.onload  = () => { if (window.LivekitClient) cb(); };
    s.onerror = () => addEventLog("⚠️ Could not load video SDK", "System");
    (document.head || document.documentElement).appendChild(s);
  }

  // ── body-level video element factory ──────────────────────────────────────
  // These live in document.body so iOS WKWebView applies inline-playback policy.
  function createBodyVideoEl(id, opts) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement("video");
    el.id             = id;
    el.muted          = true;
    el.playsInline    = true;
    el.controls       = false;
    el.disablePictureInPicture = true;
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.setAttribute("x-webkit-airplay", "deny");
    el.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback noplaybackrate novolume");
    Object.assign(el.style, {
      position      : "fixed",
      zIndex        : opts.zIndex || "2147483640",
      pointerEvents : "none",
      objectFit     : "cover",
      display       : "none",
      background    : "#090A10",
      borderRadius  : opts.borderRadius || "0",
      border        : opts.border || "none",
      boxSizing     : "border-box",
    });
    document.body.appendChild(el);
    return el;
  }

  function ensureBodyVideos() {
    if (!bodyRemoteVideo) {
      bodyRemoteVideo = createBodyVideoEl("justus-remote-video", {
        zIndex: "2147483640",
        borderRadius: "18px",
      });
    }
    if (!bodyLocalVideo) {
      bodyLocalVideo = createBodyVideoEl("justus-local-video", {
        zIndex: "2147483641",
        borderRadius: "10px",
        border: "1.5px solid rgba(255,255,255,0.6)",
      });
    }
  }

  // ── position sync ──────────────────────────────────────────────────────────
  // Called after drag / resize / show-window so body videos stay aligned
  // with the Shadow DOM video canvas.
  function syncVideoElements() {
    const canvas = shadow.getElementById("ju-video-canvas");
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const hidden = videoWindow.classList.contains("hidden");

    if (bodyRemoteVideo) {
      if (hidden) {
        bodyRemoteVideo.style.display = "none";
      } else {
        bodyRemoteVideo.style.left   = r.left + "px";
        bodyRemoteVideo.style.top    = r.top + "px";
        bodyRemoteVideo.style.width  = r.width + "px";
        bodyRemoteVideo.style.height = r.height + "px";
        if (bodyRemoteVideo.srcObject) bodyRemoteVideo.style.display = "block";
      }
    }

    if (bodyLocalVideo) {
      if (hidden || !isCamEnabled) {
        bodyLocalVideo.style.display = "none";
      } else {
        bodyLocalVideo.style.left   = (r.left + 8) + "px";
        bodyLocalVideo.style.top    = (r.top + 8) + "px";
        bodyLocalVideo.style.width  = "60px";
        bodyLocalVideo.style.height = "45px";
        if (bodyLocalVideo.srcObject) bodyLocalVideo.style.display = "block";
      }
    }
  }

  // ── video playback helper ──────────────────────────────────────────────────
  // Matches LiveKit's own Safari workaround from Track.ts:
  //   - No autoplay attribute
  //   - srcObject set twice (second in setTimeout) to force WebKit repaint
  //   - play() called once, inside the timeout
  function setSrcAndPlay(videoEl, mediaStream) {
    if (!videoEl || !mediaStream) return;
    // First assignment (Safari sometimes needs both)
    videoEl.srcObject = mediaStream;
    setTimeout(() => {
      videoEl.srcObject = mediaStream;    // forces WebKit re-render
      videoEl.play().catch(() => {});
    }, 0);
  }

  // ── local preview ──────────────────────────────────────────────────────────
  function showLocalPreview() {
    if (!lkLocalVideoTrack || !isCamEnabled) return;
    ensureBodyVideos();
    const mst = lkLocalVideoTrack.mediaStreamTrack;
    if (!mst) return;

    const existing = bodyLocalVideo.srcObject instanceof MediaStream
      ? bodyLocalVideo.srcObject.getVideoTracks()[0]
      : null;

    if (existing !== mst) {
      setSrcAndPlay(bodyLocalVideo, new MediaStream([mst]));
    } else if (bodyLocalVideo.paused) {
      bodyLocalVideo.play().catch(() => {});
    }
    syncVideoElements();
  }

  function hideLocalPreview() {
    if (bodyLocalVideo) bodyLocalVideo.style.display = "none";
  }

  // ── remote video ───────────────────────────────────────────────────────────
  function showRemoteVideo(track) {
    if (!track) return;
    ensureBodyVideos();
    const mst = track.mediaStreamTrack;
    if (!mst) return;

    const existing = bodyRemoteVideo.srcObject instanceof MediaStream
      ? bodyRemoteVideo.srcObject.getVideoTracks()[0]
      : null;

    if (existing !== mst) {
      setSrcAndPlay(bodyRemoteVideo, new MediaStream([mst]));
    } else if (bodyRemoteVideo.paused) {
      bodyRemoteVideo.play().catch(() => {});
    }
    syncVideoElements();

    const waiting = shadow.getElementById("ju-video-waiting");
    if (waiting) waiting.classList.add("hidden");
  }

  // ── token fetch ────────────────────────────────────────────────────────────
  async function fetchLkToken(roomName, identity, userName, host) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${API_BASE}/api/livekit/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomName, identity, name: userName, isHost: !!host }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.token) return { token: d.token, wsUrl: d.wsUrl || "" };
        }
      } catch {}
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 700));
    }
    return null;
  }

  // ── connect ────────────────────────────────────────────────────────────────
  async function connectLiveKitCall(isReconnect) {
    if (!activeRoomId || isLkConnecting) return;
    if (livekitRoom && livekitRoom.state === "connected") return;

    isLkConnecting = true;
    userHungUp     = false;

    ensureBodyVideos();
    const waitEl = shadow.getElementById("ju-waiting-text");
    if (waitEl) waitEl.textContent = "Connecting video call…";

    loadLiveKitSDK(async () => {
      try {
        const LK       = window.LivekitClient;
        const identity = getLkIdentity();
        const td       = await fetchLkToken(activeRoomId, identity, currentUserName, isHost);
        if (!td) throw new Error("Could not get video call token");

        const room = new LK.Room({
          adaptiveStream : false,
          dynacast       : false,
          publishDefaults: { simulcast: false, videoCodec: "vp8" },
          videoCaptureDefaults: {
            resolution: { width: 480, height: 360, frameRate: 24 },
            facingMode: currentFacingMode,
          },
        });
        livekitRoom = room;

        // ── remote track arrives ─────────────────────────────────────────────
        room.on(LK.RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === LK.Track.Kind.Video) {
            showRemoteVideo(track);
          }
          if (track.kind === LK.Track.Kind.Audio) {
            if (remoteAudioEl) {
              try { remoteAudioEl.remove(); } catch {}
            }
            // Audio element goes in document.body (not Shadow DOM) for
            // proper iOS AVAudioSession routing to the speaker.
            remoteAudioEl = track.attach();
            remoteAudioEl.volume = 1.0;
            document.body.appendChild(remoteAudioEl);
          }
        });

        room.on(LK.RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === LK.Track.Kind.Video) {
            if (bodyRemoteVideo) {
              bodyRemoteVideo.style.display = "none";
              bodyRemoteVideo.srcObject = null;
            }
            const waiting = shadow.getElementById("ju-video-waiting");
            if (waiting) waiting.classList.remove("hidden");
          }
          try { track.detach(); } catch {}
        });

        room.on(LK.RoomEvent.ParticipantDisconnected, () => {
          if (bodyRemoteVideo) {
            bodyRemoteVideo.style.display = "none";
            bodyRemoteVideo.srcObject = null;
          }
          const waiting = shadow.getElementById("ju-video-waiting");
          if (waiting) {
            waiting.classList.remove("hidden");
            const wt = shadow.getElementById("ju-waiting-text");
            if (wt) wt.textContent = "Friend left call";
          }
        });

        // iOS: WebKit pauses video in background; room.startVideo() resumes.
        room.on(LK.RoomEvent.VideoPlaybackStatusChanged, () => {
          if (!room.canPlaybackVideo) room.startVideo().catch(() => {});
        });

        room.on(LK.RoomEvent.Disconnected, onLkDisconnected);

        // ── connect ──────────────────────────────────────────────────────────
        await room.connect(td.wsUrl, td.token);
        isVideoCallActive = true;
        updateVideoPillState();

        // ── publish microphone first (iOS audio session needs this) ──────────
        if (isMicEnabled) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            const pub = room.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
            if (pub?.track) {
              lkLocalAudioTrack = pub.track;
              if (lkLocalAudioTrack.mediaStreamTrack) {
                lkLocalAudioTrack.mediaStreamTrack.enabled = true;
              }
            }
          } catch (e) { console.warn("[JustUS] Mic:", e); }
        }

        // ── publish camera ───────────────────────────────────────────────────
        if (isCamEnabled) {
          try {
            await room.localParticipant.setCameraEnabled(true);
            const pub = room.localParticipant.getTrackPublication(LK.Track.Source.Camera);
            if (pub?.track) {
              lkLocalVideoTrack = pub.track;
              showLocalPreview();
            }
          } catch (e) {
            console.warn("[JustUS] Camera:", e);
            addEventLog("⚠️ Camera unavailable — check app permissions", "System");
          }
        }

        // ── pick up remote tracks already in room ────────────────────────────
        room.remoteParticipants.forEach((p) => {
          p.videoTrackPublications.forEach((pub) => {
            if (pub.track && pub.isSubscribed) showRemoteVideo(pub.track);
          });
          p.audioTrackPublications.forEach((pub) => {
            if (pub.track && pub.isSubscribed && !remoteAudioEl) {
              remoteAudioEl = pub.track.attach();
              remoteAudioEl.volume = 1.0;
              document.body.appendChild(remoteAudioEl);
            }
          });
        });

        if (waitEl) waitEl.textContent = "Waiting for friend to join…";
      } catch (err) {
        console.error("[JustUS] LiveKit:", err);
        const wt = shadow.getElementById("ju-waiting-text");
        if (wt) wt.textContent = `Error: ${err.message || "Connection failed"}`;
      } finally {
        isLkConnecting = false;
      }
    });
  }

  // ── disconnect ─────────────────────────────────────────────────────────────
  function onLkDisconnected() {
    livekitRoom       = null;
    isVideoCallActive = false;
    isLkConnecting    = false;

    if (remoteAudioEl) {
      try { remoteAudioEl.remove(); } catch {}
      remoteAudioEl = null;
    }
    updateVideoPillState();

    if (!userHungUp && activeRoomId) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        if (!userHungUp && activeRoomId && !livekitRoom) connectLiveKitCall(true);
      }, 2500);
    }
  }

  // ── hang up ────────────────────────────────────────────────────────────────
  function leaveLiveKitCall() {
    userHungUp        = true;
    autoCallScheduled = false;
    clearTimeout(reconnectTimer);
    clearLkIdentity();

    if (lkLocalVideoTrack) {
      try { lkLocalVideoTrack.stop(); } catch {}
      lkLocalVideoTrack = null;
    }
    if (lkLocalAudioTrack) {
      try { lkLocalAudioTrack.stop(); } catch {}
      lkLocalAudioTrack = null;
    }
    if (remoteAudioEl) {
      try { remoteAudioEl.remove(); } catch {}
      remoteAudioEl = null;
    }

    // Clear body videos
    if (bodyRemoteVideo) {
      bodyRemoteVideo.style.display = "none";
      bodyRemoteVideo.srcObject = null;
    }
    if (bodyLocalVideo) {
      bodyLocalVideo.style.display = "none";
      bodyLocalVideo.srcObject = null;
    }

    const waiting = shadow.getElementById("ju-video-waiting");
    if (waiting) waiting.classList.remove("hidden");

    if (livekitRoom) {
      try { livekitRoom.disconnect(true); } catch {}
      livekitRoom = null;
    }
    isVideoCallActive = false;
    updateVideoPillState();
  }

  // ── mic toggle ─────────────────────────────────────────────────────────────
  async function toggleMic() {
    isMicEnabled = !isMicEnabled;
    const btn = shadow.getElementById("ju-btn-mic");
    if (btn) btn.classList.toggle("off", !isMicEnabled);

    // Hardware mute first — instant, no server round-trip
    if (lkLocalAudioTrack?.mediaStreamTrack) {
      lkLocalAudioTrack.mediaStreamTrack.enabled = isMicEnabled;
    }

    if (livekitRoom?.state === "connected") {
      try {
        await livekitRoom.localParticipant.setMicrophoneEnabled(isMicEnabled);
        const pub = livekitRoom.localParticipant.getTrackPublication(
          window.LivekitClient.Track.Source.Microphone
        );
        if (pub?.track) {
          lkLocalAudioTrack = pub.track;
          lkLocalAudioTrack.mediaStreamTrack.enabled = isMicEnabled;
        }
      } catch {}
    }
  }

  // ── camera toggle ──────────────────────────────────────────────────────────
  async function toggleCam() {
    isCamEnabled = !isCamEnabled;
    const btn = shadow.getElementById("ju-btn-cam");
    if (btn) btn.classList.toggle("off", !isCamEnabled);

    // Disable/enable the track at hardware level immediately
    if (lkLocalVideoTrack?.mediaStreamTrack) {
      lkLocalVideoTrack.mediaStreamTrack.enabled = isCamEnabled;
    }

    if (isCamEnabled) {
      showLocalPreview();
    } else {
      hideLocalPreview();
    }

    if (livekitRoom?.state === "connected") {
      try {
        await livekitRoom.localParticipant.setCameraEnabled(isCamEnabled);
        const pub = livekitRoom.localParticipant.getTrackPublication(
          window.LivekitClient.Track.Source.Camera
        );
        if (pub?.track) {
          lkLocalVideoTrack = pub.track;
          lkLocalVideoTrack.mediaStreamTrack.enabled = isCamEnabled;
          if (isCamEnabled) showLocalPreview();
        }
      } catch {}
    }
  }

  // ── flip camera ────────────────────────────────────────────────────────────
  async function flipCamera() {
    if (!livekitRoom || livekitRoom.state !== "connected") return;
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    try {
      await livekitRoom.localParticipant.setCameraEnabled(false);
      await livekitRoom.localParticipant.setCameraEnabled(true, {
        facingMode: currentFacingMode,
        resolution: { width: 480, height: 360, frameRate: 24 },
      });
      const pub = livekitRoom.localParticipant.getTrackPublication(
        window.LivekitClient.Track.Source.Camera
      );
      if (pub?.track) {
        lkLocalVideoTrack = pub.track;
        showLocalPreview();
      }
    } catch (e) { console.warn("[JustUS] Flip:", e); }
  }

  // ── show / hide the PIP window ─────────────────────────────────────────────
  function toggleVideoCallWindow() {
    if (!activeRoomId) {
      addEventLog("⚠️ Join or create a watch party first", "System");
      toggleDrawer();
      return;
    }
    if (videoWindow.classList.contains("hidden")) {
      videoWindow.classList.remove("hidden");
      syncVideoElements();
      if (!livekitRoom && !isLkConnecting) connectLiveKitCall(false);
    } else {
      videoWindow.classList.add("hidden");
      syncVideoElements();
    }
  }

  // ── pill / drawer state ────────────────────────────────────────────────────
  function updateVideoPillState() {
    const dot      = shadow.getElementById("ju-video-dot");
    const pillText = shadow.getElementById("ju-video-pill-text");
    const pill     = shadow.getElementById("ju-video-pill");
    if (!pill) return;

    if (!activeRoomId) { pill.classList.add("hidden"); return; }
    pill.classList.remove("hidden");

    if (isVideoCallActive) {
      if (dot) dot.className = "status-dot active";
      pill.classList.add("active");
      if (pillText) pillText.textContent = "📹 In Call";
    } else {
      if (dot) dot.className = "status-dot idle";
      pill.classList.remove("active");
      if (pillText) pillText.textContent = "📹 Video Call";
    }

    const drawerBtn = shadow.getElementById("ju-drawer-video-btn");
    if (drawerBtn) {
      drawerBtn.className = `action-btn ${isVideoCallActive ? "emerald" : "indigo"}`;
      drawerBtn.textContent = isVideoCallActive
        ? "📹 Open Video PIP Window"
        : "📹 Start / Join Video Call";
    }
  }

  // ── auto start ─────────────────────────────────────────────────────────────
  function scheduleAutoVideoCall() {
    if (autoCallScheduled || isVideoCallActive || isLkConnecting) return;
    autoCallScheduled = true;
    setTimeout(() => {
      if (!activeRoomId || isVideoCallActive || isLkConnecting) return;
      if (videoWindow.classList.contains("hidden")) {
        toggleVideoCallWindow();
      } else if (!livekitRoom) {
        connectLiveKitCall(false);
      }
    }, 800);
  }
