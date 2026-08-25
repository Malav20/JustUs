import { CONFIG } from "../shared/constants";
import { RoomSession } from "../shared/types";

// DOM Views
const readyView = document.getElementById("ready-view") as HTMLElement;
const activePartyView = document.getElementById("active-party-view") as HTMLElement;
const inactiveTabView = document.getElementById("inactive-tab-view") as HTMLElement;

const statusPill = document.getElementById("status-pill") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;

const hostNameInput = document.getElementById("host-name-input") as HTMLInputElement;
const hostOnlyToggle = document.getElementById("host-only-toggle") as HTMLInputElement;
const btnStartParty = document.getElementById("btn-start-party") as HTMLButtonElement;

const joinCodeInput = document.getElementById("join-code-input") as HTMLInputElement;
const btnQuickJoin = document.getElementById("btn-quick-join") as HTMLButtonElement;

const partyUrlInput = document.getElementById("party-url-input") as HTMLInputElement;
const btnCopyUrl = document.getElementById("btn-copy-url") as HTMLButtonElement;
const statRoomCode = document.getElementById("stat-room-code") as HTMLElement;
const btnStopParty = document.getElementById("btn-stop-party") as HTMLButtonElement;

let activeTabId: number | undefined;
let activeTabUrl = "";

// Check active tab platform
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentTab = tabs[0];
  activeTabId = currentTab?.id;
  activeTabUrl = currentTab?.url || "";

  const isStreamingPage =
    activeTabUrl.includes("netflix.com") ||
    activeTabUrl.includes("primevideo.com") ||
    activeTabUrl.includes("amazon.") ||
    activeTabUrl.includes("localhost:3000/sandbox");

  // Check stored session
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    const session: RoomSession = response?.session;
    if (session && session.roomId && session.status !== "idle") {
      showActiveView(session);
    } else if (isStreamingPage) {
      showReadyView();
    } else {
      showInactiveView();
    }
  });
});

function showReadyView() {
  readyView.classList.remove("hidden");
  activePartyView.classList.add("hidden");
  inactiveTabView.classList.add("hidden");
  statusPill.classList.remove("active");
  statusText.textContent = "Ready";
}

function showActiveView(session: RoomSession) {
  readyView.classList.add("hidden");
  activePartyView.classList.remove("hidden");
  inactiveTabView.classList.add("hidden");
  statusPill.classList.add("active");
  statusText.textContent = "Party Live";

  statRoomCode.textContent = session.roomId;
  partyUrlInput.value = `${CONFIG.WEB_API_URL}/join/${session.roomId}`;
}

function showInactiveView() {
  readyView.classList.add("hidden");
  activePartyView.classList.add("hidden");
  inactiveTabView.classList.remove("hidden");
  statusPill.classList.remove("active");
  statusText.textContent = "Not on video";
}

// Start Party
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

btnStartParty?.addEventListener("click", async () => {
  const hostName = hostNameInput.value.trim() || "Host";
  const newRoomId = generateRoomCode();
  const hostOnly = hostOnlyToggle?.checked ?? true;

  btnStartParty.disabled = true;
  btnStartParty.textContent = "Starting party...";

  const session: RoomSession = {
    roomId: newRoomId,
    userName: hostName,
    isHost: true,
    service: activeTabUrl.includes("netflix.com") ? "netflix" : activeTabUrl.includes("primevideo.com") ? "prime" : "generic",
    videoUrl: activeTabUrl,
    status: "connected",
    createdAt: Date.now(),
  };

  // Create room in backend database
  fetch(`${CONFIG.WEB_API_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customId: newRoomId,
      service: session.service,
      videoUrl: activeTabUrl,
      title: "Teleparty Watch Room",
      hostId: hostName,
    }),
  }).catch(() => {});

  // 1. Tell background service worker
  chrome.runtime.sendMessage({
    type: "JOIN_ROOM",
    payload: {
      roomId: newRoomId,
      userName: hostName,
      isHost: true,
    },
  });

  // 2. Direct message to active tab to mount Teleparty sidebar immediately
  if (activeTabId) {
    chrome.tabs.sendMessage(
      activeTabId,
      { type: "START_PARTY", session },
      (res) => {
        // If content script was not yet loaded into active tab, execute it directly
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId: activeTabId! },
            files: ["content.js"],
          });
        }
      }
    );
  }

  showActiveView(session);
});

// Quick Join
btnQuickJoin?.addEventListener("click", () => {
  let code = joinCodeInput.value.trim().toUpperCase();
  if (!code) return;

  if (code.includes("/JOIN/")) {
    const parts = code.split("/JOIN/");
    code = parts[1].split(/[?#]/)[0];
  } else if (code.includes("JUSTUS=")) {
    code = code.split("JUSTUS=")[1].split("&")[0];
  }

  const session: RoomSession = {
    roomId: code,
    userName: "Viewer",
    isHost: false,
    service: activeTabUrl.includes("netflix.com") ? "netflix" : activeTabUrl.includes("primevideo.com") ? "prime" : "generic",
    videoUrl: activeTabUrl,
    status: "connecting",
    createdAt: Date.now(),
  };

  chrome.runtime.sendMessage({
    type: "JOIN_ROOM",
    payload: {
      roomId: code,
      userName: "Viewer",
      isHost: false,
    },
  });

  if (activeTabId) {
    chrome.tabs.sendMessage(
      activeTabId,
      { type: "START_PARTY", session },
      (res) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId: activeTabId! },
            files: ["content.js"],
          });
        }
      }
    );
  }

  showActiveView(session);
});

// Copy Invite Link
btnCopyUrl?.addEventListener("click", () => {
  partyUrlInput.select();
  navigator.clipboard.writeText(partyUrlInput.value);
  btnCopyUrl.textContent = "Copied!";
  setTimeout(() => (btnCopyUrl.textContent = "Copy URL"), 2000);
});

// Stop Party
btnStopParty?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "LEAVE_ROOM" }, () => {
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, { type: "STOP_PARTY" });
    }
    showReadyView();
  });
});

// Mobile & Desktop Quick Link navigation handler
document.querySelectorAll(".tp-service-link").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    const targetUrl = (el as HTMLAnchorElement).href;
    if (targetUrl) {
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: targetUrl });
      } else {
        window.open(targetUrl, "_blank");
      }
    }
  });
});
