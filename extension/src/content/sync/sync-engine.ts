import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { IPlayerAdapter, PlayerEventType } from "../adapters/base-adapter";
import { CONFIG } from "../../shared/constants";
import { ChatMessage, SyncPayload } from "../../shared/types";

// Shared client with auth storage disabled to prevent multiple GoTrueClient collision warnings
const supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export class SyncEngine {
  private supabase = supabaseClient;
  private channel: RealtimeChannel | null = null;
  private adapter: IPlayerAdapter;
  private roomId: string;
  private userName: string;
  private isHost: boolean;

  // Handshake & Feedback loop prevention locks
  private isSyncActionInProgress = false;
  private isInitialSyncCompleted = false;
  private heartbeatTimer: any = null;
  private stateRequestRetryTimer: any = null;

  // Screen Wake Lock Sentinel
  private wakeLockSentinel: any = null;

  // Callbacks
  private onDriftUpdate?: (driftMs: number) => void;
  private onChatReceived?: (message: ChatMessage) => void;
  private onParticipantJoined?: (userName: string, color?: string) => void;
  private onParticipantLeft?: (userName: string) => void;
  private onPlaybackAction?: (action: "play" | "pause" | "seek", time: number, sender: string) => void;
  private onConnectionStateChange?: (status: "connected" | "disconnected" | "error") => void;

  private async setScreenWakeLock(enable: boolean) {
    try {
      if ("wakeLock" in navigator && typeof (navigator as any).wakeLock?.request === "function") {
        if (enable) {
          if (!this.wakeLockSentinel || this.wakeLockSentinel.released) {
            this.wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
            this.wakeLockSentinel.addEventListener("release", () => {
              this.wakeLockSentinel = null;
            });
          }
        } else {
          if (this.wakeLockSentinel && !this.wakeLockSentinel.released) {
            await this.wakeLockSentinel.release();
            this.wakeLockSentinel = null;
          }
        }
      }
    } catch (e) {}
  }

  constructor(
    adapter: IPlayerAdapter,
    roomId: string,
    userName: string,
    isHost = false
  ) {
    this.adapter = adapter;
    this.roomId = roomId;
    this.userName = userName;
    this.isHost = isHost;

    if (this.isHost) {
      this.isInitialSyncCompleted = true;
    }
  }

  public setCallbacks(callbacks: {
    onDriftUpdate?: (driftMs: number) => void;
    onChatReceived?: (message: ChatMessage) => void;
    onParticipantJoined?: (userName: string, color?: string) => void;
    onParticipantLeft?: (userName: string) => void;
    onParticipantCountChange?: (count: number) => void;
    onPlaybackAction?: (action: "play" | "pause" | "seek", time: number, sender: string) => void;
    onConnectionStateChange?: (status: "connected" | "disconnected" | "error") => void;
  }) {
    this.onDriftUpdate = callbacks.onDriftUpdate;
    this.onChatReceived = callbacks.onChatReceived;
    this.onParticipantJoined = callbacks.onParticipantJoined;
    this.onParticipantLeft = callbacks.onParticipantLeft;
    this.onParticipantCountChange = callbacks.onParticipantCountChange;
    this.onPlaybackAction = callbacks.onPlaybackAction;
    this.onConnectionStateChange = callbacks.onConnectionStateChange;
  }

  public async start() {
    console.log(`[JustUs SyncEngine] Initializing room: ${this.roomId} as ${this.userName} (isHost: ${this.isHost})`);

    // If joining an existing party, immediately freeze/pause local player to prevent unwanted autoplay
    if (!this.isHost) {
      await this.adapter.pause();
    }

    // 1. Initial State from Database Fallback
    try {
      const { data: roomData } = await this.supabase
        .from("rooms")
        .select("playback_time, is_playing, video_url")
        .eq("id", this.roomId)
        .single();

      if (roomData && !this.isHost) {
        console.log("[JustUs SyncEngine] Fetched room state from DB:", roomData);
        if (roomData.video_url) {
          const currentUrl = window.location.href.split("#")[0];
          const targetUrl = roomData.video_url.split("#")[0];
          const isVideoPage = targetUrl.includes("/watch") || targetUrl.includes("/title/") || targetUrl.includes("/video/");
          if (currentUrl !== targetUrl && isVideoPage) {
            console.log(`[JustUs SyncEngine] Room DB video is ${roomData.video_url} -> Redirecting`);
            const sep = targetUrl.includes("#") ? "&" : "#";
            window.location.href = `${targetUrl}${sep}tp=${encodeURIComponent(this.roomId)}&user=${encodeURIComponent(this.userName)}`;
            return;
          }
        }
        await this.withSyncLock(async () => {
          if (roomData.playback_time > 1.0) {
            await this.adapter.seek(roomData.playback_time);
          }
          if (roomData.is_playing) {
            await this.adapter.play();
          } else {
            await this.adapter.pause();
          }
        });
      }
    } catch (err) {
      console.warn("[JustUs SyncEngine] DB state fallback check:", err);
    }

    // 2. Remove all existing channels from Supabase client registry to prevent callback collision
    try {
      const existing = this.supabase.getChannels();
      for (const ch of existing) {
        if (ch.topic.includes(this.roomId) || ch.topic.startsWith("realtime:party:") || ch.topic.startsWith("party:")) {
          this.supabase.removeChannel(ch);
        }
      }
    } catch (e) {}
    this.channel = null;

    this.channel = this.supabase.channel(`party:${this.roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: this.userName },
      },
    });

    this.channel
      .on("broadcast", { event: "PLAY" }, ({ payload }) => this.handleRemotePlay(payload))
      .on("broadcast", { event: "PAUSE" }, ({ payload }) => this.handleRemotePause(payload))
      .on("broadcast", { event: "SEEK" }, ({ payload }) => this.handleRemoteSeek(payload))
      .on("broadcast", { event: "SYNC_HEARTBEAT" }, ({ payload }) => this.handleRemoteHeartbeat(payload))
      .on("broadcast", { event: "REQUEST_STATE" }, ({ payload }) => this.handleRequestState(payload))
      .on("broadcast", { event: "STATE_RESPONSE" }, ({ payload }) => this.handleStateResponse(payload))
      .on("broadcast", { event: "USER_JOINED" }, ({ payload }) => {
        if (payload.userName && payload.userName !== this.userName) {
          console.log(`[JustUs SyncEngine] User joined broadcast: ${payload.userName}`);
          if (this.onParticipantJoined) this.onParticipantJoined(payload.userName, payload.color);
        }
      })
      .on("broadcast", { event: "CHAT" }, ({ payload }) => {
        if (this.onChatReceived) this.onChatReceived(payload);
      })
      .on("broadcast", { event: "VIDEO_CHANGED" }, ({ payload }) => {
        this.handleVideoChanged(payload);
      })
      .on("presence", { event: "sync" }, () => {
        const state = this.channel?.presenceState() || {};
        const count = Math.max(1, Object.keys(state).length);
        console.log(`[JustUs SyncEngine] Presence count sync: ${count} users`);
        if (this.onParticipantCountChange) this.onParticipantCountChange(count);
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        newPresences.forEach((p: any) => {
          if (p.userName && p.userName !== this.userName) {
            if (this.onParticipantJoined) this.onParticipantJoined(p.userName, p.color);
          }
        });
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        leftPresences.forEach((p: any) => {
          if (p.userName && p.userName !== this.userName) {
            if (this.onParticipantLeft) this.onParticipantLeft(p.userName);
          }
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[JustUs SyncEngine] Subscribed to Supabase Realtime channel!");
          if (this.onConnectionStateChange) this.onConnectionStateChange("connected");
          
          // Track presence
          this.channel?.track({
            userName: this.userName,
            isHost: this.isHost,
            joinedAt: Date.now(),
          });

          // Broadcast Join event to room peers
          this.channel?.send({
            type: "broadcast",
            event: "USER_JOINED",
            payload: { userName: this.userName, isHost: this.isHost, sentAt: Date.now() },
          });

          this.startHeartbeatLoop();

          // If joining, request live state from Host / Active peers
          if (!this.isHost) {
            this.requestLiveStateFromPeers();
          }
        } else if (status === "CHANNEL_ERROR") {
          if (this.onConnectionStateChange) this.onConnectionStateChange("error");
        }
      });

    // Listen to local player events to broadcast to peers
    this.adapter.onStateChange((event: PlayerEventType, time: number) => {
      this.handleLocalEvent(event, time);
    });

    // Load historical chat messages directly from Supabase
    this.supabase
      .from("chat_messages")
      .select("sender, message, created_at")
      .eq("room_id", this.roomId)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data, error }) => {
        if (data && !error && Array.isArray(data) && data.length > 0) {
          data.forEach((m: any) => {
            const timeStr = m.created_at
              ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "";
            if (this.onChatReceived) {
              this.onChatReceived({
                sender: m.sender,
                text: m.message,
                time: timeStr,
              });
            }
          });
        } else {
          // Fallback to Next.js API endpoint
          fetch(`${CONFIG.WEB_API_URL}/api/chat?roomId=${encodeURIComponent(this.roomId)}`)
            .then((res) => res.json())
            .then((resData) => {
              if (resData && resData.messages && Array.isArray(resData.messages)) {
                resData.messages.forEach((msg: ChatMessage) => {
                  if (this.onChatReceived) this.onChatReceived(msg);
                });
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }

  private requestLiveStateFromPeers() {
    if (!this.channel || this.isInitialSyncCompleted) return;

    console.log("[JustUs SyncEngine] Requesting live room state from peers...");
    this.channel.send({
      type: "broadcast",
      event: "REQUEST_STATE",
      payload: { sender: this.userName, sentAt: Date.now() },
    });

    // Retry once after 1.5s if no peer responded yet
    this.stateRequestRetryTimer = setTimeout(() => {
      if (!this.isInitialSyncCompleted && this.channel) {
        console.log("[JustUs SyncEngine] Retrying REQUEST_STATE...");
        this.channel.send({
          type: "broadcast",
          event: "REQUEST_STATE",
          payload: { sender: this.userName, sentAt: Date.now() },
        });
      }
    }, 1500);
  }

  private handleRequestState(payload: { sender: string; sentAt: number }) {
    if (!this.channel || !this.isInitialSyncCompleted) return;

    // Send current playback status to the newly joined peer
    console.log(`[JustUs SyncEngine] Sending current playback state to new peer ${payload.sender}`);
    this.channel.send({
      type: "broadcast",
      event: "STATE_RESPONSE",
      payload: {
        time: this.adapter.getCurrentTime(),
        isPlaying: this.adapter.isPlaying(),
        videoUrl: window.location.href,
        sentAt: Date.now(),
        sender: this.userName,
      },
    });
  }

  private handleStateResponse(payload: SyncPayload) {
    if (this.isInitialSyncCompleted) return;
    console.log(`[JustUs SyncEngine] Initial state handshake received from ${payload.sender}:`, payload);
    
    this.isInitialSyncCompleted = true;
    if (this.stateRequestRetryTimer) clearTimeout(this.stateRequestRetryTimer);

    if (payload.videoUrl && !this.isHost) {
      const currentUrl = window.location.href.split("#")[0];
      const targetUrl = payload.videoUrl.split("#")[0];
      const isVideoPage = targetUrl.includes("/watch") || targetUrl.includes("/title/") || targetUrl.includes("/video/");
      if (currentUrl !== targetUrl && isVideoPage) {
        console.log(`[JustUs SyncEngine] Handshake video target is ${payload.videoUrl} -> Redirecting`);
        const sep = targetUrl.includes("#") ? "&" : "#";
        window.location.href = `${targetUrl}${sep}tp=${encodeURIComponent(this.roomId)}&user=${encodeURIComponent(this.userName)}`;
        return;
      }
    }

    this.withSyncLock(async () => {
      const latency = (Date.now() - payload.sentAt) / 1000;
      const targetTime = payload.time + (payload.isPlaying && latency > 0 && latency < 2 ? latency : 0);

      if (targetTime > 1.0) {
        await this.adapter.seek(targetTime);
      }
      if (payload.isPlaying) {
        await this.adapter.play();
      } else {
        await this.adapter.pause();
      }
    });
  }

  private handleLocalEvent(event: PlayerEventType, time: number) {
    // Prevent sending outbound events until initial sync with the room is complete
    if (!this.isInitialSyncCompleted) {
      console.log(`[JustUs] Ignored local event "${event}" before initial sync completed.`);
      return;
    }

    if (this.isSyncActionInProgress || !this.channel) return;

    const payload: SyncPayload = {
      time,
      isPlaying: this.adapter.isPlaying(),
      sentAt: Date.now(),
      sender: this.userName,
    };

    if (event === "play") {
      console.log(`[JustUS] Local PLAY at ${time.toFixed(2)}s -> Outbound broadcast`);
      this.setScreenWakeLock(true);
      this.broadcast("PLAY", payload);
      this.persistRoomState(time, true);
      if (this.onPlaybackAction) this.onPlaybackAction("play", time, this.userName);
    } else if (event === "pause") {
      console.log(`[JustUS] Local PAUSE at ${time.toFixed(2)}s -> Outbound broadcast`);
      this.setScreenWakeLock(false);
      this.broadcast("PAUSE", payload);
      this.persistRoomState(time, false);
      if (this.onPlaybackAction) this.onPlaybackAction("pause", time, this.userName);
    } else if (event === "seeked") {
      if (time <= 1.0) return; // Suppress stream startup seek to 00:00
      console.log(`[JustUS] Local SEEK to ${time.toFixed(2)}s -> Outbound broadcast`);
      this.broadcast("SEEK", payload);
      this.persistRoomState(time, this.adapter.isPlaying());
      if (this.onPlaybackAction) this.onPlaybackAction("seek", time, this.userName);
    }
  }

  private broadcast(event: string, payload: any) {
    if (this.channel && (this.channel as any).state === "joined") {
      try {
        this.channel.send({ type: "broadcast", event, payload });
      } catch (e) {}
    }
  }

  private persistRoomState(playbackTime: number, isPlaying: boolean) {
    if (!this.isHost) return;
    this.supabase
      .from("rooms")
      .update({
        playback_time: playbackTime,
        is_playing: isPlaying,
        updated_at: new Date().toISOString(),
      })
      .eq("id", this.roomId)
      .then(() => {})
      .catch(() => {});
  }

  private handleRemotePlay(payload: SyncPayload) {
    const senderName = payload.sender || "Friend";
    console.log(`[JustUs] Remote PLAY received from ${senderName} at ${payload.time.toFixed(2)}s`);
    this.isInitialSyncCompleted = true;
    this.setScreenWakeLock(true);
    if (this.onPlaybackAction) this.onPlaybackAction("play", payload.time, senderName);
    this.withSyncLock(async () => {
      const latency = Math.max(0, (Date.now() - payload.sentAt) / 1000);
      const targetTime = payload.time + (latency > 0 && latency < 1.5 ? latency : 0);

      if (targetTime > 1.0 && Math.abs(this.adapter.getCurrentTime() - targetTime) > 0.35) {
        await this.adapter.seek(targetTime);
      }
      await this.adapter.play();
    });
  }

  private handleRemotePause(payload: SyncPayload) {
    const senderName = payload.sender || "Friend";
    console.log(`[JustUs] Remote PAUSE received from ${senderName} at ${payload.time.toFixed(2)}s`);
    this.isInitialSyncCompleted = true;
    this.setScreenWakeLock(false);
    if (this.onPlaybackAction) this.onPlaybackAction("pause", payload.time, senderName);
    this.withSyncLock(async () => {
      await this.adapter.pause();
      if (payload.time > 1.0 && Math.abs(this.adapter.getCurrentTime() - payload.time) > 0.25) {
        await this.adapter.seek(payload.time);
      }
    });
  }

  private handleRemoteSeek(payload: SyncPayload) {
    if (!payload || payload.time <= 1.0) return;
    const current = this.adapter.getCurrentTime();
    if (Math.abs(current - payload.time) < 0.35) return;

    const senderName = payload.sender || "Friend";
    console.log(`[JustUs] Remote SEEK received from ${senderName} to ${payload.time.toFixed(2)}s`);
    this.isInitialSyncCompleted = true;
    if (this.onPlaybackAction) this.onPlaybackAction("seek", payload.time, senderName);
    this.withSyncLock(async () => {
      await this.adapter.seek(payload.time);
    });
  }

  private handleRemoteHeartbeat(payload: SyncPayload) {
    if (this.isSyncActionInProgress) return;

    if (payload.videoUrl && !this.isHost) {
      const currentUrl = window.location.href.split("#")[0];
      const targetUrl = payload.videoUrl.split("#")[0];
      const isVideoPage = targetUrl.includes("/watch") || targetUrl.includes("/title/") || targetUrl.includes("/video/");
      if (currentUrl !== targetUrl && isVideoPage) {
        console.log(`[JustUs SyncEngine] Heartbeat indicates host is on ${payload.videoUrl} -> Redirecting`);
        const sep = targetUrl.includes("#") ? "&" : "#";
        window.location.href = `${targetUrl}${sep}tp=${encodeURIComponent(this.roomId)}&user=${encodeURIComponent(this.userName)}`;
        return;
      }
    }

    const latency = Math.max(0, (Date.now() - payload.sentAt) / 1000);
    const expectedTime = payload.isPlaying ? payload.time + latency : payload.time;
    const current = this.adapter.getCurrentTime();
    const drift = Math.abs(current - expectedTime);

    if (this.onDriftUpdate) {
      this.onDriftUpdate(Math.round(drift * 1000));
    }

    // If we haven't completed initial sync, the first heartbeat will set our state safely
    if (!this.isInitialSyncCompleted) {
      this.isInitialSyncCompleted = true;
      console.log(`[JustUS] Initial room state established: ${expectedTime.toFixed(2)}s (isPlaying: ${payload.isPlaying})`);
      this.withSyncLock(async () => {
        if (expectedTime > 1.0) {
          await this.adapter.seek(expectedTime);
        }
        if (payload.isPlaying) {
          await this.adapter.play();
        } else {
          await this.adapter.pause();
        }
      });
      return;
    }

    const now = Date.now();
    if (payload.isPlaying) {
      if (drift > 0.6 && expectedTime > 1.0 && now - this.lastDriftResyncTime > 2000) {
        this.lastDriftResyncTime = now;
        console.log(`[JustUS] Aggressive drift snap (${Math.round(drift * 1000)}ms) -> Target: ${expectedTime.toFixed(2)}s`);
        this.withSyncLock(async () => {
          await this.adapter.seek(expectedTime);
          if (!this.adapter.isPlaying()) {
            await this.adapter.play();
          }
        });
      } else if (!this.adapter.isPlaying()) {
        this.withSyncLock(async () => { await this.adapter.play(); });
      }
    } else {
      if (drift > 0.25 && expectedTime > 1.0) {
        this.withSyncLock(async () => {
          await this.adapter.seek(expectedTime);
          if (this.adapter.isPlaying()) {
            await this.adapter.pause();
          }
        });
      } else if (this.adapter.isPlaying()) {
        this.withSyncLock(async () => { await this.adapter.pause(); });
      }
    }
  }

  private startHeartbeatLoop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      if (!this.channel || this.isSyncActionInProgress || !this.isInitialSyncCompleted) return;

      this.channel.send({
        type: "broadcast",
        event: "SYNC_HEARTBEAT",
        payload: {
          time: this.adapter.getCurrentTime(),
          isPlaying: this.adapter.isPlaying(),
          videoUrl: window.location.href,
          sentAt: Date.now(),
          sender: this.userName,
        },
      });
    }, CONFIG.HEARTBEAT_INTERVAL_MS);
  }

  public sendChatMessage(text: string) {
    if (!this.channel || !text.trim()) return;

    const message: ChatMessage = {
      sender: this.userName,
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    this.channel.send({
      type: "broadcast",
      event: "CHAT",
      payload: message,
    });

    if (this.onChatReceived) {
      this.onChatReceived(message);
    }

    // Persist chat message directly to Supabase table & API fallback
    this.supabase
      .from("chat_messages")
      .insert({
        room_id: this.roomId,
        sender: this.userName,
        message: text.trim(),
        created_at: new Date().toISOString(),
      })
      .then(() => {})
      .catch(() => {});

    fetch(`${CONFIG.WEB_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: this.roomId,
        sender: this.userName,
        text: text.trim(),
      }),
    }).catch(() => {});
  }

  private handleVideoChanged(payload: { videoUrl?: string; title?: string; sender?: string }) {
    if (!payload?.videoUrl || this.isHost) return;
    const currentUrl = window.location.href.split("#")[0];
    const targetUrl = payload.videoUrl.split("#")[0];
    const isVideoPage = targetUrl.includes("/watch") || targetUrl.includes("/title/") || targetUrl.includes("/video/");
    if (currentUrl !== targetUrl && isVideoPage) {
      console.log(`[JustUs SyncEngine] Host opened video: ${payload.videoUrl} -> Redirecting participant`);
      const sep = targetUrl.includes("#") ? "&" : "#";
      window.location.href = `${targetUrl}${sep}tp=${encodeURIComponent(this.roomId)}&user=${encodeURIComponent(this.userName)}`;
    }
  }

  private async withSyncLock(action: () => Promise<void>) {
    this.isSyncActionInProgress = true;
    try {
      await action();
    } finally {
      setTimeout(() => {
        this.isSyncActionInProgress = false;
      }, CONFIG.SYNC_ACTION_COOLDOWN_MS);
    }
  }

  public stop() {
    this.setScreenWakeLock(false);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.stateRequestRetryTimer) clearTimeout(this.stateRequestRetryTimer);
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.onConnectionStateChange) this.onConnectionStateChange("disconnected");
  }
}
