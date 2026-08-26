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

  function loadLiveKitSDK(callback) {
    if (window.LivekitClient) {
      callback();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/livekit-client@2.9.2/dist/livekit-client.umd.min.js";
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
        connectLiveKitCall();
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

  async function connectLiveKitCall() {
    if (!activeRoomId || isLiveKitConnecting) return;
    isLiveKitConnecting = true;
    const waitingText = shadow.getElementById("ju-waiting-text");
    if (waitingText) waitingText.textContent = "Connecting video call...";

    loadLiveKitSDK(async () => {
      try {
        const participantId = currentUserName;
        const tokenResult = await fetchLiveKitTokenWithRetry(activeRoomId, participantId, currentUserName, isHost);

        if (!tokenResult || !tokenResult.token) {
          throw new Error("Could not connect to video server. Please check your network.");
        }

        const { token, wsUrl } = tokenResult;

        const room = new window.LivekitClient.Room({
          adaptiveStream: false,
          dynacast: false,
          publishDefaults: {
            simulcast: false,
            videoCodec: getVideoCodec(),
          },
          videoCaptureDefaults: {
            resolution: getVideoCapturePreset(),
          },
        });
        livekitRoom = room;

        room.on(window.LivekitClient.RoomEvent.LocalTrackPublished, (publication) => {
          const track = publication.track;
          if (!track || track.kind !== window.LivekitClient.Track.Kind.Video) return;
          localVideoTrack = track;
          const localVideoEl = shadow.getElementById("ju-local-video");
          if (localVideoEl) {
            attachVideoTrack(track, localVideoEl);
            localVideoEl.classList.remove("hidden");
          }
        });

        room.on(window.LivekitClient.RoomEvent.TrackSubscribed, (track, pub, participant) => {
          const waitingOverlay = shadow.getElementById("ju-video-waiting");
          if (track.kind === window.LivekitClient.Track.Kind.Video) {
            remoteVideoTrack = track;
            const remoteVideo = shadow.getElementById("ju-remote-video");
            if (remoteVideo) {
              attachVideoTrack(track, remoteVideo);
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

        room.on(window.LivekitClient.RoomEvent.TrackPublished, (publication, participant) => {
          if (participant.isLocal) return;
          if (publication.kind === window.LivekitClient.Track.Kind.Video && publication.track) {
            remoteVideoTrack = publication.track;
            const remoteVideo = shadow.getElementById("ju-remote-video");
            const waitingOverlay = shadow.getElementById("ju-video-waiting");
            if (remoteVideo) attachVideoTrack(publication.track, remoteVideo);
            if (waitingOverlay) waitingOverlay.classList.add("hidden");
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
          leaveLiveKitCall();
        });

        await room.connect(wsUrl, token);
        isVideoCallActive = true;
        updateVideoPillState();

        room.remoteParticipants.forEach((participant) => {
          participant.videoTrackPublications.forEach((pub) => {
            if (!pub.isSubscribed && typeof pub.setSubscribed === "function") {
              pub.setSubscribed(true);
            }
          });
        });

        try {
          await room.localParticipant.setCameraEnabled(true);
        } catch (e) {
          console.warn("[JustUS] Camera setup notice:", e);
          addEventLog("⚠️ Camera unavailable — check app permissions", "System");
        }

        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (e) {
          console.warn("[JustUS] Microphone setup notice:", e);
        }

        // Bind video tracks that were already publishing when we joined
        room.remoteParticipants.forEach((participant) => {
          participant.videoTrackPublications.forEach((pub) => {
            if (pub.track && pub.isSubscribed) {
              remoteVideoTrack = pub.track;
              const remoteVideo = shadow.getElementById("ju-remote-video");
              if (remoteVideo) attachVideoTrack(pub.track, remoteVideo);
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

  function leaveLiveKitCall() {
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
          await livekitRoom.localParticipant.setCameraEnabled(false);
        } else {
          await livekitRoom.localParticipant.setCameraEnabled(true);
          if (localVideoEl) {
            localVideoEl.classList.remove("hidden");
            if (localVideoTrack) attachVideoTrack(localVideoTrack, localVideoEl);
          }
        }
      } catch (e) {}
    } else if (isCamEnabled && livekitRoom) {
      try {
        await livekitRoom.localParticipant.setCameraEnabled(true);
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
        await livekitRoom.localParticipant.setCameraEnabled(false);
        localVideoTrack = await window.LivekitClient.createLocalVideoTrack({
          facingMode: currentFacingMode,
          resolution: getVideoCapturePreset(),
        });
        const localVideoEl = shadow.getElementById("ju-local-video");
        if (localVideoEl && localVideoTrack) {
          attachVideoTrack(localVideoTrack, localVideoEl);
          localVideoEl.classList.remove("hidden");
        }
        if (localVideoTrack) {
          await livekitRoom.localParticipant.publishTrack(localVideoTrack, {
            simulcast: false,
            videoCodec: getVideoCodec(),
          });
        }
      } catch (e) {}
    }
  }

  function scheduleAutoVideoCall() {
    setTimeout(() => {
      if (!activeRoomId || isVideoCallActive || isLiveKitConnecting) return;
      if (videoWindow && videoWindow.classList.contains("hidden")) {
        toggleVideoCallWindow();
      } else {
        connectLiveKitCall();
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