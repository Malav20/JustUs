  // ─────────────────────────────────────────────────────────────────
  function addEventLog(text, sender = "System", type = "event") {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const entry = { text, sender, time, type };
    eventLogs.push(entry);
    appendFeedItem(entry); // Incremental append — avoids O(n^2) full-feed rebuild per message.
  }

  // Escape peer-supplied strings before they touch innerHTML (prevents chat XSS).
  function escapeOverlayHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function feedItemNode(e) {
    const item = document.createElement("div");
    item.className = "feed-item" + (e.type === "chat" ? " chat" : "");
    item.innerHTML = `
        <div class="feed-header">
          <span class="feed-sender">${escapeOverlayHtml(e.sender)}</span>
          <span>${escapeOverlayHtml(e.time)}</span>
        </div>
        <div>${escapeOverlayHtml(e.text)}</div>
      `;
    return item;
  }

  function appendFeedItem(e) {
    const feedEl = shadow.getElementById("ju-event-feed");
    if (!feedEl) return;
    feedEl.appendChild(feedItemNode(e));
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  function renderFeed() {
    const feedEl = shadow.getElementById("ju-event-feed");
    if (!feedEl) return;
    feedEl.textContent = "";
    const frag = document.createDocumentFragment();
    for (const e of eventLogs) frag.appendChild(feedItemNode(e));
    feedEl.appendChild(frag);
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  // ─────────────────────────────────────────────────────────────────