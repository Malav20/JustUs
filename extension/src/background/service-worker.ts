import { CONFIG } from "../shared/constants";
import { ExtensionMessage, RoomSession } from "../shared/types";

// State cache
let currentSession: RoomSession = {
  roomId: "",
  userName: "",
  isHost: false,
  service: "generic",
  status: "idle",
  createdAt: 0,
};

// Initialize from chrome storage
chrome.storage.local.get(["justus_session"], (result) => {
  if (result.justus_session) {
    currentSession = result.justus_session;
    updateBadge();
  }
});

function updateBadge() {
  if (currentSession.status === "connected") {
    chrome.action.setBadgeText({ text: "LIVE" });
    chrome.action.setBadgeBackgroundColor({ color: "#10B981" }); // Emerald
  } else if (currentSession.status === "connecting") {
    chrome.action.setBadgeText({ text: "..." });
    chrome.action.setBadgeBackgroundColor({ color: "#6366F1" }); // Indigo
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// Runtime message listener
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === "GET_STATUS") {
    sendResponse({ session: currentSession });
    return true;
  }

  if (message.type === "GET_LIVEKIT_TOKEN") {
    const { roomName, identity, isHost } = message.payload;
    fetch(`${CONFIG.WEB_API_URL}/api/livekit/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomName,
        identity,
        name: identity,
        isHost: Boolean(isHost),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        sendResponse({ success: true, token: data.token, wsUrl: data.wsUrl || CONFIG.LIVEKIT_WS_URL });
      })
      .catch((err) => {
        console.warn("[JustUs SW] Token API fetch failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === "JOIN_ROOM") {
    currentSession = {
      ...currentSession,
      roomId: message.payload.roomId,
      userName: message.payload.userName || "User",
      isHost: Boolean(message.payload.isHost),
      status: "connecting",
      createdAt: Date.now(),
    };
    chrome.storage.local.set({ justus_session: currentSession });
    updateBadge();

    // Broadcast to active tab safely
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "START_PARTY",
          session: currentSession,
        }, () => {
          if (chrome.runtime.lastError) {
            // Tab will bootstrap itself on load
          }
        });
      }
    });

    sendResponse({ success: true, session: currentSession });
    return true;
  }

  if (message.type === "LEAVE_ROOM") {
    const roomIdToDelete = message.payload?.roomId || currentSession.roomId;
    const isHostLeaving = message.payload?.isHost ?? currentSession.isHost;

    // If host is leaving, clean up all room data from DB
    if (isHostLeaving && roomIdToDelete) {
      fetch(`${CONFIG.WEB_API_URL}/api/rooms?id=${encodeURIComponent(roomIdToDelete)}`, {
        method: "DELETE",
      }).catch((err) => console.log("[JustUs SW] DB delete note:", err));
    }

    currentSession = {
      roomId: "",
      userName: "",
      isHost: false,
      service: "generic",
      status: "idle",
      createdAt: 0,
    };
    chrome.storage.local.remove(["justus_session"]);
    updateBadge();

    // Broadcast to active tab safely
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "STOP_PARTY" }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    });

    sendResponse({ success: true });
    return true;
  }

  if (message.type === "SET_STATUS") {
    currentSession = { ...currentSession, ...message.payload };
    chrome.storage.local.set({ justus_session: currentSession });
    updateBadge();
    sendResponse({ success: true, session: currentSession });
    return true;
  }
});

// Auto-detect join navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    if (tab.url.includes("#tp=")) {
      try {
        const hash = new URL(tab.url).hash;
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const partyId = params.get("tp");
        const user = params.get("user") || "Viewer";
        if (partyId) {
          currentSession = {
            roomId: partyId,
            userName: user,
            isHost: false,
            service: tab.url.includes("netflix.com") ? "netflix" : "prime",
            videoUrl: tab.url,
            status: "connecting",
            createdAt: Date.now(),
          };
          chrome.storage.local.set({ justus_session: currentSession });
          updateBadge();
        }
      } catch (e) {}
    }
  }
});

console.log("[JustUs Service Worker] Loaded and ready.");
