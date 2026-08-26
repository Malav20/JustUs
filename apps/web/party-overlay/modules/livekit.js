  // ─── LiveKit Video Call ────────────────────────────────────────────────────
  //
  // iOS WKWebView rules this code is written around:
  //   1. Never set the `autoplay` attribute — iOS low-power mode shows a native
  //      pause overlay when autoplay fires. Call play() programmatically instead.
  //   2. Use srcObject, not track.attach() for local preview inside Shadow DOM.
  //      track.attach() creates its own <video>, invisible to WKWebView's inline-
  //      playback policy when the element lives in a Shadow root.
  //   3. Reset srcObject inside setTimeout(0) after first assignment — Safari
  //      sometimes renders one black frame until this refresh triggers re-paint.
  //   4. Mute/unmute via mediaStreamTrack.enabled only. LiveKit's .mute()
  //      sends a server signal too, which causes a round-trip re-acquire on iOS.
  //   5. Camera off/on = track.enabled toggle + hide PIP. Never stop() the track
  //      mid-call — iOS cannot re-acquire camera hardware until the next gesture.
  //   6. Keep one MediaStream per <video>. Do not create a new stream on toggle.
  // ──────────────────────────────────────────────────────────────────────────

  let livekitRoom       = null;
  let lkLocalVideoTrack = null;   // LiveKit LocalVideoTrack
  let lkLocalAudioTrack = null;   // LiveKit LocalAudioTrack
  let remoteAudioEl     = null;
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
    s.onload  = () => window.LivekitClient && cb();
    s.onerror = () => addEventLog("⚠️ Could not load video SDK", "System");
    (document.head || document.documentElement).appendChild(s);
  }

  // ── video element helper ───────────────────────────────────────────────────
  // Mirrors what LiveKit's own Track.ts does for Safari/iOS.
  // srcObject is set twice: once immediately and once in setTimeout(0) to force
  // WebKit to repaint. play() is called only here — never again elsewhere.
  function setSrcAndPlay(videoEl, mediaStream) {
    if (!videoEl || !mediaStream) return;
    videoEl.muted        = true;
    videoEl.playsInline  = true;
    videoEl.controls     = false;
    videoEl.disablePictureInPicture = true;
    // Do NOT set autoplay attribute — iOS low-power mode overlays it.
    videoEl.srcObject = mediaStream;
    setTimeout(() => {
      // Re-assign in a new task forces WebKit to redraw after layout.
      videoEl.srcObject = mediaStream;
      videoEl.play().catch(() => {});
    }, 0);
  }

  // ── local preview ──────────────────────────────────────────────────────────
  function showLocalPreview() {
    if (!lkLocalVideoTrack) return;
    const el = shadow.getElementById("ju-local-video");
    if (!el) return;
    const mst = lkLocalVideoTrack.mediaStreamTrack;
    if (!mst) return;
    // Reuse existing stream if same track, avoids stutter on toggle.
    const existing = el.srcObject instanceof MediaStream
      ? el.srcObject.getVideoTracks()[0]
      : null;
    if (existing !== mst) {
      setSrcAndPlay(el, new MediaStream([mst]));
    } else if (el.paused) {
      el.play().catch(() => {});
    }
    el.style.visibility = "";
    el.style.opacity    = "1";
  }

  function hideLocalPreview() {
    const el = shadow.getElementById("ju-local-video");
    if (!el) return;
    el.style.visibility = "hidden";
    el.style.opacity    = "0";
  }

  // ── remote video ───────────────────────────────────────────────────────────
  function showRemoteVideo(track) {
    const el = shadow.getElementById("ju-remote-video");
    if (!el || !track) return;
    const mst = track.mediaStreamTrack;
    if (!mst) return;
    const existing = el.srcObject instanceof MediaStream
      ? el.srcObject.getVideoTracks()[0]
      : null;
    if (existing !== mst) {
      setSrcAndPlay(el, new MediaStream([mst]));
    } else if (el.paused) {
      el.play().catch(() => {});
    }
    const waiting = shadow.getElementById("ju-video-waiting");
    if (waiting) waiting.classList.add("hidden");
  }

  // ── token fetch ────────────────────────────────────────────────────────────
  async function fetchToken(roomName, identity, userName, host) {
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

  // ── connect ─────────────────────────────────────────────────────────────────
  async function connectLiveKitCall(isReconnect) {
    if (!activeRoomId || isLkConnecting) return;
    if (livekitRoom && livekitRoom.state === "connected") return;

    isLkConnecting = true;
    userHungUp     = false;

    const waitEl = shadow.getElementById("ju-waiting-text");
    if (waitEl) waitEl.textContent = "Connecting video call…";

    loadLiveKitSDK(async () => {
      try {
        const LK = window.LivekitClient;
        const identity   = getLkIdentity();
        const tokenData  = await fetchToken(activeRoomId, identity, currentUserName, isHost);
        if (!tokenData) throw new Error("Could not get video call token.");

        const { token, wsUrl } = tokenData;

        const room = new LK.Room({
          adaptiveStream : false,
          dynacast       : false,
          publishDefaults: { simulcast: false, videoCodec: "vp8" },
          videoCaptureDefaults: { resolution: { width: 480, height: 360, frameRate: 24 } },
        });
        livekitRoom = room;

        // ── remote track arrives ─────────────────────────────────────────────
        room.on(LK.RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === LK.Track.Kind.Video) {
            showRemoteVideo(track);
          }
          if (track.kind === LK.Track.Kind.Audio) {
            // Audio: let LiveKit attach to a plain <audio> outside Shadow DOM
            // so iOS AVAudioSession routes it correctly.
            if (remoteAudioEl) {
              try { remoteAudioEl.remove(); } catch {}
            }
            remoteAudioEl = track.attach();
            remoteAudioEl.volume = 1.0;
            // Append to document body — NOT Shadow DOM — for AVAudioSession routing.
            document.body.appendChild(remoteAudioEl);
          }
        });

        room.on(LK.RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === LK.Track.Kind.Video) {
            const waiting = shadow.getElementById("ju-video-waiting");
            if (waiting) waiting.classList.remove("hidden");
          }
          try { track.detach(); } catch {}
        });

        room.on(LK.RoomEvent.ParticipantDisconnected, () => {
          const waiting = shadow.getElementById("ju-video-waiting");
          if (waiting) {
            waiting.classList.remove("hidden");
            const wt = shadow.getElementById("ju-waiting-text");
            if (wt) wt.textContent = "Friend left call";
          }
        });

        // iOS low-power / background: WebKit pauses video without warning.
        // room.startVideo() resumes all stalled video elements.
        room.on(LK.RoomEvent.VideoPlaybackStatusChanged, () => {
          if (!room.canPlaybackVideo) {
            room.startVideo().catch(() => {});
          }
        });

        room.on(LK.RoomEvent.Disconnected, onDisconnected);

        // ── connect ──────────────────────────────────────────────────────────
        await room.connect(wsUrl, token);
        isVideoCallActive = true;
        updateVideoPillState();

        // ── publish microphone ───────────────────────────────────────────────
        if (isMicEnabled) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            const micPub = room.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
            if (micPub?.track) {
              lkLocalAudioTrack = micPub.track;
              // Ensure enabled at the hardware level
              if (lkLocalAudioTrack.mediaStreamTrack) {
                lkLocalAudioTrack.mediaStreamTrack.enabled = true;
              }
            }
          } catch (e) {
            console.warn("[JustUS] Mic:", e);
          }
        }

        // ── publish camera ───────────────────────────────────────────────────
        if (isCamEnabled) {
          try {
            await room.localParticipant.setCameraEnabled(true);
            const camPub = room.localParticipant.getTrackPublication(LK.Track.Source.Camera);
            if (camPub?.track) {
              lkLocalVideoTrack = camPub.track;
              showLocalPreview();
            }
          } catch (e) {
            console.warn("[JustUS] Camera:", e);
            addEventLog("⚠️ Camera unavailable — check app permissions", "System");
          }
        }

        // ── subscribe to remote tracks already in room ───────────────────────
        room.remoteParticipants.forEach((p) => {
          p.videoTrackPublications.forEach((pub) => {
            if (!pub.isSubscribed) {
              try { pub.setSubscribed(true); } catch {}
            }
            if (pub.track && pub.isSubscribed) showRemoteVideo(pub.track);
          });
        });

        if (waitEl) waitEl.textContent = "Waiting for friend to join…";

      } catch (err) {
        console.error("[JustUS] LiveKit:", err);
        const waitEl2 = shadow.getElementById("ju-waiting-text");
        if (waitEl2) waitEl2.textContent = `Error: ${err.message || "Connection failed"}`;
      } finally {
        isLkConnecting = false;
      }
    });
  }

  // ── disconnect handler ─────────────────────────────────────────────────────
  function onDisconnected() {
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
        if (!userHungUp && activeRoomId && !livekitRoom) {
          connectLiveKitCall(true);
        }
      }, 2500);
    }
  }

  // ── hang up ────────────────────────────────────────────────────────────────
  function leaveLiveKitCall() {
    userHungUp        = true;
    autoCallScheduled = false;
    clearTimeout(reconnectTimer);
    clearLkIdentity();

    // Stop hardware tracks so camera light turns off
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

    hideLocalPreview();
    const remoteEl = shadow.getElementById("ju-remote-video");
    if (remoteEl) remoteEl.srcObject = null;

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
  // Rules: use mediaStreamTrack.enabled for instant hardware mute.
  // Also call setMicrophoneEnabled so the server/remote sees correct state.
  async function toggleMic() {
    isMicEnabled = !isMicEnabled;
    const btn = shadow.getElementById("ju-btn-mic");
    if (btn) btn.classList.toggle("off", !isMicEnabled);

    // Hardware-level mute first — instant, no round-trip
    if (lkLocalAudioTrack?.mediaStreamTrack) {
      lkLocalAudioTrack.mediaStreamTrack.enabled = isMicEnabled;
    }

    // Also tell LiveKit server so remote participants see correct state
    if (livekitRoom?.state === "connected") {
      try {
        await livekitRoom.localParticipant.setMicrophoneEnabled(isMicEnabled);
        // Re-capture track reference in case LiveKit re-acquired it
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
  // Rules: NEVER stop() the camera mid-call on iOS — can't re-acquire without gesture.
  // Use mediaStreamTrack.enabled to produce black frames when "off".
  async function toggleCam() {
    isCamEnabled = !isCamEnabled;
    const btn = shadow.getElementById("ju-btn-cam");
    if (btn) btn.classList.toggle("off", !isCamEnabled);

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
      // Disable old track first to release hardware
      if (lkLocalVideoTrack?.mediaStreamTrack) {
        lkLocalVideoTrack.mediaStreamTrack.enabled = false;
      }
      // LiveKit restartTrack re-acquires with new constraints
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
    } catch (e) {
      console.warn("[JustUS] Flip camera:", e);
    }
  }

  // ── toggle the PIP window ──────────────────────────────────────────────────
  function toggleVideoCallWindow() {
    if (!activeRoomId) {
      addEventLog("⚠️ Join or create a watch party first", "System");
      toggleDrawer();
      return;
    }

    if (videoWindow.classList.contains("hidden")) {
      videoWindow.classList.remove("hidden");
      if (!livekitRoom && !isLkConnecting) connectLiveKitCall(false);
    } else {
      videoWindow.classList.add("hidden");
    }
  }

  // ── pill state ─────────────────────────────────────────────────────────────
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
      if (videoWindow && videoWindow.classList.contains("hidden")) {
        toggleVideoCallWindow();
      } else if (!livekitRoom) {
        connectLiveKitCall(false);
      }
    }, 800);
  }
