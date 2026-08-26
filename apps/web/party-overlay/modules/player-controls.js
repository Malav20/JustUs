  // SCREEN WAKE LOCK CONTROLLER (Keep Screen Awake while Playing)
  // ─────────────────────────────────────────────────────────────────
  let overlayWakeLockSentinel = null;
  let isWakeLockRequested = false;

  async function setWakeLock(enable) {
    isWakeLockRequested = enable;

    // 1. Android Native Bridge
    try {
      if (window.AndroidWakeLock && typeof window.AndroidWakeLock.setKeepScreenOn === "function") {
        window.AndroidWakeLock.setKeepScreenOn(enable);
      }
    } catch (e) {}

    // 2. iOS WKWebView Message Handler Bridge
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.wakeLock) {
        window.webkit.messageHandlers.wakeLock.postMessage({ keepAwake: enable });
      }
    } catch (e) {}

    // 3. Web Screen Wake Lock API (Safari 16.4+, Chrome, Edge, Mobile Browsers)
    try {
      if ("wakeLock" in navigator && typeof navigator.wakeLock.request === "function") {
        if (enable) {
          if (!overlayWakeLockSentinel || overlayWakeLockSentinel.released) {
            overlayWakeLockSentinel = await navigator.wakeLock.request("screen");
            overlayWakeLockSentinel.addEventListener("release", () => {
              overlayWakeLockSentinel = null;
            });
          }
        } else {
          if (overlayWakeLockSentinel && !overlayWakeLockSentinel.released) {
            await overlayWakeLockSentinel.release();
            overlayWakeLockSentinel = null;
          }
        }
      }
    } catch (e) {}
  }

  // Resilient visibility and network reconnect handlers
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (isWakeLockRequested || isVideoPlaying()) {
          setWakeLock(true);
        }
        // Re-verify and restore channel connectivity on tab resume
        if (activeRoomId && supabaseClient) {
          if (!activeChannel || activeChannel.state === "errored" || activeChannel.state === "closed") {
            console.log("[JustUS] Tab resumed, reconnecting Realtime channel...");
            connectRealtimeChannel(activeRoomId, isHost);
          }
        }
      }
    });

    window.addEventListener("online", () => {
      console.log("[JustUS] Network back online, restoring party state...");
      if (activeRoomId && supabaseClient) {
        connectRealtimeChannel(activeRoomId, isHost);
      }
    });
  }

  function playVideo() {
    setWakeLock(true);
    // 1. Netflix Player API
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.play === "function") {
      try {
        netflixPlayer.play();
        return;
      } catch (e) {}
    }

    // 2. YouTube Player API
    const ytp = getYouTubePlayer();
    if (ytp) {
      try {
        ytp.playVideo();
      } catch (e) {}
    }

    // YouTube Large Play Button (unstarted stream overlay)
    const ytpLargePlay = document.querySelector(".ytp-large-play-button, .ytp-cued-thumbnail-overlay-image");
    if (ytpLargePlay) {
      try {
        ytpLargePlay.click();
      } catch (e) {}
    }

    // YouTube Play/Pause Toggle button
    const ytpPlayBtn = document.querySelector(".ytp-play-button, button.player-control-play-pause-icon, .player-controls-middle button");
    const v = findVideoElement();
    if (ytpPlayBtn && v && v.paused) {
      try {
        ytpPlayBtn.click();
      } catch (e) {}
    }

    // Prime Video Play Button
    const primePlayBtn = document.querySelector("button.paused, button[aria-label*='Play'], button.atvwebplayersdk-playpause-button");
    if (primePlayBtn && v && v.paused) {
      try {
        primePlayBtn.click();
      } catch (e) {}
    }

    // 3. HTML5 Video Element Fallback
    if (v) {
      if (v.paused) {
        const playPromise = v.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            const playBtn = document.querySelector("button[data-uia='control-play-pause'], .ytp-play-button, .ytp-large-play-button");
            if (playBtn) playBtn.click();
          });
        }
      }
    }
  }

  function pauseVideo() {
    setWakeLock(false);
    // 1. Netflix Player API
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.pause === "function") {
      try {
        netflixPlayer.pause();
        return;
      } catch (e) {}
    }

    // 2. YouTube Player API
    const ytp = getYouTubePlayer();
    if (ytp) {
      try {
        ytp.pauseVideo();
      } catch (e) {}
    }

    const v = findVideoElement();
    // YouTube Play/Pause Toggle button
    const ytpPlayBtn = document.querySelector(".ytp-play-button");
    if (ytpPlayBtn && v && !v.paused) {
      try {
        ytpPlayBtn.click();
      } catch (e) {}
    }

    // Prime Video Pause Button
    const primePauseBtn = document.querySelector("button[aria-label*='Pause']");
    if (primePauseBtn && v && !v.paused) {
      try {
        primePauseBtn.click();
      } catch (e) {}
    }

    // 3. HTML5 Video Element
    if (v && !v.paused) {
      try {
        v.pause();
      } catch (e) {}
      const playBtn = document.querySelector("button[data-uia='control-play-pause']");
      if (playBtn) playBtn.click();
    }
  }

  function seekVideo(timeInSeconds) {
    if (timeInSeconds < 0.5) return;
    // 1. Netflix Player API
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.seek === "function") {
      try {
        netflixPlayer.seek(timeInSeconds * 1000);
        return;
      } catch (e) {}
    }

    // 2. YouTube Player API
    const ytp = getYouTubePlayer();
    if (ytp && typeof ytp.seekTo === "function") {
      try {
        ytp.seekTo(timeInSeconds, true);
      } catch (e) {}
    }

    // 3. HTML5 Video Element
    const v = findVideoElement();
    if (v) {
      try {
        v.currentTime = timeInSeconds;
      } catch (e) {}
    }
  }

  let currentPlaybackRate = 1.0;
  function setPlaybackRate(rate) {
    if (Math.abs(currentPlaybackRate - rate) < 0.01) return;
    currentPlaybackRate = rate;
    const ytp = getYouTubePlayer();
    if (ytp && typeof ytp.setPlaybackRate === "function") {
      try {
        ytp.setPlaybackRate(rate);
      } catch (e) {}
    }
    const v = findVideoElement();
    if (v) {
      try {
        v.playbackRate = rate;
      } catch (e) {}
    }
  }

  function getCurrentVideoTime() {
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.getCurrentTime === "function") {
      return netflixPlayer.getCurrentTime() / 1000;
    }
    const ytp = getYouTubePlayer();
    if (ytp && typeof ytp.getCurrentTime === "function") {
      const t = ytp.getCurrentTime();
      if (typeof t === "number" && !isNaN(t) && t > 0) return t;
    }
    const v = findVideoElement();
    return v ? v.currentTime : 0;
  }

  function isVideoPlaying() {
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.isPlaying === "function") {
      return netflixPlayer.isPlaying();
    }
    const ytp = getYouTubePlayer();
    if (ytp && typeof ytp.getPlayerState === "function") {
      const s = ytp.getPlayerState();
      // 1 = PLAYING, 3 = BUFFERING
      if (s === 1 || s === 3) return true;
      if (s === 2 || s === 0 || s === -1) return false;
    }
    const v = findVideoElement();
    return Boolean(v && !v.paused && !v.ended);
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const formattedMins = mins < 10 ? `0${mins}` : `${mins}`;
    const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;
    return `${formattedMins}:${formattedSecs}`;
  }

  // ─────────────────────────────────────────────────────────────────