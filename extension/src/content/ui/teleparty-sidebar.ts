import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant, LocalVideoTrack, LocalAudioTrack, createLocalVideoTrack, createLocalAudioTrack, ConnectionState, setLogLevel, LogLevel } from "livekit-client";
import { CONFIG } from "../../shared/constants";
import { ChatMessage } from "../../shared/types";

// Silence non-critical LiveKit WebRTC teardown notices & data channel closure logs
setLogLevel(LogLevel.silent);

export class TelepartySidebarUI {
  private container: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private livekitRoom: Room | null = null;
  private localVideoTrack: LocalVideoTrack | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;

  // DOM references inside Shadow DOM
  private remoteVideoEl: HTMLVideoElement | null = null;
  private localVideoEl: HTMLVideoElement | null = null;
  private chatFeedEl: HTMLElement | null = null;
  private driftBadgeEl: HTMLElement | null = null;
  private sidebarEl: HTMLElement | null = null;
  private participantCountEl: HTMLElement | null = null;
  private videoCallBoxEl: HTMLElement | null = null;

  // States
  private isOpen = true;
  private isVideoCallOpen = true;
  private micEnabled = true;
  private cameraEnabled = true;
  private roomId: string = "";
  private userName: string = "";
  private isHost: boolean = false;
  private avatarColor: string = "#E50914";
  private localMediaTracks: MediaStreamTrack[] = [];
  private remoteAudioEl: HTMLAudioElement | null = null;
  private callVolume = 0.8;
  private micVolume = 1.0;
  private isAudioSettingsOpen = false;

  private onSendMessage?: (text: string) => void;
  private onSendReaction?: (emoji: string) => void;
  private onLeaveParty?: () => void;

  constructor(options?: {
    onSendMessage?: (text: string) => void;
    onSendReaction?: (emoji: string) => void;
    onLeaveParty?: () => void;
  }) {
    this.onSendMessage = options?.onSendMessage;
    this.onSendReaction = options?.onSendReaction;
    this.onLeaveParty = options?.onLeaveParty;
    
    // Pick random Teleparty-style avatar color
    const colors = ["#FF6B6B", "#4ECDC4", "#FFE66D", "#1A535C", "#F7B731", "#5f27cd", "#ff9ff3", "#00d2d3"];
    this.avatarColor = colors[Math.floor(Math.random() * colors.length)];
  }

  public mount(roomId: string, userName: string, isHost = false) {
    this.roomId = roomId;
    this.userName = userName;
    this.isHost = isHost;

    if (document.getElementById("justus-teleparty-root")) {
      document.getElementById("justus-teleparty-root")?.remove();
    }

    this.container = document.createElement("div");
    this.container.id = "justus-teleparty-root";
    this.container.style.cssText = "all: initial !important; position: fixed !important; top: 0px !important; right: 0px !important; width: 330px !important; height: 100vh !important; z-index: 2147483647 !important; display: block !important;";
    this.shadow = this.container.attachShadow({ mode: "open" });

    this.render();
    (document.body || document.documentElement).appendChild(this.container);
    this.adjustPageLayout(true);
    this.bindEvents();

    // Auto-cleanup on tab close or page navigation
    window.addEventListener("beforeunload", () => this.destroy());
    window.addEventListener("pagehide", () => this.destroy());

    if (this.isHost) {
      this.addEventLog(`${this.escapeHtml(userName)} created the party 🎉`, this.avatarColor);
    } else {
      this.addEventLog(`You joined the party 🍿`, this.avatarColor);
    }
  }

  private recentJoinedEvents = new Set<string>();

  public addParticipantJoinLog(userName: string, color = "#4ECDC4") {
    if (!userName || userName === this.userName || this.recentJoinedEvents.has(userName)) return;
    this.recentJoinedEvents.add(userName);
    setTimeout(() => this.recentJoinedEvents.delete(userName), 8000);

    this.addEventLog(`${this.escapeHtml(userName)} joined the party 🍿`, color);
  }

