import { CONFIG } from "../shared/constants";
import {
  buildPartyNavigateUrl,
  fetchRoomById,
  inferServiceFromUrl,
  isStreamingUrl,
} from "../shared/room-utils";
import { RoomSession, StreamingService } from "../shared/types";

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
const inactiveJoinCodeInput = document.getElementById("inactive-join-code-input") as HTMLInputElement;
const btnInactiveJoin = document.getElementById("btn-inactive-join") as HTMLButtonElement;

const partyUrlInput = document.getElementById("party-url-input") as HTMLInputElement;
const btnCopyUrl = document.getElementById("btn-copy-url") as HTMLButtonElement;
const statRoomCode = document.getElementById("stat-room-code") as HTMLElement;
const btnOpenPartyVideo = document.getElementById("btn-open-party-video") as HTMLButtonElement;
const btnStopParty = document.getElementById("btn-stop-party") as HTMLButtonElement;

let activeTabId: number | undefined;
let activeTabUrl = "";
let currentSession: RoomSession | null = null;

function parseRoomCode(raw: string): string {
  let code = raw.trim().toUpperCase();
  if (!code) return "";

  if (code.includes("/JOIN/")) {
    const parts = code.split("/JOIN/");
    code = parts[1].split(/[?#]/)[0];
  } else if (code.includes("JUSTUS=")) {
    code = code.split("JUSTUS=")[1].split("&")[0];
  }

  return code;
}

function serviceFromTabUrl(url: string): StreamingService {
  if (url.includes("netflix.com")) return "netflix";
  if (url.includes("primevideo.com") || url.includes("amazon.")) return "prime";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  return "generic";
}

function updateOpenPartyVideoButton() {
  if (!btnOpenPartyVideo || !currentSession) {
    btnOpenPartyVideo?.classList.add("hidden");
    return;
  }

  const needsNavigation =
    !currentSession.isHost &&
    currentSession.roomId &&
    currentSession.status !== "idle" &&
    !isStreamingUrl(activeTabUrl);

  btnOpenPartyVideo.classList.toggle("hidden", !needsNavigation);
}

// Check active tab platform
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentTab = tabs[0];
  activeTabId = currentTab?.id;
  activeTabUrl = currentTab?.url || "";

  const isStreamingPage = isStreamingUrl(activeTabUrl);

  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    const session: RoomSession = response?.session;
    if (session && session.roomId && session.status !== "idle") {
      currentSession = session;
      showActiveView(session);
      updateOpenPartyVideoButton();
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
  currentSession = session;
  readyView.classList.add("hidden");
  activePartyView.classList.remove("hidden");
  inactiveTabView.classList.add("hidden");
  statusPill.classList.add("active");
  statusText.textContent = "Party Live";

  statRoomCode.textContent = session.roomId;
  partyUrlInput.value = `${CONFIG.WEB_API_URL}/join/${session.roomId}`;
  updateOpenPartyVideoButton();
}

function showInactiveView() {
  readyView.classList.add("hidden");
  activePartyView.classList.add("hidden");
  inactiveTabView.classList.remove("hidden");
  statusPill.classList.remove("active");
  statusText.textContent = "Not on video";
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function navigateTabToParty(videoUrl: string, roomId: string, userName: string) {
  const targetUrl = buildPartyNavigateUrl(videoUrl, roomId, userName);

  if (activeTabId) {
    await chrome.tabs.update(activeTabId, { url: targetUrl });
    return;
  }

  const tab = await chrome.tabs.create({ url: targetUrl });
  activeTabId = tab.id;
  activeTabUrl = targetUrl;
}

async function joinPartyWithCode(rawCode: string, userName = "Viewer", joinButton?: HTMLButtonElement) {
  const code = parseRoomCode(rawCode);
  if (!code) return;

  if (joinButton) {
    joinButton.disabled = true;
    joinButton.textContent = "Joining...";
  }

  try {
    const room = await fetchRoomById(code, CONFIG.WEB_API_URL);
    const videoUrl = room?.video_url || "";
    const service = (room?.service as StreamingService) || inferServiceFromUrl(videoUrl);

    const session: RoomSession = {
      roomId: code,
      userName,
      isHost: false,
      service,
      videoUrl,
      status: "connecting",
      createdAt: Date.now(),
    };

    chrome.runtime.sendMessage({
      type: "JOIN_ROOM",
      payload: {
        roomId: code,
        userName,
        isHost: false,
        videoUrl,
        service,
      },
    });

    await navigateTabToParty(videoUrl, code, userName);
    showActiveView(session);
  } catch (err) {
    console.error("[JustUS Popup] Join failed:", err);
  } finally {
    if (joinButton) {
      joinButton.disabled = false;
      joinButton.textContent = "Join";
    }
  }
}

async function openHostVideoForSession() {
  if (!currentSession || currentSession.isHost || !currentSession.roomId) return;

  btnOpenPartyVideo.disabled = true;
  btnOpenPartyVideo.textContent = "Opening video...";

  try {
    let videoUrl = currentSession.videoUrl || "";
    if (!videoUrl) {
      const room = await fetchRoomById(currentSession.roomId, CONFIG.WEB_API_URL);
      videoUrl = room?.video_url || "";
    }

    await navigateTabToParty(videoUrl, currentSession.roomId, currentSession.userName || "Viewer");

    currentSession = { ...currentSession, videoUrl };
    chrome.runtime.sendMessage({
      type: "SET_STATUS",
      payload: { videoUrl },
    });
  } finally {
    btnOpenPartyVideo.disabled = false;
    btnOpenPartyVideo.textContent = "Open Host Video";
  }
}

// Start Party
btnStartParty?.addEventListener("click", async () => {
  const hostName = hostNameInput.value.trim() || "Host";
  const newRoomId = generateRoomCode();

  btnStartParty.disabled = true;
  btnStartParty.textContent = "Starting party...";

  const serviceType = serviceFromTabUrl(activeTabUrl);

  const session: RoomSession = {
    roomId: newRoomId,
    userName: hostName,
    isHost: true,
    service: serviceType,
    videoUrl: activeTabUrl,
    status: "connected",
    createdAt: Date.now(),
  };

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

  chrome.runtime.sendMessage({
    type: "JOIN_ROOM",
    payload: {
      roomId: newRoomId,
      userName: hostName,
      isHost: true,
      videoUrl: activeTabUrl,
      service: serviceType,
    },
  });

  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { type: "START_PARTY", session }, () => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({
          target: { tabId: activeTabId! },
          files: ["content.js"],
        });
      }
    });
  }

  showActiveView(session);
  btnStartParty.disabled = false;
  btnStartParty.textContent = "Start the party";
});

// Quick Join (streaming tab view)
btnQuickJoin?.addEventListener("click", () => {
  joinPartyWithCode(joinCodeInput.value, "Viewer", btnQuickJoin);
});

// Quick Join (inactive tab view)
btnInactiveJoin?.addEventListener("click", () => {
  const code = inactiveJoinCodeInput?.value || joinCodeInput?.value || "";
  joinPartyWithCode(code, "Viewer", btnInactiveJoin);
});

btnOpenPartyVideo?.addEventListener("click", () => {
  openHostVideoForSession();
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
    currentSession = null;
    if (isStreamingUrl(activeTabUrl)) {
      showReadyView();
    } else {
      showInactiveView();
    }
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
