  // Track URL changes when host opens a movie or switches episodes
  let lastRecordedUrl = window.location.href;
  function checkUrlChange() {
    if (!activeRoomId || !isHost) return;
    const currentUrl = window.location.href;
    if (isSameVideoUrl(currentUrl, lastRecordedUrl)) return;
    const isVideoPage = currentUrl.includes("/watch") || currentUrl.includes("/title/") || currentUrl.includes("/video/");
    if (isVideoPage) {
      lastRecordedUrl = currentUrl;
      fetch(`${API_BASE}/api/rooms`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeRoomId,
          videoUrl: currentUrl,
          title: document.title || "Watch Party",
        }),
      }).catch(() => {});

      if (activeChannel) {
        activeChannel.send({
          type: "broadcast",
          event: "VIDEO_CHANGED",
          payload: {
            videoUrl: currentUrl,
            title: document.title || "Watch Party",
            sender: currentUserName,
          },
        });
      }
    }
  }

  window.addEventListener("yt-navigate-finish", checkUrlChange);
  window.addEventListener("yt-page-data-updated", checkUrlChange);
  window.addEventListener("popstate", checkUrlChange);

  // Periodic video, URL, and wake lock watcher to catch dynamic DOM changes
  setInterval(() => {
    attachLocalPlayerListeners();
    checkUrlChange();
    const playing = isVideoPlaying();
    if (playing !== isWakeLockRequested) {
      setWakeLock(playing);
    }
  }, 2000);
