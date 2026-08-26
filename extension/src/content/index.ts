import { IPlayerAdapter } from "./adapters/base-adapter";
import { NetflixAdapter } from "./adapters/netflix-adapter";
import { PrimeAdapter } from "./adapters/prime-adapter";
import { YouTubeAdapter } from "./adapters/youtube-adapter";
import { GenericAdapter } from "./adapters/generic-adapter";
import { SyncEngine } from "./sync/sync-engine";
import { TelepartySidebarUI } from "./ui/teleparty-sidebar";
import { RoomSession } from "../shared/types";

let currentAdapter: IPlayerAdapter | null = null;
let currentSyncEngine: SyncEngine | null = null;
let currentSidebarUI: TelepartySidebarUI | null = null;
let activeRoomId: string | null = null;

function detectService(): "netflix" | "prime" | "youtube" | "generic" {
  const host = window.location.hostname;
  if (host.includes("netflix.com")) return "netflix";
  if (host.includes("primevideo.com") || host.includes("amazon.")) return "prime";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  return "generic";
}

function createAdapter(): IPlayerAdapter {
  const service = detectService();
  if (service === "netflix") return new NetflixAdapter();
  if (service === "prime") return new PrimeAdapter();
  if (service === "youtube") return new YouTubeAdapter();
  return new GenericAdapter();
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const formattedMins = mins < 10 ? `0${mins}` : `${mins}`;
  const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;
  return `${formattedMins}:${formattedSecs}`;
}

export function startPartySession(session: RoomSession) {
  if (activeRoomId === session.roomId && currentSidebarUI) {
    console.log("[JustUs / Teleparty] Session already running for room:", session.roomId);
    return;
  }
  activeRoomId = session.roomId;
  console.log("[JustUs / Teleparty] Starting party session:", session);

  // 1. Clean previous session if any
  stopPartySession();

  // 2. Mount Teleparty sidebar IMMEDIATELY (0ms delay)
  const sidebarUI = new TelepartySidebarUI({
    onSendMessage: (text) => {
      currentSyncEngine?.sendChatMessage(text);
    },
    onSendReaction: (emoji) => {
      currentSyncEngine?.sendChatMessage(emoji);
    },
    onLeaveParty: () => {
      chrome.runtime.sendMessage({ type: "LEAVE_ROOM" });
      stopPartySession();
    },
  });
  currentSidebarUI = sidebarUI;
  sidebarUI.mount(session.roomId, session.userName || "Host", session.isHost);

  // 3. Instantiate Player Adapter
  const adapter = createAdapter();
  currentAdapter = adapter;

  // 4. Instantiate SyncEngine
  const syncEngine = new SyncEngine(
    adapter,
    session.roomId,
    session.userName || "Host",
    session.isHost
  );
  currentSyncEngine = syncEngine;

  syncEngine.setCallbacks({
    onDriftUpdate: (driftMs) => {
      sidebarUI.updateDrift(driftMs);
    },
    onParticipantJoined: (userName, color) => {
      sidebarUI.addParticipantJoinLog(userName, color || "#4ECDC4");
    },
    onParticipantLeft: (userName) => {
      sidebarUI.addParticipantLeaveLog(userName);
    },
    onParticipantCountChange: (count) => {
      sidebarUI.setParticipantCount(count);
    },
    onChatReceived: (message) => {
      const emojis = ["🥰", "😡", "😭", "😂", "🤠", "🔥"];
      if (emojis.includes(message.text.trim())) {
        sidebarUI.showFloatingReaction(message.text.trim());
      }
      sidebarUI.addChatMessage(message);
    },
    onPlaybackAction: (action, time, sender) => {
      const timeStr = formatTime(time);
      sidebarUI.addPlaybackEvent(action, timeStr, sender);
    },
    onConnectionStateChange: (status) => {
      chrome.runtime.sendMessage({
        type: "SET_STATUS",
        payload: { status: status === "connected" ? "connected" : "idle" },
      });
    },
  });

  // 5. Initialize Player Adapter and SyncEngine
  adapter.init().then((success) => {
    if (success) {
      console.log("[JustUS] Player hook active!");
      syncEngine.start();
    } else {
      console.log("[JustUS] Video element standing by on page...");
    }
  });
}

function stopPartySession() {
  activeRoomId = null;
  if (currentSyncEngine) {
    currentSyncEngine.stop();
    currentSyncEngine = null;
  }
  if (currentSidebarUI) {
    currentSidebarUI.destroy();
    currentSidebarUI = null;
  }
  if (currentAdapter) {
    currentAdapter.destroy();
    currentAdapter = null;
  }
}

// Check URL hash fragment (`#tp=...` or `#justus=...`), URL params, or stored session
async function checkInitialSession() {
  const hash = window.location.hash;
  const urlParams = new URLSearchParams(window.location.search);

  let partyId = urlParams.get("partyId") || urlParams.get("party") || urlParams.get("justus");
  let userName = "";

  if (hash.includes("tp=") || hash.includes("justus=")) {
    try {
      const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
      partyId = hashParams.get("tp") || hashParams.get("justus") || hashParams.get("partyId") || partyId;
      userName = hashParams.get("user") || userName;
      // Clean the hash from the browser address bar without reload
      history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (e) {}
  }

  if (partyId) {
    console.log("[JustUs / Teleparty] Auto-launching from party parameter:", partyId);
    const session: RoomSession = {
      roomId: partyId,
      userName: userName || "Viewer_" + Math.floor(Math.random() * 1000),
      isHost: false,
      service: detectService(),
      status: "connecting",
      createdAt: Date.now(),
    };
    chrome.runtime.sendMessage({
      type: "JOIN_ROOM",
      payload: { roomId: partyId, userName: session.userName, isHost: false },
    });
    startPartySession(session);
    return;
  }

  // Check Chrome Storage
  chrome.storage.local.get(["justus_session"], (res) => {
    if (res.justus_session?.roomId && res.justus_session?.status !== "idle") {
      startPartySession(res.justus_session);
    }
  });
}

window.addEventListener("yt-navigate-finish", () => {
  if (!activeRoomId) {
    checkInitialSession();
  }
});

// Runtime listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "START_PARTY" && message.session) {
    startPartySession(message.session);
  } else if (message.type === "STOP_PARTY") {
    stopPartySession();
  }
});

// Run bootstrap
checkInitialSession();
