import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant, LocalVideoTrack, LocalAudioTrack, ConnectionState, setLogLevel, LogLevel } from "livekit-client";
import { CONFIG } from "../../shared/constants";
import { ChatMessage } from "../../shared/types";
import { TELEPARTY_SIDEBAR_CSS } from "./teleparty-sidebar-styles";
import { buildTelepartySidebarHtml } from "./teleparty-sidebar-template";
import { bindInstantTap } from "../../shared/touch";

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
  private lastPlaybackLog = { action: "", user: "", time: "", at: 0 };
  private isWebRTCConnecting = false;
  private recentVideoCallLogs = new Map<string, number>();
  private recentPartyLeaveLogs = new Map<string, number>();
  private lastClipboardLogAt = 0;
  private boundLocalPreviewTrack: MediaStreamTrack | null = null;

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

    this.startVideoCallPanel();
  }

  private startVideoCallPanel() {
    const toggleVideoCallBtn = this.shadow?.getElementById("btn-toggle-video-call");
    if (this.videoCallBoxEl) {
      this.videoCallBoxEl.classList.remove("hidden");
    }
    this.isVideoCallOpen = true;
    if (toggleVideoCallBtn) toggleVideoCallBtn.classList.add("active");
    if (!this.livekitRoom) {
      this.connectWebRTC(this.roomId, this.userName, this.isHost);
    }
  }

  private recentJoinedEvents = new Set<string>();

  public addParticipantJoinLog(userName: string, color = "#4ECDC4") {
    if (!userName || userName === this.userName || this.recentJoinedEvents.has(userName)) return;
    this.recentJoinedEvents.add(userName);
    setTimeout(() => this.recentJoinedEvents.delete(userName), 12000);

    this.addEventLog(`${this.escapeHtml(userName)} joined the party 🍿`, color);
  }

  public addParticipantLeaveLog(userName: string) {
    if (!userName || userName === this.userName) return;
    const now = Date.now();
    const last = this.recentPartyLeaveLogs.get(userName) || 0;
    if (now - last < 12000) return;
    this.recentPartyLeaveLogs.set(userName, now);
    this.addEventLog(`${this.escapeHtml(userName)} left the party 👋`, "#FF6B6B");
  }

  private logVideoCallEvent(kind: "join" | "leave", displayName: string) {
    const key = `${kind}:${displayName}`;
    const now = Date.now();
    const last = this.recentVideoCallLogs.get(key) || 0;
    if (now - last < 12000) return;
    this.recentVideoCallLogs.set(key, now);
    if (kind === "join") {
      this.addEventLog(`${displayName} joined video call 📹`, "#4ECDC4");
    } else {
      this.addEventLog(`${displayName} left video call 📹`, "#FF6B6B");
    }
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

  /** Shadow DOM breaks LiveKit adaptiveStream visibility — keep it disabled. */
  private attachVideoToElement(track: RemoteTrack | LocalVideoTrack, el: HTMLVideoElement, isLocal = false) {
    const mediaTrack = track.mediaStreamTrack;
    if (isLocal && mediaTrack) {
      const sameTrack =
        this.boundLocalPreviewTrack === mediaTrack &&
        el.srcObject instanceof MediaStream &&
        el.srcObject.getVideoTracks()[0] === mediaTrack;
      if (sameTrack && !el.paused && el.readyState >= 2) {
        return;
      }
      this.boundLocalPreviewTrack = mediaTrack;
      el.muted = true;
      el.playsInline = true;
      el.setAttribute("playsinline", "true");
      el.setAttribute("webkit-playsinline", "true");
      el.controls = false;
      const stream = new MediaStream([mediaTrack]);
      el.srcObject = stream;
      setTimeout(() => {
        el.srcObject = stream;
        el.play().catch(() => setTimeout(() => el.play().catch(() => {}), 200));
      }, 0);
      return;
    }

    try {
      track.detach();
    } catch (e) {}
    try {
      track.attach(el);
    } catch (e) {
      console.warn("[Teleparty] track.attach failed:", e);
    }
    if (mediaTrack) {
      try {
        el.srcObject = new MediaStream([mediaTrack]);
      } catch (e) {}
    }
    el.muted = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.play().catch(() => {
      setTimeout(() => el.play().catch(() => {}), 200);
    });
  }

  private subscribeRemoteVideoPublications(room: Room) {
    room.remoteParticipants.forEach((participant) => {
      participant.videoTrackPublications.forEach((pub) => {
        if (!pub.isSubscribed && typeof pub.setSubscribed === "function") {
          pub.setSubscribed(true);
        }
        if (pub.track) {
          this.showRemoteVideo(pub.track as RemoteTrack);
        }
      });
    });
  }

  private showRemoteVideo(track: RemoteTrack) {
    if (this.videoCallBoxEl) this.videoCallBoxEl.classList.remove("hidden");
    if (!this.remoteVideoEl) return;
    this.attachVideoToElement(track, this.remoteVideoEl);
    const waitingOverlay = this.shadow?.getElementById("waiting-overlay");
    if (waitingOverlay) waitingOverlay.classList.add("hidden");
  }

  public async connectWebRTC(roomId: string, userName: string, isHost = false) {
    if (this.livekitRoom?.state === ConnectionState.Connected) return;
    if (this.isWebRTCConnecting) return;
    this.isWebRTCConnecting = true;

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

      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        videoCaptureDefaults: {
          resolution: { width: 640, height: 480, frameRate: 24 },
        },
        publishDefaults: {
          simulcast: false,
          videoCodec: "h264",
        },
      });

      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        const track = publication.track;
        if (!track) return;
        if (track.kind === Track.Kind.Audio) {
          this.localAudioTrack = track as LocalAudioTrack;
          return;
        }
        if (track.kind !== Track.Kind.Video) return;
        this.localVideoTrack = track as LocalVideoTrack;
        if (this.localVideoEl) {
          this.attachVideoToElement(track as LocalVideoTrack, this.localVideoEl, true);
        }
        if (this.videoCallBoxEl) this.videoCallBoxEl.classList.remove("hidden");
      });

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        const displayName = participant.name || participant.identity;
        this.logVideoCallEvent("join", displayName);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        const displayName = participant.name || participant.identity;
        this.logVideoCallEvent("leave", displayName);
        const waitingOverlay = this.shadow?.getElementById("waiting-overlay");
        if (waitingOverlay) waitingOverlay.classList.remove("hidden");
      });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video) {
          this.showRemoteVideo(track);
        }
        if (track.kind === Track.Kind.Audio) {
          const audio = track.attach();
          this.remoteAudioEl = audio;
          audio.volume = this.callVolume;
          if (this.shadow) this.shadow.appendChild(audio);
        }
      });

      room.on(RoomEvent.TrackPublished, (publication, participant: RemoteParticipant) => {
        if (participant.isLocal) return;
        if (publication.kind === Track.Kind.Video && publication.track) {
          this.showRemoteVideo(publication.track as RemoteTrack);
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
        this.subscribeRemoteVideoPublications(room);

        if (this.cameraEnabled) {
          try {
            await room.localParticipant.setCameraEnabled(true);
          } catch (e: any) {
            console.warn("[JustUS] Video track failed:", e.message);
            this.addEventLog("⚠️ Camera unavailable — check browser permissions", "#FF6B6B");
          }
        }

        if (this.micEnabled) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (micPub?.track) this.localAudioTrack = micPub.track as LocalAudioTrack;
          } catch (e: any) {
            console.log("[JustUS] Audio track standby:", e.message);
          }
        }
      }
    } catch (err: any) {
      console.log("[JustUS] WebRTC standby:", err);
    } finally {
      this.isWebRTCConnecting = false;
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

    const now = Date.now();
    if (
      action !== "seek" &&
      this.lastPlaybackLog.action === action &&
      this.lastPlaybackLog.user === user &&
      this.lastPlaybackLog.time === timeFormatted &&
      now - this.lastPlaybackLog.at < 2500
    ) {
      return;
    }
    this.lastPlaybackLog = { action, user, time: timeFormatted, at: now };

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

  private async applyMicEnabled(enabled: boolean) {
    this.micEnabled = enabled;
    const micBtn = this.shadow?.getElementById("btn-mic");
    micBtn?.classList.toggle("off", !enabled);

    const room = this.livekitRoom;
    if (!room || room.state !== ConnectionState.Connected) return;

    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
    } catch (e) {}

    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (pub?.track) this.localAudioTrack = pub.track as LocalAudioTrack;

    const applyTrackMute = (track: LocalAudioTrack | undefined) => {
      if (!track) return;
      try {
        if (enabled) {
          track.unmute();
          if (track.mediaStreamTrack) track.mediaStreamTrack.enabled = true;
        } else {
          track.mute();
          if (track.mediaStreamTrack) track.mediaStreamTrack.enabled = false;
        }
      } catch (e) {}
    };

    applyTrackMute(this.localAudioTrack || undefined);
    room.localParticipant.audioTrackPublications.forEach((audioPub) => {
      applyTrackMute(audioPub.track as LocalAudioTrack | undefined);
    });
  }

  private render() {
    if (!this.shadow) return;

    this.shadow.innerHTML = `<style>${TELEPARTY_SIDEBAR_CSS}</style>${buildTelepartySidebarHtml(this.userName, this.avatarColor)}`;

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
      if (tabBtn) {
        tabBtn.style.transform = this.isOpen ? "" : "rotate(180deg)";
        tabBtn.title = this.isOpen ? "Hide sidebar" : "Show sidebar";
      }
    };

    if (tabBtn) bindInstantTap(tabBtn, () => toggle(), { stopPropagation: true, preventDefault: true });

    // Share link
    const copyInvite = () => {
      const inviteUrl = `${CONFIG.WEB_API_URL}/join/${this.roomId}`;
      navigator.clipboard.writeText(inviteUrl);
      const now = Date.now();
      if (now - this.lastClipboardLogAt < 3000) return;
      this.lastClipboardLogAt = now;
      this.addEventLog(`Copied party invite URL to clipboard! 📋`, "#FFE66D");
    };
    if (shareBtn) bindInstantTap(shareBtn, copyInvite, { stopPropagation: true });

    // Leave party
    const leave = () => {
      if (this.onLeaveParty) this.onLeaveParty();
      this.destroy();
    };
    if (leaveBtn) bindInstantTap(leaveBtn, leave, { stopPropagation: true });

    micBtn?.addEventListener("click", async () => {
      await this.applyMicEnabled(!this.micEnabled);
    });

    camBtn?.addEventListener("click", async () => {
      this.cameraEnabled = !this.cameraEnabled;
      camBtn.classList.toggle("off", !this.cameraEnabled);

      if (!this.livekitRoom || this.livekitRoom.state !== ConnectionState.Connected) return;

      try {
        if (!this.cameraEnabled) {
          const pub = this.livekitRoom.localParticipant.getTrackPublication(Track.Source.Camera);
          const track = pub?.track as LocalVideoTrack | undefined;
          if (track?.mediaStreamTrack) track.mediaStreamTrack.enabled = false;
          if (this.localVideoEl) {
            this.localVideoEl.style.visibility = "hidden";
            this.localVideoEl.style.opacity = "0";
          }
          await this.livekitRoom.localParticipant.setCameraEnabled(false);
        } else {
          await this.livekitRoom.localParticipant.setCameraEnabled(true);
          const pub = this.livekitRoom.localParticipant.getTrackPublication(Track.Source.Camera);
          const track = pub?.track as LocalVideoTrack | undefined;
          if (track?.mediaStreamTrack) track.mediaStreamTrack.enabled = true;
          if (this.localVideoEl && track) {
            this.localVideoEl.style.visibility = "";
            this.localVideoEl.style.opacity = "";
            this.boundLocalPreviewTrack = null;
            this.attachVideoToElement(track, this.localVideoEl, true);
          }
        }
      } catch (e) {}
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
      if (micPercent === 0 && this.micEnabled) {
        await this.applyMicEnabled(false);
      } else if (micPercent > 0 && !this.micEnabled) {
        await this.applyMicEnabled(true);
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
