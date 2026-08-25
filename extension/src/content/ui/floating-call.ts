import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant } from "livekit-client";
import { CONFIG } from "../../shared/constants";
import { ChatMessage } from "../../shared/types";

export class FloatingCallUI {
  private container: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private livekitRoom: Room | null = null;
  
  // Video element refs
  private remoteVideoEl: HTMLVideoElement | null = null;
  private localVideoEl: HTMLVideoElement | null = null;
  private driftBadge: HTMLElement | null = null;
  private chatMessagesEl: HTMLElement | null = null;

  // AV State
  private micEnabled = true;
  private cameraEnabled = true;
  private isChatOpen = false;

  private onSendMessage?: (text: string) => void;

  constructor(options?: { onSendMessage?: (text: string) => void }) {
    this.onSendMessage = options?.onSendMessage;
  }

  public mount() {
    if (document.getElementById("justus-floating-root")) return;

    this.container = document.createElement("div");
    this.container.id = "justus-floating-root";
    this.shadow = this.container.attachShadow({ mode: "open" });

    this.render();
    document.body.appendChild(this.container);
    this.initDraggable();
    this.bindEvents();
  }

  public async connectWebRTC(roomId: string, userName: string, isHost = false) {
    try {
      console.log(`[JustUs Floating UI] Requesting LiveKit token for room ${roomId}...`);
      
      let token = "";
      let wsUrl = CONFIG.LIVEKIT_WS_URL;

      try {
        const res = await fetch(`${CONFIG.WEB_API_URL}/api/livekit/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName: roomId,
            identity: userName,
            name: userName,
            isHost,
          }),
        });
        const data = await res.json();
        if (data.token) {
          token = data.token;
          wsUrl = data.wsUrl || wsUrl;
        }
      } catch (err) {
        console.warn("[JustUs] Web token API unreachable, using client connection fallback");
      }

      if (!token) {
        console.log("[JustUs] WebRTC token not retrieved. Standby mode.");
        return;
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub, participant: RemoteParticipant) => {
        console.log(`[JustUs] Track subscribed: ${track.kind} from ${participant.identity}`);
        if (track.kind === Track.Kind.Video && this.remoteVideoEl) {
          track.attach(this.remoteVideoEl);
        }
        if (track.kind === Track.Kind.Audio) {
          const audio = track.attach();
          if (this.shadow) this.shadow.appendChild(audio);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
      });

      await room.connect(wsUrl, token);
      this.livekitRoom = room;
      console.log("[JustUs] LiveKit WebRTC connected successfully!");

      // Enable local camera and mic
      try {
        await room.localParticipant.enableCameraAndMicrophone();
        const videoTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
        if (videoTrack && this.localVideoEl) {
          videoTrack.attach(this.localVideoEl);
        }
      } catch (e: any) {
        console.warn("[JustUs] Local AV permission warning:", e.message);
      }
    } catch (err: any) {
      console.error("[JustUs] LiveKit connection error:", err);
    }
  }

  public updateDrift(driftMs: number) {
    if (this.driftBadge) {
      this.driftBadge.textContent = `${driftMs}ms`;
      if (driftMs < 300) {
        this.driftBadge.style.color = "#10B981"; // green
      } else if (driftMs < 600) {
        this.driftBadge.style.color = "#F59E0B"; // yellow
      } else {
        this.driftBadge.style.color = "#EF4444"; // red
      }
    }
  }

  public addChatMessage(msg: ChatMessage) {
    if (!this.chatMessagesEl) return;
    const msgDiv = document.createElement("div");
    msgDiv.style.cssText = "margin-bottom: 6px; font-size: 11px; line-height: 1.4;";
    msgDiv.innerHTML = `<span style="font-weight: 700; color: #818CF8;">${this.escapeHtml(msg.sender)}:</span> <span style="color: #E2E8F0;">${this.escapeHtml(msg.text)}</span>`;
    this.chatMessagesEl.appendChild(msgDiv);
    this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
  }

  private render() {
    if (!this.shadow) return;

    this.shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        
        #justus-overlay-panel {
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 2147483647;
          width: 280px;
          background: rgba(18, 20, 31, 0.95);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05);
          overflow: hidden;
          user-select: none;
        }

        .panel-header {
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.03);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: grab;
        }
        .panel-header:active { cursor: grabbing; }

        .logo-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
          font-size: 13px;
          color: #fff;
        }

        .dot-live {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10B981;
          box-shadow: 0 0 8px #10B981;
        }

        .drift-tag {
          font-size: 10px;
          font-family: monospace;
          background: rgba(0, 0, 0, 0.4);
          padding: 2px 6px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #10B981;
        }

        /* Video Feeds Container */
        .video-container {
          position: relative;
          width: 100%;
          height: 180px;
          background: #000;
          overflow: hidden;
        }

        .remote-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #090A0F;
        }

        .local-video-pip {
          position: absolute;
          bottom: 10px;
          right: 10px;
          width: 76px;
          height: 56px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          object-fit: cover;
          transform: scaleX(-1);
          background: #12141F;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
        }

        /* Controls Bar */
        .controls-bar {
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.02);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .btn-icon {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #fff;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-icon:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .btn-icon.disabled-state {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.4);
          color: #EF4444;
        }

        /* Chat Section */
        #justus-chat-box {
          display: none;
          padding: 10px 14px;
          background: rgba(0, 0, 0, 0.5);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .chat-msgs {
          height: 100px;
          overflow-y: auto;
          margin-bottom: 8px;
          padding-right: 4px;
        }

        .chat-input-row {
          display: flex;
          gap: 6px;
        }

        .chat-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          padding: 6px 10px;
          color: #fff;
          font-size: 11px;
          outline: none;
        }

        .chat-send-btn {
          background: #6366F1;
          border: none;
          border-radius: 8px;
          color: #fff;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
      </style>

      <div id="justus-overlay-panel">
        <div class="panel-header" id="panel-drag-handle">
          <div class="logo-title">
            <div class="dot-live"></div>
            <span>JustUs Party</span>
          </div>
          <div class="drift-tag" id="drift-badge">0ms</div>
        </div>

        <div class="video-container">
          <video class="remote-video" id="remote-feed" autoplay playsinline></video>
          <video class="local-video-pip" id="local-feed" autoplay playsinline muted></video>
        </div>

        <div class="controls-bar">
          <button class="btn-icon" id="btn-toggle-mic" title="Mute/Unmute Mic">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          </button>

          <button class="btn-icon" id="btn-toggle-camera" title="Camera On/Off">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
          </button>

          <button class="btn-icon" id="btn-toggle-chat" title="Toggle Chat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
          </button>
        </div>

        <div id="justus-chat-box">
          <div class="chat-msgs" id="chat-messages-container"></div>
          <form class="chat-input-row" id="chat-form">
            <input type="text" class="chat-input" id="chat-text-input" placeholder="Chat with party..." />
            <button type="submit" class="chat-send-btn">Send</button>
          </form>
        </div>
      </div>
    `;

    this.remoteVideoEl = this.shadow.getElementById("remote-feed") as HTMLVideoElement;
    this.localVideoEl = this.shadow.getElementById("local-feed") as HTMLVideoElement;
    this.driftBadge = this.shadow.getElementById("drift-badge");
    this.chatMessagesEl = this.shadow.getElementById("chat-messages-container");
  }

  private bindEvents() {
    if (!this.shadow) return;

    const btnMic = this.shadow.getElementById("btn-toggle-mic");
    const btnCam = this.shadow.getElementById("btn-toggle-camera");
    const btnChat = this.shadow.getElementById("btn-toggle-chat");
    const chatBox = this.shadow.getElementById("justus-chat-box");
    const chatForm = this.shadow.getElementById("chat-form");
    const chatInput = this.shadow.getElementById("chat-text-input") as HTMLInputElement;

    btnMic?.addEventListener("click", async () => {
      if (!this.livekitRoom) return;
      this.micEnabled = !this.micEnabled;
      await this.livekitRoom.localParticipant.setMicrophoneEnabled(this.micEnabled);
      btnMic.classList.toggle("disabled-state", !this.micEnabled);
    });

    btnCam?.addEventListener("click", async () => {
      if (!this.livekitRoom) return;
      this.cameraEnabled = !this.cameraEnabled;
      await this.livekitRoom.localParticipant.setCameraEnabled(this.cameraEnabled);
      btnCam.classList.toggle("disabled-state", !this.cameraEnabled);
    });

    btnChat?.addEventListener("click", () => {
      this.isChatOpen = !this.isChatOpen;
      if (chatBox) chatBox.style.display = this.isChatOpen ? "block" : "none";
    });

    chatForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!chatInput?.value.trim()) return;
      const text = chatInput.value.trim();
      chatInput.value = "";
      if (this.onSendMessage) this.onSendMessage(text);
    });
  }

  private initDraggable() {
    if (!this.shadow) return;
    const handle = this.shadow.getElementById("panel-drag-handle");
    const panel = this.shadow.getElementById("justus-overlay-panel");
    if (!handle || !panel) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    handle.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      panel.style.right = "auto";
      panel.style.left = `${initialLeft}px`;
      panel.style.top = `${initialTop}px`;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.left = `${Math.max(10, initialLeft + dx)}px`;
      panel.style.top = `${Math.max(10, initialTop + dy)}px`;
    });

    window.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  public destroy() {
    if (this.livekitRoom) {
      this.livekitRoom.disconnect();
      this.livekitRoom = null;
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
