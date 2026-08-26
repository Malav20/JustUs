  // Purge room only when host CLOSES the tab/browser — not on same-site navigation.
  // We use the visibilitychange + pagehide pattern because beforeunload fires on both
  // tab close AND same-site navigation, which was destroying the room when the host
  // clicked a video on YouTube.
  let isTabClosing = false;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // Could be tab close or navigation. We set a flag and let pagehide confirm.
      isTabClosing = true;
    } else {
      isTabClosing = false;
    }
  });
  window.addEventListener("pagehide", (e) => {
    // e.persisted === true means the page is being put in bfcache (navigation, not close)
    // For actual tab close, persisted is typically false
    if (isHost && activeRoomId && !e.persisted) {
      // Check if navigating within same streaming site (don't delete room)
      const savedRoom = sessionStorage.getItem("justus_active_room");
      if (savedRoom) {
        // Party state is saved — this is a same-site navigation, don't delete
        return;
      }
      fetch(`${API_BASE}/api/rooms?id=${encodeURIComponent(activeRoomId)}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
    }
  });

  // Auto-rejoin: If the script re-initializes (YouTube full page nav) and we have
  // a saved party in sessionStorage, reconnect to the realtime channel automatically.
  if (restorePartyState() && activeRoomId) {
    loadSupabase(() => {
      connectRealtimeChannel(activeRoomId, isHost);
      updatePillState();
      if (isHost) {
        // Broadcast the new URL to viewers once the channel is connected.
        // Retry because channel subscription is async.
        const currentUrl = window.location.href;
        let broadcastAttempts = 0;
        const broadcastInterval = setInterval(() => {
          broadcastAttempts++;
          if (activeChannel) {
            try {
              activeChannel.send({
                type: "broadcast",
                event: "VIDEO_CHANGED",
                payload: {
                  videoUrl: currentUrl,
                  title: document.title || "Watch Party",
                  sender: currentUserName,
                },
              });
              clearInterval(broadcastInterval);
            } catch (e) {}
          }
          if (broadcastAttempts > 12) clearInterval(broadcastInterval);
        }, 500);
      }
    });
  }
})();