  public adjustPageLayout(open: boolean) {
    try {
      const netflixPlayer = document.querySelector(".watch-video, .sizing-wrapper, video") as HTMLElement;
      if (open) {
        document.documentElement.style.marginRight = "330px";
        document.documentElement.style.transition = "margin-right 0.2s ease";
        if (netflixPlayer) {
          netflixPlayer.style.width = "calc(100vw - 330px)";
          netflixPlayer.style.transition = "width 0.2s ease";
        }
      } else {
        document.documentElement.style.marginRight = "0px";
        if (netflixPlayer) {
          netflixPlayer.style.width = "100vw";
        }
      }
    } catch (e) {}
  }

  public async connectWebRTC(roomId: string, userName: string, isHost = false) {
    try {
      console.log(`[Teleparty] Connecting LiveKit WebRTC for ${roomId}...`);
      
      const tokenRes = await new Promise<{ token?: string; wsUrl?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "GET_LIVEKIT_TOKEN",
            payload: { roomName: roomId, identity: userName, isHost },
          },
          (res) => resolve(res || {})
        );
      });

      const token = tokenRes?.token;
      const wsUrl = tokenRes?.wsUrl || CONFIG.LIVEKIT_WS_URL;

      if (!token) {
        console.log("[Teleparty] WebRTC token awaiting web server...");
        return;
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        const displayName = participant.name || participant.identity;
        this.addEventLog(`${displayName} joined video call 📹`, "#4ECDC4");
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        const displayName = participant.name || participant.identity;
        this.addEventLog(`${displayName} left video call 📹`, "#FF6B6B");
        const waitingOverlay = this.shadow?.getElementById("waiting-overlay");
        if (waitingOverlay) waitingOverlay.classList.remove("hidden");
      });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video && this.remoteVideoEl) {
          if (this.videoCallBoxEl) this.videoCallBoxEl.classList.remove("hidden");
          track.attach(this.remoteVideoEl);
          const waitingOverlay = this.shadow?.getElementById("waiting-overlay");
          if (waitingOverlay) waitingOverlay.classList.add("hidden");
        }
        if (track.kind === Track.Kind.Audio) {
          const audio = track.attach();
          this.remoteAudioEl = audio;
          audio.volume = this.callVolume;
          if (this.shadow) this.shadow.appendChild(audio);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
      });

      await room.connect(wsUrl, token);
      this.livekitRoom = room;

      // Ensure room engine is connected before publishing tracks
      if (room.state === ConnectionState.Connecting) {
        await new Promise<void>((resolve) => {
          const onConnected = () => {
            room.off(RoomEvent.Connected, onConnected);
            resolve();
          };
          room.on(RoomEvent.Connected, onConnected);
          setTimeout(resolve, 2000);
        });
      }

      if (room.state === ConnectionState.Connected) {
        if (this.cameraEnabled) {
          try {
            // Publish local camera track only if user still has camera enabled
            const localVideo = await createLocalVideoTrack({ resolution: { width: 320, height: 240 } });
            if (!this.cameraEnabled) {
              localVideo.stop();
              localVideo.mediaStreamTrack?.stop();
            } else {
              this.localVideoTrack = localVideo;
              if (localVideo.mediaStreamTrack) {
                this.localMediaTracks.push(localVideo.mediaStreamTrack);
              }
              if (this.localVideoEl) {
                localVideo.attach(this.localVideoEl);
              }
              await room.localParticipant.publishTrack(localVideo);
            }
          } catch (e: any) {
            console.log("[JustUS] Video track standby:", e.message);
          }
        }

        if (this.micEnabled) {
          try {
            // Publish local mic track only if user still has mic enabled
            const localAudio = await createLocalAudioTrack();
            if (!this.micEnabled) {
              localAudio.stop();
              localAudio.mediaStreamTrack?.stop();
            } else {
              this.localAudioTrack = localAudio;
              if (localAudio.mediaStreamTrack) {
                this.localMediaTracks.push(localAudio.mediaStreamTrack);
              }
              await room.localParticipant.publishTrack(localAudio);
            }
          } catch (e: any) {
            console.log("[JustUS] Audio track standby:", e.message);
          }
        }
      }
    } catch (err: any) {
      console.log("[JustUS] WebRTC standby:", err);
    }
  }

  public setParticipantCount(count: number) {
    if (this.participantCountEl) {
      this.participantCountEl.textContent = `${count}`;
    }
  }

  public updateDrift(driftMs: number) {
    if (this.driftBadgeEl) {
      this.driftBadgeEl.textContent = `${driftMs}ms`;
      this.driftBadgeEl.style.color = driftMs < 300 ? "#10B981" : driftMs < 600 ? "#F59E0B" : "#EF4444";
    }
  }

  public addEventLog(text: string, color = "#FF6B6B") {
    if (!this.chatFeedEl) return;
    const item = document.createElement("div");
    item.className = "tp-log-item";

    item.innerHTML = `
      <div class="tp-log-avatar" style="background: ${color};">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
      </div>
      <div class="tp-log-content">${text}</div>
    `;

    this.chatFeedEl.appendChild(item);
    this.chatFeedEl.scrollTop = this.chatFeedEl.scrollHeight;
  }

  public addPlaybackEvent(action: "play" | "pause" | "seek", timeFormatted: string, user: string) {
    if (!this.chatFeedEl) return;
    const item = document.createElement("div");
    item.className = "tp-log-item playback-action";

    if (action === "seek") {
      item.innerHTML = `<span class="tp-log-time-action">${this.escapeHtml(user)} jumped to <span class="tp-highlight-time">${timeFormatted}</span></span>`;
    } else if (action === "pause") {
      item.innerHTML = `<span class="tp-log-time-action">${this.escapeHtml(user)} paused at <span class="tp-highlight-time">${timeFormatted}</span></span>`;
    } else if (action === "play") {
      item.innerHTML = `<span class="tp-log-time-action">${this.escapeHtml(user)} played at <span class="tp-highlight-time">${timeFormatted}</span></span>`;
    }

    this.chatFeedEl.appendChild(item);
    this.chatFeedEl.scrollTop = this.chatFeedEl.scrollHeight;
  }

  public addChatMessage(msg: ChatMessage) {
    if (!this.chatFeedEl) return;
    const isSelf = msg.sender === this.userName;
    const item = document.createElement("div");
    item.className = `tp-chat-msg ${isSelf ? "self" : "peer"}`;

    item.innerHTML = `
      <div class="tp-msg-header">
        <span class="tp-msg-sender">${this.escapeHtml(msg.sender)}</span>
        <span class="tp-msg-time">${msg.time}</span>
      </div>
      <div class="tp-msg-body">${this.escapeHtml(msg.text)}</div>
    `;

    this.chatFeedEl.appendChild(item);
    this.chatFeedEl.scrollTop = this.chatFeedEl.scrollHeight;
  }

  public showFloatingReaction(emoji: string) {
    if (!this.shadow) return;
    const floater = document.createElement("div");
    floater.className = "tp-floating-reaction";
    floater.textContent = emoji;
    floater.style.left = `${Math.floor(Math.random() * 200) + 40}px`;
    this.shadow.appendChild(floater);
    setTimeout(() => floater.remove(), 2500);
  }

  private render() {
    if (!this.shadow) return;

    this.shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

        #tp-sidebar-container {
          position: fixed;
          top: 0;
          right: 0;
          width: 330px;
          height: 100vh;
          background: #14151E;
          border-left: 1px solid #232636;
          box-shadow: -10px 0 35px rgba(0, 0, 0, 0.7);
          z-index: 2147483647;
          display: flex;
          flex-direction: column;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          color: #E2E8F0;
        }

        #tp-sidebar-container.collapsed {
          transform: translateX(330px);
        }

        /* Toggle Tab */
        .tp-sidebar-tab {
          position: absolute;
          left: -32px;
          top: 20px;
          width: 32px;
          height: 42px;
          background: #1E2130;
          border: 1px solid #2B3045;
          border-right: none;
          border-radius: 8px 0 0 8px;
          color: #A5B4FC;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: -4px 4px 12px rgba(0, 0, 0, 0.5);
          transition: background 0.2s;
        }
        .tp-sidebar-tab:hover { background: #2A2F48; }

        /* Top Bar matching Teleparty */
        .tp-topbar {
          height: 48px;
          padding: 0 12px;
          background: #191B26;
          border-bottom: 1px solid #232738;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .tp-topbar-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tp-collapse-arrow {
          background: none;
          border: none;
          color: #94A3B8;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
        }
        .tp-collapse-arrow:hover { color: #fff; }

        .tp-brand-icon {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          background: linear-gradient(135deg, #FF4B72, #A838FF);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 12px;
          color: #fff;
        }

        .tp-badge-btn {
          background: #E5A914;
          color: #000;
          font-weight: 800;
          font-size: 10px;
          padding: 3px 8px;
          border-radius: 12px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .tp-topbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tp-counter {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          color: #94A3B8;
        }

        .tp-btn-icon {
          background: transparent;
          border: none;
          color: #94A3B8;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: color 0.2s;
        }
        .tp-btn-icon:hover { color: #fff; background: rgba(255,255,255,0.06); }

        .tp-user-circle {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          color: #fff;
        }

        /* Video Call Panel (Integrated 1-on-1 Feed) */
        .tp-video-box {
          background: #0D0E15;
          border-bottom: 1px solid #232738;
          position: relative;
        }
        .tp-video-box.hidden {
          display: none !important;
        }

        .tp-video-canvas {
          position: relative;
          width: 100%;
          height: 160px;
          background: #000;
          overflow: hidden;
        }

        .tp-remote-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .tp-waiting-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: #0d0f18;
          color: #94A3B8;
          font-size: 11px;
          font-weight: 600;
          z-index: 1;
        }
        .tp-waiting-overlay.hidden {
          display: none;
        }
        .tp-pulse-ring {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #6366F1;
          box-shadow: 0 0 0 rgba(99, 102, 241, 0.4);
          animation: pulseRing 2s infinite;
        }
        @keyframes pulseRing {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }

        .tp-local-video-pip {
          position: absolute;
          bottom: 6px;
          right: 6px;
          width: 64px;
          height: 48px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.4);
          object-fit: cover;
          transform: scaleX(-1);
          background: #1E2130;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.8);
          z-index: 2;
        }

        .tp-video-toolbar {
          padding: 6px 10px;
          background: #14151F;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .tp-av-actions {
          display: flex;
          gap: 6px;
        }

        .tp-av-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #fff;
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .tp-av-btn.off {
          background: rgba(239, 68, 68, 0.25);
          color: #EF4444;
          border-color: #EF4444;
        }
        .tp-av-btn.active {
          background: rgba(99, 102, 241, 0.3);
          color: #A5B4FC;
          border-color: #6366F1;
        }

        .tp-audio-panel {
          background: #11121C;
          border-top: 1px solid #232738;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          animation: slideDown 0.15s ease;
        }
        .tp-audio-panel.hidden {
          display: none;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .tp-slider-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tp-slider-label {
          width: 72px;
          font-weight: 600;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          color: #A5B4FC;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .tp-slider-input {
          flex: 1;
          height: 4px;
          -webkit-appearance: none;
          background: #25283D;
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }
        .tp-slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #6366F1;
          cursor: pointer;
          transition: transform 0.1s;
        }
        .tp-slider-input::-webkit-slider-thumb:hover {
          transform: scale(1.25);
        }
        .tp-slider-val {
          width: 32px;
          text-align: right;
          font-family: monospace;
          font-size: 10px;
          color: #E2E8F0;
          font-weight: 700;
        }

        .tp-sync-badge {
          font-size: 10px;
          font-family: monospace;
          background: rgba(0, 0, 0, 0.4);
          padding: 2px 6px;
          border-radius: 4px;
          color: #10B981;
        }

        /* Chat & Event Feed */
        .tp-feed {
          flex: 1;
          overflow-y: auto;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .tp-log-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #CBD5E1;
          margin: 2px 0;
        }

        .tp-log-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          flex-shrink: 0;
        }

        .tp-log-content {
          font-weight: 500;
        }

        .tp-log-item.playback-action {
          padding-left: 30px;
          color: #94A3B8;
          font-size: 11px;
        }

        .tp-highlight-time {
          color: #10B981;
          font-weight: 700;
          font-family: monospace;
        }

        .tp-chat-msg {
          background: #1C1E2B;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 12px;
          margin-top: 4px;
        }
        .tp-chat-msg.self {
          background: #252A40;
          border-left: 3px solid #6366F1;
        }

        .tp-msg-header {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #64748B;
          margin-bottom: 2px;
        }
        .tp-msg-sender { font-weight: 700; color: #CBD5E1; }
        .tp-msg-body { color: #F1F5F9; line-height: 1.35; }

        /* Emoji Reactions Bar (Teleparty exact) */
        .tp-reactions-bar {
          padding: 6px 12px;
          display: flex;
          justify-content: space-around;
          background: #161824;
          border-top: 1px solid #232738;
        }

        .tp-emoji-btn {
          background: none;
          border: none;
          font-size: 16px;
          cursor: pointer;
          transition: transform 0.15s;
        }
        .tp-emoji-btn:hover { transform: scale(1.3); }

        /* Chat Input Bar */
        .tp-input-row {
          padding: 10px 12px;
          background: #191B26;
          border-top: 1px solid #232738;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .tp-input-field {
          flex: 1;
          background: #0F1017;
          border: 1px solid #2A2E44;
          border-radius: 8px;
          padding: 8px 10px;
          color: #fff;
          font-size: 12px;
          outline: none;
        }
        .tp-input-field:focus { border-color: #6366F1; }

        .tp-btn-send {
          background: #E50914;
          border: none;
          border-radius: 8px;
          color: #fff;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        /* Floating Reaction Emojis */
        .tp-floating-reaction {
          position: fixed;
          bottom: 60px;
          font-size: 28px;
          animation: floatUp 2.4s ease-out forwards;
          pointer-events: none;
          z-index: 2147483647;
        }

        @keyframes floatUp {
          0% { transform: translateY(0) scale(0.6); opacity: 1; }
          100% { transform: translateY(-300px) scale(1.4); opacity: 0; }
        }
      </style>

      <div id="tp-sidebar-container">
        <!-- Collapsible Tab on left edge -->
        <button class="tp-sidebar-tab" id="btn-tab-toggle" title="Toggle Sidebar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
        </button>

        <!-- Top Header Bar -->
        <div class="tp-topbar">
          <div class="tp-topbar-left">
            <button class="tp-collapse-arrow" id="btn-collapse" title="Collapse">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
            </button>
            <div class="tp-brand-icon">JU</div>
            <div class="tp-badge-btn">JUSTUS</div>
          </div>

          <div class="tp-topbar-right">
            <div class="tp-counter">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              <span id="tp-participant-count">1</span>
            </div>

            <button class="tp-btn-icon" id="btn-toggle-video-call" title="Toggle Video Call">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
            </button>

            <button class="tp-btn-icon" id="btn-share-link" title="Copy Invite Link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
            </button>

            <button class="tp-btn-icon" id="btn-leave-party" title="Leave Party" style="color: #EF4444;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <div class="tp-user-circle" style="background: ${this.avatarColor};">
              ${this.userName.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>

        <!-- 1-on-1 Video Call Panel (Hidden by default) -->
        <div class="tp-video-box hidden" id="tp-video-box-panel">
          <div class="tp-video-canvas">
            <div class="tp-waiting-overlay" id="waiting-overlay">
              <div class="tp-pulse-ring"></div>
              <span>Waiting for friend to join call...</span>
            </div>
            <video class="tp-remote-video" id="remote-feed" autoplay playsinline></video>
            <video class="tp-local-video-pip" id="local-feed" autoplay playsinline muted></video>
          </div>

          <div class="tp-video-toolbar">
            <div class="tp-av-actions">
              <button class="tp-av-btn" id="btn-mic" title="Mute/Unmute Mic">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              </button>
              <button class="tp-av-btn" id="btn-cam" title="Camera On/Off">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
              </button>
              <button class="tp-av-btn" id="btn-audio-settings" title="Audio & Volume Controls">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
              </button>
            </div>

            <div class="tp-sync-badge" id="drift-badge">0ms</div>
          </div>

          <!-- Collapsible Audio & Call Volume Sliders -->
          <div class="tp-audio-panel hidden" id="tp-audio-panel">
            <div class="tp-slider-row">
              <span class="tp-slider-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                Friend Vol
              </span>
              <input type="range" class="tp-slider-input" id="slider-call-volume" min="0" max="100" value="80" />
              <span class="tp-slider-val" id="val-call-volume">80%</span>
            </div>
            <div class="tp-slider-row">
              <span class="tp-slider-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                My Mic
              </span>
              <input type="range" class="tp-slider-input" id="slider-mic-volume" min="0" max="100" value="100" />
              <span class="tp-slider-val" id="val-mic-volume">100%</span>
            </div>
          </div>
        </div>

        <!-- Chat / Event Log Feed -->
        <div class="tp-feed" id="chat-feed-container"></div>

        <!-- Reactions Row -->
        <div class="tp-reactions-bar">
          <button class="tp-emoji-btn" data-emoji="🥰">🥰</button>
          <button class="tp-emoji-btn" data-emoji="😡">😡</button>
          <button class="tp-emoji-btn" data-emoji="😭">😭</button>
          <button class="tp-emoji-btn" data-emoji="😂">😂</button>
          <button class="tp-emoji-btn" data-emoji="🤠">🤠</button>
          <button class="tp-emoji-btn" data-emoji="🔥">🔥</button>
        </div>

        <!-- Input Bar -->
        <form class="tp-input-row" id="tp-chat-form">
          <input type="text" class="tp-input-field" id="tp-chat-input" placeholder="Type a message..." autocomplete="off" />
          <button type="submit" class="tp-btn-send">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          </button>
        </form>
      </div>
    `;

    this.sidebarEl = this.shadow.getElementById("tp-sidebar-container");
    this.remoteVideoEl = this.shadow.getElementById("remote-feed") as HTMLVideoElement;
    this.localVideoEl = this.shadow.getElementById("local-feed") as HTMLVideoElement;
    this.chatFeedEl = this.shadow.getElementById("chat-feed-container");
    this.driftBadgeEl = this.shadow.getElementById("drift-badge");
    this.participantCountEl = this.shadow.getElementById("tp-participant-count");
    this.videoCallBoxEl = this.shadow.getElementById("tp-video-box-panel");
  }

  private bindEvents() {
    if (!this.shadow) return;

    const tabBtn = this.shadow.getElementById("btn-tab-toggle");
    const collapseBtn = this.shadow.getElementById("btn-collapse");
    const shareBtn = this.shadow.getElementById("btn-share-link");
    const leaveBtn = this.shadow.getElementById("btn-leave-party");
    const toggleVideoCallBtn = this.shadow.getElementById("btn-toggle-video-call");
    const micBtn = this.shadow.getElementById("btn-mic");

    // Video call toggle button
    toggleVideoCallBtn?.addEventListener("click", () => {
      this.isVideoCallOpen = !this.isVideoCallOpen;
      if (this.videoCallBoxEl) {
        this.videoCallBoxEl.classList.toggle("hidden", !this.isVideoCallOpen);
      }
      toggleVideoCallBtn.classList.toggle("active", this.isVideoCallOpen);
      if (this.isVideoCallOpen && !this.livekitRoom) {
        this.connectWebRTC(this.roomId, this.userName, this.isHost);
      }
    });
    const camBtn = this.shadow.getElementById("btn-cam");
    const audioSettingsBtn = this.shadow.getElementById("btn-audio-settings");
    const audioPanel = this.shadow.getElementById("tp-audio-panel");
    const sliderCallVol = this.shadow.getElementById("slider-call-volume") as HTMLInputElement;
    const valCallVol = this.shadow.getElementById("val-call-volume");
    const sliderMicVol = this.shadow.getElementById("slider-mic-volume") as HTMLInputElement;
    const valMicVol = this.shadow.getElementById("val-mic-volume");
    const chatForm = this.shadow.getElementById("tp-chat-form");
    const chatInput = this.shadow.getElementById("tp-chat-input") as HTMLInputElement;

    const toggle = () => {
      this.isOpen = !this.isOpen;
      if (this.sidebarEl) {
        this.sidebarEl.classList.toggle("collapsed", !this.isOpen);
        this.adjustPageLayout(this.isOpen);
      }
    };

    tabBtn?.addEventListener("click", toggle);
    collapseBtn?.addEventListener("click", toggle);

    // Share link
    shareBtn?.addEventListener("click", () => {
      const inviteUrl = `${CONFIG.WEB_API_URL}/join/${this.roomId}`;
      navigator.clipboard.writeText(inviteUrl);
      this.addEventLog(`Copied party invite URL to clipboard! 📋`, "#FFE66D");
    });

    // Leave party
    leaveBtn?.addEventListener("click", () => {
      if (this.onLeaveParty) this.onLeaveParty();
      this.destroy();
    });

    // AV controls with total hardware release
    micBtn?.addEventListener("click", async () => {
      this.micEnabled = !this.micEnabled;
      micBtn.classList.toggle("off", !this.micEnabled);

      if (!this.micEnabled) {
        // Complete hardware release so browser stops showing "Microphone: Using now"
        if (this.localAudioTrack) {
          const trackToStop = this.localAudioTrack;
          this.localAudioTrack = null;
          try {
            if (this.livekitRoom && this.livekitRoom.state === ConnectionState.Connected) {
              const pub = this.livekitRoom.localParticipant.getTrackPublication(trackToStop.source);
              if (pub) {
                await this.livekitRoom.localParticipant.unpublishTrack(trackToStop, true).catch(() => {});
              }
            }
            trackToStop.stop();
            if (trackToStop.mediaStreamTrack) {
              trackToStop.mediaStreamTrack.enabled = false;
              trackToStop.mediaStreamTrack.stop();
            }
          } catch (e) {}
        }
      } else {
        // Re-acquire hardware microphone
        if (this.livekitRoom && this.livekitRoom.state === ConnectionState.Connected) {
          try {
            const newAudio = await createLocalAudioTrack();
            if (this.micEnabled) {
              this.localAudioTrack = newAudio;
              await this.livekitRoom.localParticipant.publishTrack(newAudio);
            } else {
              newAudio.stop();
              newAudio.mediaStreamTrack?.stop();
            }
          } catch (e: any) {
            console.log("[JustUS] Mic restart note:", e.message);
          }
        }
      }
    });

    camBtn?.addEventListener("click", async () => {
      this.cameraEnabled = !this.cameraEnabled;
      camBtn.classList.toggle("off", !this.cameraEnabled);

      if (!this.cameraEnabled) {
        // Complete hardware release so browser stops showing "Camera: Using now"
        if (this.localVideoTrack) {
          const trackToStop = this.localVideoTrack;
          this.localVideoTrack = null;
          try {
            if (this.livekitRoom && this.livekitRoom.state === ConnectionState.Connected) {
              const pub = this.livekitRoom.localParticipant.getTrackPublication(trackToStop.source);
              if (pub) {
                await this.livekitRoom.localParticipant.unpublishTrack(trackToStop, true).catch(() => {});
              }
            }
            trackToStop.stop();
            trackToStop.detach();
            if (trackToStop.mediaStreamTrack) {
              trackToStop.mediaStreamTrack.enabled = false;
              trackToStop.mediaStreamTrack.stop();
            }
          } catch (e) {}
        }
        if (this.localVideoEl) {
          this.localVideoEl.srcObject = null;
        }
      } else {
        // Re-acquire hardware camera
        if (this.livekitRoom && this.livekitRoom.state === ConnectionState.Connected) {
          try {
            const newVideo = await createLocalVideoTrack({ resolution: { width: 320, height: 240 } });
            if (this.cameraEnabled) {
              this.localVideoTrack = newVideo;
              if (this.localVideoEl) {
                newVideo.attach(this.localVideoEl);
              }
              await this.livekitRoom.localParticipant.publishTrack(newVideo);
            } else {
              newVideo.stop();
              newVideo.mediaStreamTrack?.stop();
            }
          } catch (e: any) {
            console.log("[JustUS] Camera restart note:", e.message);
          }
        }
      }
    });

    // Audio & Volume Settings Toggle
    audioSettingsBtn?.addEventListener("click", () => {
      this.isAudioSettingsOpen = !this.isAudioSettingsOpen;
      if (audioPanel) {
        audioPanel.classList.toggle("hidden", !this.isAudioSettingsOpen);
      }
      audioSettingsBtn.classList.toggle("active", this.isAudioSettingsOpen);
    });

    // Friend Call Volume Slider (0% - 100%)
    sliderCallVol?.addEventListener("input", (e: any) => {
      const volPercent = Number(e.target.value);
      this.callVolume = volPercent / 100;
      if (valCallVol) valCallVol.textContent = `${volPercent}%`;
      if (this.remoteAudioEl) {
        this.remoteAudioEl.volume = this.callVolume;
      }
    });

    // My Mic Sensitivity / Volume Slider (0% - 100%)
    sliderMicVol?.addEventListener("input", async (e: any) => {
      const micPercent = Number(e.target.value);
      this.micVolume = micPercent / 100;
      if (valMicVol) valMicVol.textContent = `${micPercent}%`;
      if (this.livekitRoom) {
        if (micPercent === 0 && this.micEnabled) {
          this.micEnabled = false;
          await this.livekitRoom.localParticipant.setMicrophoneEnabled(false);
          micBtn?.classList.add("off");
        } else if (micPercent > 0 && !this.micEnabled) {
          this.micEnabled = true;
          await this.livekitRoom.localParticipant.setMicrophoneEnabled(true);
          micBtn?.classList.remove("off");
        }
      }
    });

    // Reactions
    const emojiBtns = this.shadow.querySelectorAll(".tp-emoji-btn");
    emojiBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const emoji = btn.getAttribute("data-emoji") || "🔥";
        this.showFloatingReaction(emoji);
        if (this.onSendReaction) this.onSendReaction(emoji);
      });
    });

    // Chat submit
    chatForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = chatInput?.value?.trim();
      if (!text) return;
      chatInput.value = "";
      if (this.onSendMessage) this.onSendMessage(text);
    });
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  public destroy() {
    this.adjustPageLayout(false);

    // 1. Direct hardware release of LocalVideoTrack & LocalAudioTrack
    if (this.localVideoTrack) {
      try {
        this.localVideoTrack.stop();
        this.localVideoTrack.detach();
        if (this.localVideoTrack.mediaStreamTrack) {
          this.localVideoTrack.mediaStreamTrack.enabled = false;
          this.localVideoTrack.mediaStreamTrack.stop();
        }
      } catch (e) {}
      this.localVideoTrack = null;
    }

    if (this.localAudioTrack) {
      try {
        this.localAudioTrack.stop();
        this.localAudioTrack.detach();
        if (this.localAudioTrack.mediaStreamTrack) {
          this.localAudioTrack.mediaStreamTrack.enabled = false;
          this.localAudioTrack.mediaStreamTrack.stop();
        }
      } catch (e) {}
      this.localAudioTrack = null;
    }

    // 2. Explicitly stop all local hardware camera and microphone tracks in array
    if (this.localMediaTracks && this.localMediaTracks.length > 0) {
      this.localMediaTracks.forEach((t) => {
        try {
          t.enabled = false;
          t.stop();
        } catch (e) {}
      });
      this.localMediaTracks = [];
    }

    // 3. Stop all audio and video element media streams in Shadow DOM
    if (this.shadow) {
      const mediaEls = this.shadow.querySelectorAll("video, audio");
      mediaEls.forEach((el: any) => {
        if (el.srcObject) {
          try {
            (el.srcObject as MediaStream).getTracks().forEach((track) => {
              track.enabled = false;
              track.stop();
            });
          } catch (e) {}
          el.srcObject = null;
        }
      });
    }

    if (this.localVideoEl) {
      if (this.localVideoEl.srcObject) {
        try {
          const stream = this.localVideoEl.srcObject as MediaStream;
          stream.getTracks().forEach((track) => {
            track.enabled = false;
            track.stop();
          });
        } catch (e) {}
        this.localVideoEl.srcObject = null;
      }
    }

    if (this.remoteVideoEl) {
      if (this.remoteVideoEl.srcObject) {
        try {
          const stream = this.remoteVideoEl.srcObject as MediaStream;
          stream.getTracks().forEach((track) => {
            track.enabled = false;
            track.stop();
          });
        } catch (e) {}
        this.remoteVideoEl.srcObject = null;
      }
    }

    // 4. Stop and disconnect LiveKit WebRTC session & unpublish tracks
    if (this.livekitRoom) {
      try {
        this.livekitRoom.localParticipant.trackPublications.forEach((pub) => {
          if (pub.track) {
            try {
              pub.track.stop();
              (pub.track as any).mediaStreamTrack?.stop();
            } catch (e) {}
          }
        });
        this.livekitRoom.localParticipant.setCameraEnabled(false).catch(() => {});
        this.livekitRoom.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        this.livekitRoom.disconnect(true);
      } catch (e) {}
      this.livekitRoom = null;
    }

    // 4. If host leaves, delete room and all associated data from DB
    if (this.isHost && this.roomId) {
      try {
        fetch(`${CONFIG.WEB_API_URL}/api/rooms?id=${encodeURIComponent(this.roomId)}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
      } catch (e) {}
    }

    // 5. Remove DOM container from page
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}
