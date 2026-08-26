"use client";

import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  createLocalVideoTrack,
  createLocalAudioTrack,
  LocalVideoTrack,
  LocalAudioTrack,
  ConnectionState,
  setLogLevel,
  LogLevel,
} from "livekit-client";
import { setAppWakeLock } from "@/lib/wakeLock";

setLogLevel(LogLevel.silent);

// ── Memoized Sub-components to prevent root cascade re-renders ──

const PartyHeader = memo(function PartyHeader({
  isChatOpen,
  isPipClosed,
  onToggleChat,
  onReopenPip,
}: {
  isChatOpen: boolean;
  isPipClosed: boolean;
  onToggleChat: () => void;
  onReopenPip: () => void;
}) {
  return (
    <header className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between px-4 z-40 pointer-events-auto">
      <div className="flex items-center space-x-2">
        <img
          src="/logo.png"
          alt="JustUS"
          className="w-7 h-7 rounded-lg object-cover border border-white/20"
        />
        <span className="text-xs font-bold text-white tracking-wider">JUSTUS PARTY</span>
      </div>
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleChat}
          className={`p-2 rounded-full border transition-colors ${
            isChatOpen ? "bg-indigo-600 border-indigo-500 text-white" : "bg-[#131524] border-white/20 text-white"
          }`}
        >
          💬
        </button>
        {isPipClosed && (
          <button
            onClick={onReopenPip}
            className="px-3 py-1.5 rounded-full bg-emerald-600 border border-emerald-400 text-xs font-semibold flex items-center gap-1.5 text-white"
          >
            📹 Reopen Cam
          </button>
        )}
      </div>
    </header>
  );
});

const MainPlayer = memo(function MainPlayer({
  service,
  videoUrl,
  videoRef,
  onPlay,
  onPause,
  onSeek,
}: {
  service: string;
  videoUrl: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  onPlay: () => void;
  onPause: () => void;
  onSeek: () => void;
}) {
  if (service === "generic" || videoUrl.includes(".mp4")) {
    return (
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        playsInline
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeek}
        onEnded={() => setAppWakeLock(false)}
        onEmptied={() => setAppWakeLock(false)}
        className="w-full h-full object-contain bg-black"
      />
    );
  }
  return (
    <iframe
      src={videoUrl}
      allow="autoplay; encrypted-media; fullscreen"
      className="w-full h-full border-0 bg-black"
    />
  );
});

