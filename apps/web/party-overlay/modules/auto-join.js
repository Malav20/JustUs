  // Check URL hash for auto-join (#justus=ju_xxx)
  function checkUrlHash() {
    const hash = window.location.hash;
    if (hash.includes("justus=")) {
      const code = hash.split("justus=")[1].split("&")[0];
      if (code) {
        joinParty(code);
      }
    }
  }
  checkUrlHash();

  function leaveParty(isLocalInitiated = true) {
    setWakeLock(false);
    leaveLiveKitCall();
    if (videoWindow) videoWindow.classList.add("hidden");
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    if (isLocalInitiated && isHost && activeRoomId) {
      const roomIdToPurge = activeRoomId;
      // 1. Broadcast to peers that host has ended the party
      if (activeChannel) {
        try {
          activeChannel.send({
            type: "broadcast",
            event: "HOST_LEFT",
            payload: { sender: currentUserName },
          });
        } catch (e) {}
      }

      // 2. Direct Supabase purge
      if (supabaseClient) {
        supabaseClient.from("chat_messages").delete().eq("room_id", roomIdToPurge).then(() => {}).catch(() => {});
        supabaseClient.from("room_participants").delete().eq("room_id", roomIdToPurge).then(() => {}).catch(() => {});
        supabaseClient.from("rooms").delete().eq("id", roomIdToPurge).then(() => {}).catch(() => {});
      }

      // 3. API endpoint purge
      fetch(`${API_BASE}/api/rooms?id=${encodeURIComponent(roomIdToPurge)}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
    }

    if (activeChannel && supabaseClient) {
      supabaseClient.removeChannel(activeChannel);
      activeChannel = null;
    }
    activeRoomId = null;
    isHost = false;
    savePartyState();
    updatePillState();
    renderDrawerContent();
  }
