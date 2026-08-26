  // PARTY LIFECYCLE & SYNC LOGIC
  // ─────────────────────────────────────────────────────────────────
  function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function createParty() {
    const newRoomId = generateRoomCode();
    isHost = true;
    activeRoomId = newRoomId;
    savePartyState();

    loadSupabase(() => {
      const nowIso = new Date().toISOString();
      const roomPayload = {
        id: newRoomId,
        host_id: currentUserName,
        service: window.location.hostname.includes("prime")
          ? "prime"
          : window.location.hostname.includes("youtube") || window.location.hostname.includes("youtu.be")
          ? "youtube"
          : "netflix",
        video_url: window.location.href,
        title: document.title || "JustUS Watch Party",
        playback_time: 0,
        is_playing: false,
        created_at: nowIso,
        updated_at: nowIso,
      };

      // 1. Direct Supabase insert
      if (supabaseClient) {
        supabaseClient
          .from("rooms")
          .upsert(roomPayload, { onConflict: "id" })
          .then(({ error }) => {
            if (error) {
              console.warn("[JustUS] Direct room create warning:", error.message);
              supabaseClient.from("rooms").insert(roomPayload).catch(() => {});
            } else {
              console.log("[JustUS] Room created in Supabase:", newRoomId);
            }
          })
          .catch(() => {});
      }

      // 2. Post to Vercel Room API
      fetch(`${API_BASE}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customId: newRoomId,
          service: roomPayload.service,
          videoUrl: roomPayload.video_url,
          title: roomPayload.title,
          hostId: currentUserName,
        }),
      }).catch(() => {});

      // 3. Connect Realtime Sync
      connectRealtimeChannel(newRoomId, true);
      addEventLog(`🎉 ${currentUserName} created watch party [${newRoomId}]!`, currentUserName);
      updatePillState();
      renderDrawerContent();
    });
  }

  function joinParty(codeOrUrl) {
    let cleanCode = codeOrUrl.trim().toUpperCase();
    if (cleanCode.includes("/JOIN/")) {
      cleanCode = cleanCode.split("/JOIN/")[1].split("?")[0].split("/")[0];
    } else if (cleanCode.includes("/PARTY/")) {
      cleanCode = cleanCode.split("/PARTY/")[1].split("?")[0].split("/")[0];
    } else if (cleanCode.includes("JUSTUS=")) {
      cleanCode = cleanCode.split("JUSTUS=")[1].split("&")[0];
    }
    isHost = false;
    activeRoomId = cleanCode;
    savePartyState();

    loadSupabase(() => {
      connectRealtimeChannel(cleanCode, false);
      addEventLog(`🍿 You joined party [${cleanCode}]`, currentUserName);
      updatePillState();
      renderDrawerContent();
    });
  }

  function isSameVideoUrl(url1, url2) {
    if (!url1 || !url2) return false;
    try {
      const u1 = new URL(url1, window.location.origin);
      const u2 = new URL(url2, window.location.origin);
      const v1 = u1.searchParams.get("v");
      const v2 = u2.searchParams.get("v");
      if (v1 && v2) return v1 === v2;
      return u1.pathname === u2.pathname && u1.search === u2.search;
    } catch (e) {
      return url1.split("#")[0] === url2.split("#")[0];
    }
  }

  function normalizeStreamingUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    try {
      const u = new URL(rawUrl, window.location.origin);
      if (window.location.hostname.includes("youtube") && u.hostname.includes("youtube")) {
        u.hostname = window.location.hostname;
      }
      return u.toString();
    } catch (e) {
      return rawUrl;
    }
  }

  function connectRealtimeChannel(roomId, asHost) {
    if (!supabaseClient) return;

    if (activeChannel) {
      supabaseClient.removeChannel(activeChannel);
      activeChannel = null;
    }

    activeChannel = supabaseClient.channel(`party:${roomId}`, {
      config: { broadcast: { self: false }, presence: { key: currentUserName } },
    });

    activeChannel
      .on("broadcast", { event: "PLAY" }, ({ payload }) => handleRemotePlay(payload))
      .on("broadcast", { event: "PAUSE" }, ({ payload }) => handleRemotePause(payload))
      .on("broadcast", { event: "SEEK" }, ({ payload }) => handleRemoteSeek(payload))
      .on("broadcast", { event: "SYNC_HEARTBEAT" }, ({ payload }) => handleRemoteHeartbeat(payload))
      .on("broadcast", { event: "REQUEST_STATE" }, ({ payload }) => handleRequestState(payload))
      .on("broadcast", { event: "STATE_RESPONSE" }, ({ payload }) => handleStateResponse(payload))
      .on("broadcast", { event: "HOST_LEFT" }, () => {
        addEventLog("👋 Host ended the watch party", "System");
        leaveParty(false);
      })
      .on("broadcast", { event: "USER_JOINED" }, ({ payload }) => {
        if (payload.userName && payload.userName !== currentUserName) {
          addEventLog(`🍿 ${payload.userName} joined the watch party`, payload.userName);
        }
      })
      .on("broadcast", { event: "CHAT" }, ({ payload }) => {
        addEventLog(payload.text, payload.sender, "chat");
      })
      .on("broadcast", { event: "VIDEO_CHANGED" }, ({ payload }) => {
        if (payload.videoUrl && !isHost) {
          const currentUrl = window.location.href;
          const targetUrl = normalizeStreamingUrl(payload.videoUrl);
          const isVideoPage = targetUrl.includes("/watch") || targetUrl.includes("/title/") || targetUrl.includes("/video/");
          if (!isSameVideoUrl(currentUrl, targetUrl) && isVideoPage) {
            addEventLog(`🎬 Host opened: ${payload.title || "Selected Video"}`, payload.sender);
            const sep = targetUrl.includes("#") ? "&" : "#";
            window.location.href = targetUrl + sep + "justus=" + activeRoomId;
          }
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = activeChannel.presenceState();
        const count = Math.max(1, Object.keys(state).length);
        const countEl = shadow.getElementById("ju-participant-count");
        if (countEl) countEl.textContent = `🟢 ${count} Online`;
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          activeChannel.track({ userName: currentUserName, isHost: asHost, joinedAt: Date.now() });
          activeChannel.send({
            type: "broadcast",
            event: "USER_JOINED",
            payload: { userName: currentUserName, isHost: asHost, sentAt: Date.now() },
          });

          startHeartbeat();

          if (!asHost) {
            // Request initial state from peers
            activeChannel.send({
              type: "broadcast",
              event: "REQUEST_STATE",
              payload: { sender: currentUserName, sentAt: Date.now() },
            });
          }

          // Fetch past chat messages from Supabase directly & API fallback
          if (supabaseClient) {
            supabaseClient
              .from("chat_messages")
              .select("sender, message, created_at")
              .eq("room_id", roomId)
              .order("created_at", { ascending: true })
              .limit(100)
              .then(({ data, error }) => {
                if (data && !error && Array.isArray(data) && data.length > 0) {
                  data.forEach((m) => {
                    addEventLog(m.message, m.sender, "chat");
                  });
                } else {
                  fetch(`${API_BASE}/api/chat?roomId=${encodeURIComponent(roomId)}`)
                    .then((res) => res.json())
                    .then((data) => {
                      if (data && data.messages && Array.isArray(data.messages)) {
                        data.messages.forEach((msg) => {
                          addEventLog(msg.text, msg.sender, "chat");
                        });
                      }
                    })
                    .catch(() => {});
                }
              })
              .catch(() => {});
          } else {
            fetch(`${API_BASE}/api/chat?roomId=${encodeURIComponent(roomId)}`)
              .then((res) => res.json())
              .then((data) => {
                if (data && data.messages && Array.isArray(data.messages)) {
                  data.messages.forEach((msg) => {
                    addEventLog(msg.text, msg.sender, "chat");
                  });
                }
              })
              .catch(() => {});
          }
        }
      });

    attachLocalPlayerListeners();
  }

  function sendChat(text) {
    if (!activeChannel) return;
    const payload = { sender: currentUserName, text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    activeChannel.send({ type: "broadcast", event: "CHAT", payload });
    addEventLog(text, currentUserName, "chat");

    if (activeRoomId) {
      if (supabaseClient) {
        supabaseClient
          .from("chat_messages")
          .insert({
            room_id: activeRoomId,
            sender: currentUserName,
            message: text.trim(),
            created_at: new Date().toISOString(),
          })
          .then(() => {})
          .catch(() => {});
      }

      fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: activeRoomId,
          sender: currentUserName,
          text,
        }),
      }).catch(() => {});
    }
  }