const ChatDrawer = memo(function ChatDrawer({
  isOpen,
  userName,
  messages,
  inputMsg,
  onClose,
  onInputChange,
  onSendMessage,
}: {
  isOpen: boolean;
  userName: string;
  messages: Array<{ sender: string; text: string; time: string }>;
  inputMsg: string;
  onClose: () => void;
  onInputChange: (val: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
}) {
  if (!isOpen) return null;

  return (
    <aside className="absolute top-0 right-0 bottom-0 w-72 bg-[#0E101D] border-l border-white/10 z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
      <div className="h-14 border-b border-white/10 px-4 flex items-center justify-between">
        <span className="font-bold text-xs text-white">Party Chat</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 text-xs py-8">No messages yet. Say hi! 👋</div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`p-2.5 rounded-xl text-xs ${
                msg.sender === userName ? "bg-indigo-600/30 ml-4" : "bg-white/5 mr-4"
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                <span className="font-semibold text-indigo-300">{msg.sender}</span>
                <span>{msg.time}</span>
              </div>
              <p className="text-white break-words">{msg.text}</p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={onSendMessage} className="p-3 border-t border-white/10 flex gap-2">
        <input
          type="text"
          value={inputMsg}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <button type="submit" className="px-3.5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">
          Send
        </button>
      </form>
    </aside>
  );
});

export default function MobileWatchPartyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = (params?.roomId as string) || "demo";
  const initialUser = searchParams?.get("user") || "Friend_" + Math.floor(Math.random() * 1000);

  // States
  const [userName, setUserName] = useState(initialUser);
  const [isJoined, setIsJoined] = useState(false);
  const [videoUrl, setVideoUrl] = useState("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4");
  const [service, setService] = useState<"netflix" | "prime" | "generic">("generic");

  // Video Call HUD states
  const [isPipMinimized, setIsPipMinimized] = useState(false);
  const [isPipClosed, setIsPipClosed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: string; text: string; time: string }>>([]);
  const [inputMsg, setInputMsg] = useState("");

  // Position & Dragging (Hardware Composited via ref)
  const pipWidgetRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef({ x: 16, y: 70 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const isRafScheduled = useRef(false);
  const latestMoveEvent = useRef<{ clientX: number; clientY: number } | null>(null);

  // DOM & WebRTC references
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoTrackRef = useRef<RemoteTrack | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const supabaseRef = useRef(supabase);
  const channelRef = useRef<any>(null);

  // 1. Fetch Room info
  useEffect(() => {
    async function loadRoom() {
      try {
        const res = await fetch(`/api/rooms?id=${encodeURIComponent(roomId)}`);
        const data = await res.json();
        if (data.room) {
          if (data.room.video_url) setVideoUrl(data.room.video_url);
          if (data.room.service) setService(data.room.service);
        }
      } catch (e) {}
    }
    loadRoom();
  }, [roomId]);

  // 2. Connect WebRTC & Supabase on Join
  const startParty = async () => {
    setIsJoined(true);

    // LiveKit Token
    try {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userName }),
      });
      const data = await res.json();

      if (data.token) {
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Video) {
            remoteVideoTrackRef.current = track;
            if (remoteVideoRef.current) {
              track.attach(remoteVideoRef.current);
            }
          }
          if (track.kind === Track.Kind.Audio) {
            const audio = track.attach();
            remoteAudioRef.current = audio;
            audio.volume = 0.85;
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach();
          if (track.kind === Track.Kind.Video && remoteVideoTrackRef.current === track) {
            remoteVideoTrackRef.current = null;
          }
        });

        await room.connect(data.wsUrl, data.token);
        livekitRoomRef.current = room;

        if (room.state === ConnectionState.Connected) {
          // Mobile-friendly low-overhead constraints: 320x240 @ 20fps
          const videoTrack = await createLocalVideoTrack({
            resolution: { width: 320, height: 240, frameRate: 20 },
          });
          localVideoTrackRef.current = videoTrack;
          if (localVideoRef.current) videoTrack.attach(localVideoRef.current);
          await room.localParticipant.publishTrack(videoTrack);

          const audioTrack = await createLocalAudioTrack({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
          localAudioTrackRef.current = audioTrack;
          await room.localParticipant.publishTrack(audioTrack);
        }
      }
    } catch (e) {
      console.warn("LiveKit connection notice:", e);
    }

    // Supabase Realtime Channel
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`party:${roomId}`, {
      config: { broadcast: { self: false }, presence: { key: userName } },
    });

    channel
      .on("broadcast", { event: "PLAY" }, () => {
        if (mainVideoRef.current && mainVideoRef.current.paused) mainVideoRef.current.play();
        setAppWakeLock(true);
      })
      .on("broadcast", { event: "PAUSE" }, () => {
        if (mainVideoRef.current && !mainVideoRef.current.paused) mainVideoRef.current.pause();
        setAppWakeLock(false);
      })
      .on("broadcast", { event: "SEEK" }, ({ payload }) => {
        if (mainVideoRef.current && Math.abs(mainVideoRef.current.currentTime - payload.time) > 1.5) {
          mainVideoRef.current.currentTime = payload.time;
        }
      })
      .on("broadcast", { event: "CHAT" }, ({ payload }) => {
        setChatMessages((prev) => [...prev, payload]);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ userName, joinedAt: Date.now() });
        }
      });

    channelRef.current = channel;
  };

  // Lifecycle track subscription pause when PIP is minimized or closed
  useEffect(() => {
    if (remoteVideoTrackRef.current && typeof (remoteVideoTrackRef.current as any).setSubscribed === "function") {
      const shouldSubscribe = !isPipClosed && !isPipMinimized;
      (remoteVideoTrackRef.current as any).setSubscribed(shouldSubscribe);
    }
  }, [isPipClosed, isPipMinimized]);

  // Tab resume and network resilience listener
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isJoined) {
        if (channelRef.current && (channelRef.current.state === "errored" || channelRef.current.state === "closed")) {
          const supabase = supabaseRef.current;
          supabase.removeChannel(channelRef.current);
          const newChannel = supabase.channel(`party:${roomId}`, {
            config: { broadcast: { self: false }, presence: { key: userName } },
          });
          newChannel
            .on("broadcast", { event: "PLAY" }, () => {
              if (mainVideoRef.current && mainVideoRef.current.paused) mainVideoRef.current.play().catch(() => {});
              setAppWakeLock(true);
            })
            .on("broadcast", { event: "PAUSE" }, () => {
              if (mainVideoRef.current && !mainVideoRef.current.paused) mainVideoRef.current.pause();
              setAppWakeLock(false);
            })
            .on("broadcast", { event: "SEEK" }, ({ payload }) => {
              if (mainVideoRef.current && Math.abs(mainVideoRef.current.currentTime - payload.time) > 1.5) {
                mainVideoRef.current.currentTime = payload.time;
              }
            })
            .on("broadcast", { event: "CHAT" }, ({ payload }) => {
              setChatMessages((prev) => [...prev, payload]);
            })
            .subscribe(async (status) => {
              if (status === "SUBSCRIBED") {
                await newChannel.track({ userName, joinedAt: Date.now() });
              }
            });
          channelRef.current = newChannel;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleVisibility);
    };
  }, [isJoined, roomId, userName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setAppWakeLock(false);
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current.mediaStreamTrack?.stop();
      }
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.mediaStreamTrack?.stop();
      }
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect(true);
      }
      if (channelRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
      }
    };
  }, []);

  // Sync main video events
  const handleLocalPlay = useCallback(() => {
    setAppWakeLock(true);
    if (channelRef.current && (channelRef.current as any).state === "joined") {
      channelRef.current.send({
        type: "broadcast",
        event: "PLAY",
        payload: { time: mainVideoRef.current?.currentTime || 0, sender: userName },
      });
    }
  }, [userName]);

  const handleLocalPause = useCallback(() => {
    setAppWakeLock(false);
    if (channelRef.current && (channelRef.current as any).state === "joined") {
      channelRef.current.send({
        type: "broadcast",
        event: "PAUSE",
        payload: { time: mainVideoRef.current?.currentTime || 0, sender: userName },
      });
    }
  }, [userName]);

  const handleLocalSeek = useCallback(() => {
    if (channelRef.current && (channelRef.current as any).state === "joined") {
      channelRef.current.send({
        type: "broadcast",
        event: "SEEK",
        payload: { time: mainVideoRef.current?.currentTime || 0, sender: userName },
      });
    }
  }, [userName]);

  // Send Chat
  const sendChatMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputMsg.trim()) return;
      const msg = {
        sender: userName,
        text: inputMsg.trim(),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, msg]);
      if (channelRef.current && (channelRef.current as any).state === "joined") {
        channelRef.current.send({ type: "broadcast", event: "CHAT", payload: msg });
      }
      setInputMsg("");
    },
    [inputMsg, userName]
  );

  // Toggle Camera
  const toggleCam = useCallback(async () => {
    const next = !camEnabled;
    setCamEnabled(next);
    if (!next) {
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current.mediaStreamTrack?.stop();
        localVideoTrackRef.current = null;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (livekitRoomRef.current) await livekitRoomRef.current.localParticipant.setCameraEnabled(false);
    } else {
      if (livekitRoomRef.current && livekitRoomRef.current.state === ConnectionState.Connected) {
        const track = await createLocalVideoTrack({
          resolution: { width: 320, height: 240, frameRate: 20 },
        });
        localVideoTrackRef.current = track;
        if (localVideoRef.current) track.attach(localVideoRef.current);
        await livekitRoomRef.current.localParticipant.publishTrack(track);
      }
    }
  }, [camEnabled]);

  // Toggle Mic
  const toggleMic = useCallback(async () => {
    const next = !micEnabled;
    setMicEnabled(next);
    if (!next) {
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.mediaStreamTrack?.stop();
        localAudioTrackRef.current = null;
      }
      if (livekitRoomRef.current) await livekitRoomRef.current.localParticipant.setMicrophoneEnabled(false);
    } else {
      if (livekitRoomRef.current && livekitRoomRef.current.state === ConnectionState.Connected) {
        const track = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        localAudioTrackRef.current = track;
        await livekitRoomRef.current.localParticipant.publishTrack(track);
      }
    }
  }, [micEnabled]);

  // Hardware-Accelerated Touch Drag Handlers (Direct DOM ref transform + rAF)
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    isDragging.current = true;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStart.current = { x: clientX, y: clientY, posX: posRef.current.x, posY: posRef.current.y };
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    latestMoveEvent.current = { clientX, clientY };

    if (isRafScheduled.current) return;
    isRafScheduled.current = true;

    requestAnimationFrame(() => {
      isRafScheduled.current = false;
      if (!isDragging.current || !latestMoveEvent.current || !pipWidgetRef.current) return;
      const deltaX = latestMoveEvent.current.clientX - dragStart.current.x;
      const deltaY = latestMoveEvent.current.clientY - dragStart.current.y;

      const newX = Math.max(8, Math.min(window.innerWidth - 140, dragStart.current.posX + deltaX));
      const newY = Math.max(8, Math.min(window.innerHeight - 180, dragStart.current.posY + deltaY));

      posRef.current = { x: newX, y: newY };
      pipWidgetRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
    });
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#0B0C15] text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#131524] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6 text-center">
          <img
            src="/logo.png"
            alt="JustUS"
            className="w-16 h-16 mx-auto rounded-2xl object-cover shadow-xl border border-white/15"
          />
          <div>
            <h1 className="text-2xl font-bold">Join JustUS Party</h1>
            <p className="text-xs text-slate-400 mt-1">
              Room: <span className="text-indigo-400 font-mono">{roomId}</span>
            </p>
          </div>
          <div className="space-y-4">
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={startParty}
              className="w-full py-3.5 bg-gradient-to-r from-red-600 to-indigo-600 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-transform text-white"
            >
              Start Watch Party 🍿
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-screen h-screen bg-black overflow-hidden select-none"
      onMouseMove={handleTouchMove}
      onMouseUp={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. Main Streaming Player */}
      <MainPlayer
        service={service}
        videoUrl={videoUrl}
        videoRef={mainVideoRef}
        onPlay={handleLocalPlay}
        onPause={handleLocalPause}
        onSeek={handleLocalSeek}
      />

      {/* 2. Top App Bar */}
      <PartyHeader
        isChatOpen={isChatOpen}
        isPipClosed={isPipClosed}
        onToggleChat={() => setIsChatOpen((prev) => !prev)}
        onReopenPip={() => setIsPipClosed(false)}
      />

      {/* 3. Floating, Draggable, Minimizable & Closeable Video Call Widget (Hardware Layer) */}
      {!isPipClosed && (
        <div
          ref={pipWidgetRef}
          style={{
            transform: `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`,
            willChange: "transform",
          }}
          className="absolute top-0 left-0 z-50 select-none touch-none"
        >
          {isPipMinimized ? (
            /* Minimized Bubble */
            <div
              onMouseDown={handleTouchStart}
              onTouchStart={handleTouchStart}
              onClick={() => setIsPipMinimized(false)}
              className="w-14 h-14 rounded-full bg-[#131524] border-2 border-indigo-500 shadow-2xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
            >
              <div className="relative">
                <span className="text-xl">📹</span>
                <span className="absolute -top-1 -right-2 w-3 h-3 bg-emerald-500 rounded-full border border-black animate-pulse" />
              </div>
            </div>
          ) : (
            /* Full Floating Video Tile (Zero backdrop-blur GPU overhead) */
            <div className="w-40 sm:w-48 bg-[#131524] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              {/* Header Bar */}
              <div
                onMouseDown={handleTouchStart}
                onTouchStart={handleTouchStart}
                className="h-7 bg-white/5 px-2.5 flex items-center justify-between cursor-move"
              >
                <span className="text-[10px] font-bold text-slate-300">Live Video</span>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setIsPipMinimized(true)}
                    className="w-4 h-4 rounded-full bg-amber-500/80 hover:bg-amber-500 flex items-center justify-center text-[8px] text-black font-black"
                  >
                    –
                  </button>
                  <button
                    onClick={() => setIsPipClosed(true)}
                    className="w-4 h-4 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-[8px] text-white font-black"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Remote Friend Video */}
              <div className="relative w-full h-28 bg-black flex items-center justify-center overflow-hidden">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                {/* Local Video Thumbnail (PIP) */}
                <div className="absolute bottom-1.5 right-1.5 w-12 h-12 rounded-lg bg-[#222] border border-white/20 overflow-hidden shadow-md">
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
                </div>
              </div>

              {/* AV Controls */}
              <div className="p-2 bg-black/40 flex items-center justify-around">
                <button
                  onClick={toggleMic}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${
                    micEnabled ? "bg-white/10 text-white" : "bg-red-600/80 text-white"
                  }`}
                >
                  {micEnabled ? "🎙️" : "🔇"}
                </button>
                <button
                  onClick={toggleCam}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${
                    camEnabled ? "bg-white/10 text-white" : "bg-red-600/80 text-white"
                  }`}
                >
                  {camEnabled ? "📹" : "🚫"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Slide-Over Real-Time Chat Drawer */}
      <ChatDrawer
        isOpen={isChatOpen}
        userName={userName}
        messages={chatMessages}
        inputMsg={inputMsg}
        onClose={() => setIsChatOpen(false)}
        onInputChange={setInputMsg}
        onSendMessage={sendChatMessage}
      />
    </div>
  );
}
