  // DRAWER RENDERING
  // ─────────────────────────────────────────────────────────────────
  let currentTab = "host"; // 'host' | 'join'

  function renderDrawerContent() {
    if (!activeRoomId) {
      // Idle Screen (Host / Join)
      drawer.innerHTML = `
        <div class="drawer-header">
          <div class="brand-title">
            <img src="${API_BASE}/logo.png" style="width: 22px; height: 22px; border-radius: 6px; object-fit: cover;" />
            <span>JustUS Watch Party</span>
          </div>
          <button class="close-btn" id="ju-close-drawer">✕</button>
        </div>

        <div class="tabs-bar">
          <button class="tab-btn ${currentTab === "host" ? "active" : ""}" id="ju-tab-host">🎉 Host Party</button>
          <button class="tab-btn ${currentTab === "join" ? "active" : ""}" id="ju-tab-join">🍿 Join Party</button>
        </div>

        <div class="drawer-body">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 10px; font-weight: 700; color: #94A3B8;">YOUR NAME</label>
            <input type="text" id="ju-username-input" class="input-field" value="${currentUserName}" placeholder="Enter your name" />
          </div>

          ${
            currentTab === "host"
              ? `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px; font-size: 11px; color: #CBD5E1;">
              <strong>Host Mode:</strong> Start a party for the currently playing video. A shareable invite link will be generated for your friends on iPad, iPhone, and Desktop.
            </div>
            <button class="action-btn" id="ju-create-party-btn">🎉 Create Watch Party</button>
          `
              : `
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 10px; font-weight: 700; color: #94A3B8;">ROOM CODE / INVITE URL</label>
              <input type="text" id="ju-room-code-input" class="input-field" placeholder="e.g. ju_abc123 or paste link" />
            </div>
            <button class="action-btn indigo" id="ju-join-party-btn">🍿 Join Watch Party</button>
          `
          }
        </div>
      `;

      shadow.getElementById("ju-close-drawer")?.addEventListener("click", (e) => closeDrawer(e));
      shadow.getElementById("ju-tab-host")?.addEventListener("click", () => {
        currentTab = "host";
        renderDrawerContent();
      });
      shadow.getElementById("ju-tab-join")?.addEventListener("click", () => {
        currentTab = "join";
        renderDrawerContent();
      });

      const nameInput = shadow.getElementById("ju-username-input");
      if (nameInput) {
        nameInput.addEventListener("change", (e) => {
          currentUserName = e.target.value.trim() || currentUserName;
          localStorage.setItem("justus_username", currentUserName);
        });
      }

      shadow.getElementById("ju-create-party-btn")?.addEventListener("click", () => {
        const u = shadow.getElementById("ju-username-input")?.value.trim();
        if (u) {
          currentUserName = u;
          localStorage.setItem("justus_username", u);
        }
        createParty();
      });

      shadow.getElementById("ju-join-party-btn")?.addEventListener("click", () => {
        const codeInput = shadow.getElementById("ju-room-code-input")?.value.trim();
        const u = shadow.getElementById("ju-username-input")?.value.trim();
        if (u) {
          currentUserName = u;
          localStorage.setItem("justus_username", u);
        }
        if (codeInput) {
          joinParty(codeInput);
        }
      });
    } else {
      // Active Party Screen (Event feed, Presence, Chat, Sync, Video Call)
      const inviteUrl = `${API_BASE}/join/${activeRoomId}`;
      drawer.innerHTML = `
        <div class="drawer-header">
          <div class="brand-title">
            <img src="${API_BASE}/logo.png" style="width: 20px; height: 20px; border-radius: 6px; object-fit: cover;" />
            <span class="status-dot"></span>
            <span>Party Active</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="action-header-btn" id="ju-leave-party" title="Leave Party">Leave</button>
            <button class="close-btn" id="ju-minimize-drawer" title="Minimize / Hide Sidebar">✕</button>
          </div>
        </div>

        <div class="drawer-body">
          <div class="party-active-card">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
              <span style="color: #94A3B8;">Room Code:</span>
              <strong style="color: #fff; letter-spacing: 0.5px;">${activeRoomId}</strong>
            </div>
            <div class="room-badge">
              <span style="color: #94A3B8; truncate; max-width: 170px;">${inviteUrl}</span>
              <button class="copy-btn" id="ju-copy-invite">📋 Copy</button>
            </div>
          </div>

          <!-- Video Call Section Inside Sidebar -->
          <div class="party-active-card" style="background: ${isVideoCallActive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(99, 102, 241, 0.08)'}; border-color: ${isVideoCallActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="status-dot ${isVideoCallActive ? 'active' : 'idle'}"></span>
                <span style="font-size: 11px; font-weight: 700; color: #F1F5F9;">FaceTime / Video Call</span>
              </div>
              <span style="font-size: 10px; font-weight: 600; color: ${isVideoCallActive ? '#10B981' : '#A5B4FC'};">
                ${isVideoCallActive ? "🟢 Active" : "Ready"}
              </span>
            </div>
            <button class="action-btn ${isVideoCallActive ? 'emerald' : 'indigo'}" id="ju-drawer-video-btn" style="padding: 10px; font-size: 12px; margin-top: 4px;">
              ${isVideoCallActive ? "📹 Open Video PIP Window" : "📹 Start / Join Video Call"}
            </button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; color: #94A3B8; padding: 0 2px;">
            <span>LIVE EVENT FEED</span>
            <span id="ju-participant-count" style="color: #10B981;">🟢 1 Online</span>
          </div>

          <div class="event-feed" id="ju-event-feed"></div>

          <div class="reactions-bar">
            <button class="reaction-btn" data-emoji="❤️">❤️</button>
            <button class="reaction-btn" data-emoji="😂">😂</button>
            <button class="reaction-btn" data-emoji="🍿">🍿</button>
            <button class="reaction-btn" data-emoji="🔥">🔥</button>
            <button class="reaction-btn" data-emoji="😮">😮</button>
            <button class="reaction-btn" data-emoji="👏">👏</button>
          </div>

          <form id="ju-chat-form" class="chat-input-bar">
            <input type="text" id="ju-chat-input" class="input-field" placeholder="Send a message to room..." />
            <button type="submit" class="action-btn indigo" style="width: auto; padding: 0 14px;">➔</button>
          </form>
        </div>
      `;

      shadow.getElementById("ju-minimize-drawer")?.addEventListener("click", (e) => closeDrawer(e));
      shadow.getElementById("ju-leave-party")?.addEventListener("click", leaveParty);
      shadow.getElementById("ju-drawer-video-btn")?.addEventListener("click", () => {
        toggleVideoCallWindow();
      });
      shadow.getElementById("ju-copy-invite")?.addEventListener("click", () => {
        navigator.clipboard.writeText(inviteUrl);
        const btn = shadow.getElementById("ju-copy-invite");
        if (btn) {
          btn.textContent = "✓ Copied";
          setTimeout(() => (btn.textContent = "📋 Copy"), 2000);
        }
      });

      // Quick Reactions
      shadow.querySelectorAll(".reaction-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const emoji = btn.getAttribute("data-emoji");
          if (emoji && activeChannel) {
            sendChat(emoji);
          }
        });
      });

      // Chat Form
      shadow.getElementById("ju-chat-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = shadow.getElementById("ju-chat-input");
        if (input && input.value.trim()) {
          sendChat(input.value.trim());
          input.value = "";
        }
      });

      renderFeed();
    }
  }

  function updatePillState() {
    const dot = shadow.getElementById("ju-status-dot");
    const text = shadow.getElementById("ju-pill-text");
    const vPill = shadow.getElementById("ju-video-pill");
    if (!dot || !text) return;
    if (activeRoomId) {
      dot.className = "status-dot";
      text.textContent = `👥 Party: ${activeRoomId}`;
      if (vPill) vPill.classList.remove("hidden");
    } else {
      dot.className = "status-dot idle";
      text.textContent = "🎉 Watch Party";
      if (vPill) vPill.classList.add("hidden");
    }
    updateVideoPillState();
  }

  // ─────────────────────────────────────────────────────────────────