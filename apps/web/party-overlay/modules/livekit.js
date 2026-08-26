  // LIVEKIT WEBRTC VIDEO CALLING LOGIC
  // ─────────────────────────────────────────────────────────────────
  let livekitRoom = null;
  let localVideoTrack = null;
  let localAudioTrack = null;
  let remoteVideoTrack = null;
  let remoteAudioEl = null;
  let isVideoCallActive = false;
  let isMicEnabled = true;
  let isCamEnabled = true;
  let currentFacingMode = "user";
  let isLiveKitConnecting = false;
  let livekitReconnectTimer = null;
  let autoVideoCallScheduled = false;
  let userInitiatedLeave = false;

  function getLiveKitIdentity() {
    const storageKey = "justus_livekit_identity";
    try {
      let id = sessionStorage.getItem(storageKey);
      if (!id) {
        id = currentUserName + "_" + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem(storageKey, id);
      }
      return id;
    } catch (e) {
      return currentUserName + "_" + Math.random().toString(36).slice(2, 9);
    }
  }

  function clearLiveKitIdentity() {
    try {
      sessionStorage.removeItem("justus_livekit_identity");
    } catch (e) {}
  }

  function loadLiveKitSDK(callback) {
    if (window.LivekitClient) {
      callback();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/livekit-client@2.6.0/dist/livekit-client.umd.min.js";
    script.onload = () => {
      if (window.LivekitClient) callback();
    };
    script.onerror = () => {
      console.warn("[JustUS] Could not load LiveKit SDK from CDN");
      addEventLog("⚠️ Could not load video call client", "System");
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function toggleVideoCallWindow() {
    if (!activeRoomId) {
      addEventLog("⚠️ Please create or join a watch party first!", "System");
      toggleDrawer();
      return;
    }

    if (videoWindow.classList.contains("hidden")) {
      videoWindow.classList.remove("hidden");
      if (remoteVideoTrack && typeof remoteVideoTrack.setSubscribed === "function") {
        remoteVideoTrack.setSubscribed(true);
      }
      if (videoControls) {
        videoControls.classList.remove("hidden");
        resetControlsHideTimer();
      }
      if (!livekitRoom && !isLiveKitConnecting) {
        connectLiveKitCall(false);
      }
    } else {
      videoWindow.classList.add("hidden");
      if (remoteVideoTrack && typeof remoteVideoTrack.setSubscribed === "function") {
        remoteVideoTrack.setSubscribed(false);
      }
    }
  }

  async function fetchLiveKitTokenWithRetry(roomName, identity, userName, isHost, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(`${API_BASE}/api/livekit/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName,
            identity,
            name: userName,
            isHost: Boolean(isHost),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            return { token: data.token, wsUrl: data.wsUrl || "" };
          }
        }
      } catch (err) {
        console.warn(`[JustUS] Token fetch attempt ${attempt} failed:`, err);
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 600));
      }
    }
    return null;
  }

  async function publishLocalCamera(room) {
    const capturePreset = getVideoCapturePreset();
    localVideoTrack = await window.LivekitClient.createLocalVideoTrack({
      facingMode: currentFacingMode || "user",
      resolution: capturePreset,
    });
    const localVideoEl = shadow.getElementById("ju-local-video");
    if (localVideoEl && localVideoTrack) {
      attachLocalPreview(localVideoTrack, localVideoEl);
    }
    if (localVideoTrack) {
      await room.localParticipant.publishTrack(localVideoTrack);
    }
  }

  async function connectLiveKitCall(isReconnect) {
    if (!activeRoomId || isLiveKitConnecting) return;
    if (livekitRoom && livekitRoom.state === "connected") return;

    isLiveKitConnecting = true;
    userInitiatedLeave = false;
    const waitingText = shadow.getElementById("ju-waiting-text");
    if (waitingText) waitingText.textContent = "Connecting video call...";

    loadLiveKitSDK(async () => {
      try {
        const participantId = getLiveKitIdentity();
        const tokenResult = await fetchLiveKitTokenWithRetry(
          activeRoomId,
          participantId,
          currentUserName,
          isHost
        );

        if (!tokenResult || !tokenResult.token) {
          throw new Error("Could not connect to video server. Please check your network.");
        }

        const { token, wsUrl } = tokenResult;

        const room = new window.LivekitClient.Room({
          adaptiveStream: false,
          dynacast: false,
          publishDefaults: {
            simulcast: false,
            videoCodec: "vp8",
          },
          videoCaptureDefaults: {
            resolution: getVideoCapturePreset(),
          },
        });
        livekitRoom = room;

        room.on(window.LivekitClient.RoomEvent.TrackSubscribed, (track, pub, participant) => {
          const waitingOverlay = shadow.getElementById("ju-video-waiting");
          if (track.kind === window.LivekitClient.Track.Kind.Video) {
            remoteVideoTrack = track;
            const remoteVideo = shadow.getElementById("ju-remote-video");
            if (remoteVideo) {
              remoteVideo.muted = true;
              attachVideoTrack(track, remoteVideo, false);
              if (waitingOverlay) waitingOverlay.classList.add("hidden");
            }
          }
          if (track.kind === window.LivekitClient.Track.Kind.Audio) {
            const audioEl = track.attach();
            remoteAudioEl = audioEl;
            audioEl.volume = 1.0;
            shadow.appendChild(audioEl);
          }
        });

        room.on(window.LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
          track.detach();
          if (track.kind === window.LivekitClient.Track.Kind.Video) {
            if (remoteVideoTrack === track) remoteVideoTrack = null;
            const waitingOverlay = shadow.getElementById("ju-video-waiting");
            if (waitingOverlay) waitingOverlay.classList.remove("hidden");
          }
        });

        room.on(window.LivekitClient.RoomEvent.ParticipantDisconnected, () => {
          const waitingOverlay = shadow.getElementById("ju-video-waiting");
          if (waitingOverlay) {
            waitingOverlay.classList.remove("hidden");
            const wt = shadow.getElementById("ju-waiting-text");
            if (wt) wt.textContent = "Friend left call";
          }
        });

        room.on(window.LivekitClient.RoomEvent.Disconnected, () => {
          onLiveKitDisconnected();
        });

        await room.connect(wsUrl, token);
        isVideoCallActive = true;
        updateVideoPillState();

        const hasLiveTracks =
          isReconnect &&
          localVideoTrack &&
          localVideoTrack.mediaStreamTrack &&
          localVideoTrack.mediaStreamTrack.readyState === "live";

        if (hasLiveTracks) {
          try {
            if (localAudioTrack) {
              await room.localParticipant.publishTrack(localAudioTrack);
            }
            if (localVideoTrack && isCamEnabled) {
              await room.localParticipant.publishTrack(localVideoTrack);
              const localVideoEl = shadow.getElementById("ju-local-video");
              if (localVideoEl) attachLocalPreview(localVideoTrack, localVideoEl);
            }
          } catch (e) {
            console.warn("[JustUS] LiveKit reconnect republish:", e);
          }
        } else {
          // 1. Microphone first (stable order before 336f86d optimization)
          try {
            localAudioTrack = await window.LivekitClient.createLocalAudioTrack({
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            });
            if (localAudioTrack) {
              await room.localParticipant.publishTrack(localAudioTrack);
            }
          } catch (e) {
            console.warn("[JustUS] Microphone setup notice:", e);
          }

          // 2. Camera — direct attach + publish (proven on iOS WKWebView)
          if (isCamEnabled) {
            try {
              await publishLocalCamera(room);
            } catch (e) {
              console.warn("[JustUS] Camera setup notice:", e);
              addEventLog("⚠️ Camera unavailable — check app permissions", "System");
            }
          }
        }

        // Bind remote video already publishing when we joined
        room.remoteParticipants.forEach((participant) => {
          participant.videoTrackPublications.forEach((pub) => {
            if (!pub.isSubscribed && typeof pub.setSubscribed === "function") {
              pub.setSubscribed(true);
            }
            if (pub.track && pub.isSubscribed) {
              remoteVideoTrack = pub.track;
              const remoteVideo = shadow.getElementById("ju-remote-video");
              if (remoteVideo) attachVideoTrack(pub.track, remoteVideo, false);
              const waitingOverlay = shadow.getElementById("ju-video-waiting");
              if (waitingOverlay) waitingOverlay.classList.add("hidden");
            }
          });
        });

        if (waitingText) waitingText.textContent = "Waiting for friend to join call...";
      } catch (err) {
        console.error("[JustUS] LiveKit call error:", err);
        if (waitingText) waitingText.textContent = `Connection error: ${err.message || "Failed to connect"}`;
      } finally {
        isLiveKitConnecting = false;
      }
    });
  }

  function onLiveKitDisconnected() {
    livekitRoom = null;
    isVideoCallActive = false;
    isLiveKitConnecting = false;
    remoteVideoTrack = null;

    if (remoteAudioEl) {
      try {
        remoteAudioEl.remove();
      } catch (e) {}
      remoteAudioEl = null;
    }

    updateVideoPillState();

  // Do NOT stop camera/mic — tearing down media causes iOS preview flicker + reconnect spam.
    if (!userInitiatedLeave && activeRoomId) {
      clearTimeout(livekitReconnectTimer);
      livekitReconnectTimer = setTimeout(() => {
        if (!userInitiatedLeave && activeRoomId && !livekitRoom) {
          connectLiveKitCall(true);
        }
      }, 2000);
    }
  }

  function leaveLiveKitCall() {
    userInitiatedLeave = true;
    clearTimeout(livekitReconnectTimer);
    autoVideoCallScheduled = false;
    clearLiveKitIdentity();
    boundLocalPreviewTrack = null;
    isVideoCallActive = false;
    remoteVideoTrack = null;
    if (localAudioTrack) {
      try {
        localAudioTrack.stop();
        if (localAudioTrack.mediaStreamTrack) localAudioTrack.mediaStreamTrack.stop();
      } catch (e) {}
      localAudioTrack = null;
    }
    if (localVideoTrack) {
      try {
        localVideoTrack.stop();
        if (localVideoTrack.mediaStreamTrack) localVideoTrack.mediaStreamTrack.stop();
      } catch (e) {}
      localVideoTrack = null;
    }
    if (remoteAudioEl) {
      try { remoteAudioEl.remove(); } catch (e) {}
      remoteAudioEl = null;
    }
    if (livekitRoom) {
      try { livekitRoom.disconnect(); } catch (e) {}
      livekitRoom = null;
    }
    const localVideoEl = shadow.getElementById("ju-local-video");
    if (localVideoEl) localVideoEl.classList.add("hidden");
    const waitingOverlay = shadow.getElementById("ju-video-waiting");
    if (waitingOverlay) waitingOverlay.classList.remove("hidden");
    updateVideoPillState();
  }

  async function toggleMic() {
    isMicEnabled = !isMicEnabled;
    const btn = shadow.getElementById("ju-btn-mic");
    if (btn) btn.classList.toggle("off", !isMicEnabled);

    if (localAudioTrack) {
      try {
        if (!isMicEnabled) {
          await localAudioTrack.mute();
        } else {
          await localAudioTrack.unmute();
        }
      } catch (e) {}
    } else if (isMicEnabled && livekitRoom) {
      try {
        localAudioTrack = await window.LivekitClient.createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        if (localAudioTrack) {
          await livekitRoom.localParticipant.publishTrack(localAudioTrack);
        }
      } catch (e) {}
    }
  }

  async function toggleCam() {
    isCamEnabled = !isCamEnabled;
    const btn = shadow.getElementById("ju-btn-cam");
    const localVideoEl = shadow.getElementById("ju-local-video");
    if (btn) btn.classList.toggle("off", !isCamEnabled);

    if (localVideoTrack) {
      try {
        if (!isCamEnabled) {
          if (localVideoEl) localVideoEl.classList.add("hidden");
          await localVideoTrack.mute();
        } else {
          if (localVideoEl) {
            localVideoEl.classList.remove("hidden");
            attachLocalPreview(localVideoTrack, localVideoEl);
          }
          await localVideoTrack.unmute();
        }
      } catch (e) {}
    } else if (isCamEnabled && livekitRoom) {
      try {
        await publishLocalCamera(livekitRoom);
      } catch (e) {}
    }
  }

  async function flipCamera() {
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    const localVideoEl = shadow.getElementById("ju-local-video");
    if (localVideoTrack) {
      const oldTrack = localVideoTrack;
      try {
        if (livekitRoom) await livekitRoom.localParticipant.unpublishTrack(oldTrack, true);
        oldTrack.stop();
        if (oldTrack.mediaStreamTrack) oldTrack.mediaStreamTrack.stop();
      } catch (e) {}
      localVideoTrack = null;
    }
    if (livekitRoom && isCamEnabled) {
      try {
        await publishLocalCamera(livekitRoom);
      } catch (e) {}
    }
  }

  function scheduleAutoVideoCall() {
    if (autoVideoCallScheduled || isVideoCallActive || isLiveKitConnecting) return;
    autoVideoCallScheduled = true;
    setTimeout(() => {
      if (!activeRoomId || isVideoCallActive || isLiveKitConnecting) return;
      if (videoWindow && videoWindow.classList.contains("hidden")) {
        toggleVideoCallWindow();
      } else if (!livekitRoom) {
        connectLiveKitCall(false);
      }
    }, 700);
  }

  function updateVideoPillState() {
    const videoDot = shadow.getElementById("ju-video-dot");
    const videoPillText = shadow.getElementById("ju-video-pill-text");
    const vPill = shadow.getElementById("ju-video-pill");
    if (!vPill) return;

    if (!activeRoomId) {
      vPill.classList.add("hidden");
      return;
    }

    vPill.classList.remove("hidden");

    if (videoDot && videoPillText) {
      if (isVideoCallActive) {
        videoDot.className = "status-dot active";
        vPill.classList.add("active");
        videoPillText.textContent = "📹 In Call";
      } else {
        videoDot.className = "status-dot idle";
        vPill.classList.remove("active");
        videoPillText.textContent = "📹 Video Call";
      }
    }

    const drawerVideoBtn = shadow.getElementById("ju-drawer-video-btn");
    if (drawerVideoBtn) {
      drawerVideoBtn.className = `action-btn ${isVideoCallActive ? "emerald" : "indigo"}`;
      drawerVideoBtn.textContent = isVideoCallActive ? "📹 Open Video PIP Window" : "📹 Start / Join Video Call";
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // LOG EVENT HELPER
