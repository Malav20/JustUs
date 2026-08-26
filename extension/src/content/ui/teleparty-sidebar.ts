import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant, LocalVideoTrack, LocalAudioTrack, createLocalVideoTrack, createLocalAudioTrack, ConnectionState, setLogLevel, LogLevel } from "livekit-client";
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
          this.remoteVideoEl.muted = true;
          this.remoteVideoEl.setAttribute("playsinline", "true");
          this.remoteVideoEl.setAttribute("webkit-playsinline", "true");
          this.remoteVideoEl.play().catch(() => {
            setTimeout(() => this.remoteVideoEl?.play().catch(() => {}), 150);
          });
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
            const localVideo = await createLocalVideoTrack({
              resolution: { width: 320, height: 240, frameRate: 15 },
            });
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

    if (tabBtn) bindInstantTap(tabBtn, () => toggle(), { stopPropagation: true });
    if (collapseBtn) bindInstantTap(collapseBtn, () => toggle(), { stopPropagation: true });

    // Share link
    const copyInvite = () => {
      const inviteUrl = `${CONFIG.WEB_API_URL}/join/${this.roomId}`;
      navigator.clipboard.writeText(inviteUrl);
      this.addEventLog(`Copied party invite URL to clipboard! 📋`, "#FFE66D");
    };
    shareBtn?.addEventListener("click", copyInvite);
    if (shareBtn) bindInstantTap(shareBtn, copyInvite, { stopPropagation: true });

    // Leave party
    const leave = () => {
      if (this.onLeaveParty) this.onLeaveParty();
      this.destroy();
    };
    leaveBtn?.addEventListener("click", leave);
    if (leaveBtn) bindInstantTap(leaveBtn, leave, { stopPropagation: true });

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
