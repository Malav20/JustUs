
  let lastUserActionTime = 0;

  function releaseSyncLock() {
    setTimeout(() => (isSyncActionInProgress = false), SYNC.SYNC_ACTION_COOLDOWN_MS);
  }

  function applySyncPlayerAction(fn) {
    isSyncActionInProgress = true;
    try {
      fn();
    } finally {
      releaseSyncLock();
    }
  }

  function handleRemotePlay(payload) {
    if (payload.sender === currentUserName) return;
    isInitialSyncCompleted = true;
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    addEventLog(`▶️ Played video at ${timeStr}`, sender);
    lastUserActionTime = Date.now();
    applySyncPlayerAction(() => {
      const current = getCurrentVideoTime();
      const now = Date.now();
      const target = playTargetTime(payload.time, payload.sentAt || now, now);
      if (shouldSeek(current, target)) {
        seekVideo(target);
      }
      playVideo();
    });
  }

  function handleRemotePause(payload) {
    if (payload.sender === currentUserName) return;
    isInitialSyncCompleted = true;
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    addEventLog(`⏸️ Paused video at ${timeStr}`, sender);
    lastUserActionTime = Date.now();
    applySyncPlayerAction(() => {
      pauseVideo();
      if (
        payload.time > SYNC.MIN_MEANINGFUL_TIME_S &&
        Math.abs(getCurrentVideoTime() - payload.time) > SYNC.HARD_SEEK_WHILE_PAUSED_S
      ) {
        seekVideo(payload.time);
      }
    });
  }

  function handleRemoteSeek(payload) {
    if (payload.sender === currentUserName) return;
    if (!payload || payload.time < SYNC.MIN_MEANINGFUL_TIME_S) return;
    isInitialSyncCompleted = true;
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    const current = getCurrentVideoTime();
    if (Math.abs(current - payload.time) < SYNC.EVENT_SEEK_THRESHOLD_S) return;

    addEventLog(`⏩ Jumped to ${timeStr}`, sender);
    lastUserActionTime = Date.now();
    applySyncPlayerAction(() => {
      seekVideo(payload.time);
    });
  }

  function handleRemoteHeartbeat(payload) {
    if (payload.sender === currentUserName) return;
    if (isSyncActionInProgress) return;

    if (Date.now() - lastUserActionTime < SYNC.USER_ACTION_GRACE_MS) return;

    if (payload.videoUrl && !isHost) {
      const currentUrl = window.location.href;
      const targetUrl = normalizeStreamingUrl(payload.videoUrl);
      const isVideoPage = targetUrl.includes("/watch") || targetUrl.includes("/title/") || targetUrl.includes("/video/");
      if (!isSameVideoUrl(currentUrl, targetUrl) && isVideoPage) {
        const sep = targetUrl.includes("#") ? "&" : "#";
        window.location.href = targetUrl + sep + "justus=" + activeRoomId;
        return;
      }
    }

    const now = Date.now();
    const localPlaying = isVideoPlaying();
    const remotePlaying = !!payload.isPlaying;

    if (!isInitialSyncCompleted) {
      isInitialSyncCompleted = true;
      applySyncPlayerAction(() => {
        const target = playTargetTime(payload.time, payload.sentAt || now, now);
        if (target > SYNC.MIN_MEANINGFUL_TIME_S) {
          seekVideo(target);
        }
        if (remotePlaying) playVideo();
        else pauseVideo();
      });
      return;
    }

    // Reconcile play state when explicit PLAY/PAUSE was missed (safe: sync lock blocks echo).
    if (remotePlaying !== localPlaying) {
      applySyncPlayerAction(() => {
        if (remotePlaying) playVideo();
        else pauseVideo();
      });
      return;
    }

    const correction = computeHeartbeatPositionCorrection(
      {
        currentTime: getCurrentVideoTime(),
        payloadTime: payload.time,
        isPlaying: remotePlaying,
        sentAt: payload.sentAt || now,
        now,
      },
      localPlaying
    );

    applySyncPlayerAction(() => {
      if (correction.seekTo !== undefined) {
        seekVideo(correction.seekTo);
        if (correction.playbackRate !== undefined) {
          setPlaybackRate(correction.playbackRate);
        }
      } else if (correction.playbackRate !== undefined) {
        setPlaybackRate(correction.playbackRate);
      }
    });
  }

  function handleRequestState(payload) {
    if (!activeChannel || payload.sender === currentUserName) return;
    activeChannel.send({
      type: "broadcast",
      event: "STATE_RESPONSE",
      payload: {
        time: getCurrentVideoTime(),
        isPlaying: isVideoPlaying(),
        videoUrl: window.location.href,
        title: document.title,
        sender: currentUserName,
        isHost: isHost,
        sentAt: Date.now(),
      },
    });
  }

  function handleStateResponse(payload) {
    if (isInitialSyncCompleted) return;
    if (payload.sender === currentUserName) return;
    isInitialSyncCompleted = true;

    if (payload.videoUrl && !isHost) {
      const currentUrl = window.location.href;
      const targetUrl = normalizeStreamingUrl(payload.videoUrl);
      const isVideoPage = targetUrl.includes("/watch") || targetUrl.includes("/title/") || targetUrl.includes("/video/");
      if (!isSameVideoUrl(currentUrl, targetUrl) && isVideoPage) {
        const sep = targetUrl.includes("#") ? "&" : "#";
        window.location.href = targetUrl + sep + "justus=" + activeRoomId;
        return;
      }
    }

    const now = Date.now();
    applySyncPlayerAction(() => {
      const target = playTargetTime(payload.time, payload.sentAt || now, now);
      if (target > SYNC.MIN_MEANINGFUL_TIME_S) {
        seekVideo(target);
      }
      if (payload.isPlaying) playVideo();
      else pauseVideo();
    });
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (!activeChannel || isSyncActionInProgress || !isInitialSyncCompleted) return;
      const current = getCurrentVideoTime();
      if (current < SYNC.MIN_MEANINGFUL_TIME_S && !isVideoPlaying()) return;

      activeChannel.send({
        type: "broadcast",
        event: "SYNC_HEARTBEAT",
        payload: {
          time: current,
          isPlaying: isVideoPlaying(),
          videoUrl: window.location.href,
          title: document.title,
          sender: currentUserName,
          isHost: isHost,
          sentAt: Date.now(),
        },
      });
    }, SYNC.HEARTBEAT_INTERVAL_MS);
  }

  function attachLocalPlayerListeners() {
    const v = findVideoElement();
    if (!v) {
      setTimeout(attachLocalPlayerListeners, 1000);
      return;
    }

    if (boundVideoEl === v) return;
    boundVideoEl = v;

    v.addEventListener("play", () => {
      setWakeLock(true);
      if (isSyncActionInProgress || !activeChannel) return;
      lastUserActionTime = Date.now();
      const time = v.currentTime;
      activeChannel.send({
        type: "broadcast",
        event: "PLAY",
        payload: { time, isPlaying: true, sender: currentUserName, isHost: isHost, sentAt: Date.now() },
      });
      addEventLog(`▶️ You played the video at ${formatTime(time)}`, currentUserName);
    });

    v.addEventListener("playing", () => {
      setWakeLock(true);
    });

    v.addEventListener("pause", () => {
      setWakeLock(false);
      if (isSyncActionInProgress || !activeChannel) return;
      lastUserActionTime = Date.now();
      const time = v.currentTime;
      activeChannel.send({
        type: "broadcast",
        event: "PAUSE",
        payload: { time, isPlaying: false, sender: currentUserName, isHost: isHost, sentAt: Date.now() },
      });
      addEventLog(`⏸️ You paused the video at ${formatTime(time)}`, currentUserName);
    });

    v.addEventListener("ended", () => {
      setWakeLock(false);
    });

    v.addEventListener("emptied", () => {
      setWakeLock(false);
    });

    v.addEventListener("seeked", () => {
      if (isSyncActionInProgress || !activeChannel) return;
      const time = v.currentTime;
      if (time < SYNC.MIN_MEANINGFUL_TIME_S) return;
      lastUserActionTime = Date.now();
      activeChannel.send({
        type: "broadcast",
        event: "SEEK",
        payload: { time, isPlaying: !v.paused, sender: currentUserName, isHost: isHost, sentAt: Date.now() },
      });
      addEventLog(`⏩ You jumped to ${formatTime(time)}`, currentUserName);
    });
  }
