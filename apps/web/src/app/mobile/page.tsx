"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
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

setLogLevel(LogLevel.silent);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://djuqnhqedykhectfhzba.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqdXFuaHFlZHlraGVjdGZoemJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MzMxNzcsImV4cCI6MjEwMzIwOTE3N30.UhcqK9MfjxuT-XjjiHzpnrRgZKjkyX2IDuh5FMhoO98";

function DedicatedMobileContent() {
  const searchParams = useSearchParams();
  const roomParam = searchParams?.get("room") || "";
  const userParam = searchParams?.get("user") || "";

  // App & Party States
  const [roomId, setRoomId] = useState(roomParam || "ju_" + Math.random().toString(36).substring(2, 8));
  const [userName, setUserName] = useState(userParam || "User_" + Math.floor(Math.random() * 1000));
  const [isPartyActive, setIsPartyActive] = useState(false);
  const [isHost, setIsHost] = useState(true);
  const [targetUrl, setTargetUrl] = useState("https://www.netflix.com");
  const [browserUrl, setBrowserUrl] = useState("https://www.netflix.com");

  // Video Call HUD States
  const [isPipMinimized, setIsPipMinimized] = useState(false);
  const [isPipClosed, setIsPipClosed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [participantCount, setParticipantCount] = useState(1);
  const [callVolume, setCallVolume] = useState(0.8);
  const [copied, setCopied] = useState(false);

  // Chat & Messages
  const [chatMessages, setChatMessages] = useState<Array<{ sender: string; text: string; time: string }>>([]);
  const [inputMsg, setInputMsg] = useState("");

  // Draggable PiP Coordinates
  const [pos, setPos] = useState({ x: 16, y: 70 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // WebRTC & Supabase References
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const supabaseRef = useRef(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  const channelRef = useRef<any>(null);

  // Handle auto-join from URL parameter
  useEffect(() => {
    if (roomParam) {
      setRoomId(roomParam);
      setIsHost(false);
      startPartySession(roomParam, userName, false);
    }
  }, [roomParam]);

  // Start / Join Party Session
  const startPartySession = async (targetRoom: string, user: string, host = true) => {
    setIsPartyActive(true);
    setRoomId(targetRoom);
    setUserName(user);
    setIsHost(host);

    // 1. Create Room in DB if host
    if (host) {
      fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customId: targetRoom,
          service: targetUrl.includes("netflix") ? "netflix" : targetUrl.includes("prime") ? "prime" : "generic",
          videoUrl: targetUrl,
          title: "JustUS Watch Room",
          hostId: user,
        }),
      }).catch(() => {});
    }

    // 2. Connect LiveKit WebRTC Call
    try {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: targetRoom, userName: user }),
      });
      const data = await res.json();

      if (data.token) {
        const room = new Room({ adaptiveStream: true, dynacast: true });

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
            track.attach(remoteVideoRef.current);
          }
          if (track.kind === Track.Kind.Audio) {
            const audio = track.attach();
            remoteAudioRef.current = audio;
            audio.volume = callVolume;
          }
        });

        await room.connect(data.wsUrl || "wss://justus-0q7zbww8.livekit.cloud", data.token);
        livekitRoomRef.current = room;

        if (room.state === ConnectionState.Connected) {
          if (camEnabled) {
            const videoTrack = await createLocalVideoTrack({ resolution: { width: 320, height: 240 } });
            localVideoTrackRef.current = videoTrack;
            if (localVideoRef.current) videoTrack.attach(localVideoRef.current);
            await room.localParticipant.publishTrack(videoTrack);
          }

          if (micEnabled) {
            const audioTrack = await createLocalAudioTrack();
            localAudioTrackRef.current = audioTrack;
            await room.localParticipant.publishTrack(audioTrack);
          }
        }
      }
    } catch (e) {}

    // 3. Connect Supabase Realtime Synchronization
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`party:${targetRoom}`, {
      config: { broadcast: { self: false }, presence: { key: user } },
    });

    channel
      .on("broadcast", { event: "CHAT" }, ({ payload }) => {
        setChatMessages((prev) => [...prev, payload]);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setParticipantCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ userName: user, joinedAt: Date.now() });
        }
      });

    channelRef.current = channel;
  };

  // Leave / Disconnect Party
  const leavePartySession = () => {
    setIsPartyActive(false);

    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.stop();
      localVideoTrackRef.current.mediaStreamTrack?.stop();
      localVideoTrackRef.current = null;
    }
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current.mediaStreamTrack?.stop();
      localAudioTrackRef.current = null;
    }
    if (livekitRoomRef.current) {
      livekitRoomRef.current.disconnect(true);
      livekitRoomRef.current = null;
    }
    if (channelRef.current) {
      supabaseRef.current.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (isHost && roomId) {
      fetch(`/api/rooms?id=${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => {});
    }
  };

  // Toggle Camera
  const toggleCam = async () => {
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
        const track = await createLocalVideoTrack({ resolution: { width: 320, height: 240 } });
        localVideoTrackRef.current = track;
        if (localVideoRef.current) track.attach(localVideoRef.current);
        await livekitRoomRef.current.localParticipant.publishTrack(track);
      }
    }
  };

  // Toggle Mic
  const toggleMic = async () => {
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
        const track = await createLocalAudioTrack();
        localAudioTrackRef.current = track;
        await livekitRoomRef.current.localParticipant.publishTrack(track);
      }
    }
  };

  // Send Chat
  const sendChatMessage = (e: React.FormEvent) => {
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
  };

  // Copy Party Invite URL
  const copyInvite = () => {
    const inviteUrl = `${typeof window !== "undefined" ? window.location.origin : "https://just-us-web.vercel.app"}/mobile?room=${roomId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Drag Gesture Handlers
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    isDragging.current = true;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStart.current = { x: clientX, y: clientY, posX: pos.x, posY: pos.y };
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - dragStart.current.x;
    const deltaY = clientY - dragStart.current.y;
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - 140, dragStart.current.posX + deltaX)),
      y: Math.max(8, Math.min(window.innerHeight - 180, dragStart.current.posY + deltaY)),
    });
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
  };

  return (
    <div
      className="relative w-screen h-screen bg-[#090A0F] overflow-hidden select-none flex flex-col font-sans"
      onMouseMove={handleTouchMove}
      onMouseUp={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. App Top Navigation Bar */}
      <header className="h-14 bg-[#11131E] border-b border-white/10 flex items-center justify-between px-3 z-40 shrink-0">
        {/* Brand */}
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-red-600 to-indigo-600 flex items-center justify-center font-black text-sm text-white shadow-md">
            JU
          </div>
          <span className="font-bold text-xs tracking-wider text-white hidden sm:inline">JUSTUS MOBILE</span>
        </div>

        {/* Streaming Service Selector / Quick URL Input */}
        <div className="flex items-center space-x-1.5 flex-1 max-w-md mx-2">
          <button
            onClick={() => { setTargetUrl("https://www.netflix.com"); setBrowserUrl("https://www.netflix.com"); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-black tracking-tight transition-colors ${
              targetUrl.includes("netflix") ? "bg-[#E50914] text-white" : "bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            NETFLIX
          </button>
          <button
            onClick={() => { setTargetUrl("https://www.primevideo.com"); setBrowserUrl("https://www.primevideo.com"); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-black tracking-tight transition-colors ${
              targetUrl.includes("prime") ? "bg-[#00A8E1] text-white" : "bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            PRIME
          </button>
          <button
            onClick={() => { setTargetUrl("https://www.youtube.com"); setBrowserUrl("https://www.youtube.com"); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-black tracking-tight transition-colors ${
              targetUrl.includes("youtube") ? "bg-red-600 text-white" : "bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            YOUTUBE
          </button>
          <input
            type="text"
            value={browserUrl}
            onChange={(e) => setBrowserUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setTargetUrl(browserUrl); }}
            placeholder="Enter Video URL..."
            className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500 truncate"
          />
        </div>

        {/* Party Action Button */}
        <div className="flex items-center space-x-2">
          {!isPartyActive ? (
            <button
              onClick={() => startPartySession(roomId, userName, true)}
              className="px-3 py-1.5 bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg shadow-md transition-all active:scale-95"
            >
              Start Party 🎉
            </button>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={copyInvite}
                className="px-2.5 py-1 bg-white/10 hover:bg-white/15 border border-white/10 text-[11px] font-semibold text-slate-200 rounded-lg flex items-center gap-1 transition-colors"
              >
                <span>{copied ? "✓ Copied" : "🔗 Share"}</span>
              </button>
              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isChatOpen ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/5 border-white/10 text-slate-300"
                }`}
              >
                💬
              </button>
              <button
                onClick={leavePartySession}
                className="px-2 py-1 bg-red-600/20 border border-red-500/30 text-red-300 text-[11px] font-bold rounded-lg hover:bg-red-600/30"
              >
                Leave
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Embedded In-App Desktop Streaming Browser Viewport */}
      <main className="flex-1 relative w-full h-full bg-black overflow-hidden">
        <iframe
          ref={iframeRef}
          src={targetUrl}
          allow="autoplay; encrypted-media; fullscreen; camera; microphone"
          className="w-full h-full border-0 bg-black"
        />

        {/* Standby Banner when not inside a party */}
        {!isPartyActive && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#12141F]/90 backdrop-blur-md border border-white/15 px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 z-30 pointer-events-auto">
            <span className="text-xs text-slate-300">Navigate to any video, then tap</span>
            <button
              onClick={() => startPartySession(roomId, userName, true)}
              className="px-3 py-1 bg-gradient-to-r from-red-600 to-indigo-600 text-white font-bold text-xs rounded-full shadow-lg"
            >
              Start Party 🍿
            </button>
          </div>
        )}
      </main>

      {/* 3. Floating, Draggable, Minimizable & Closeable Video Call HUD */}
      {isPartyActive && !isPipClosed && (
        <div
          style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
          className="absolute top-0 left-0 z-50 transition-shadow select-none touch-none"
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
            /* Full Floating Video Tile */
            <div className="w-44 sm:w-52 bg-[#131524]/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              {/* Header Bar */}
              <div
                onMouseDown={handleTouchStart}
                onTouchStart={handleTouchStart}
                className="h-7 bg-white/5 px-2.5 flex items-center justify-between cursor-move"
              >
                <div className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-300">Live Call ({participantCount})</span>
                </div>
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
              <div className="relative w-full h-32 bg-black flex items-center justify-center overflow-hidden">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                
                {/* Local Video Thumbnail (PIP) */}
                <div className="absolute bottom-1.5 right-1.5 w-14 h-14 rounded-lg bg-[#222] border border-white/20 overflow-hidden shadow-md">
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
                </div>
              </div>

              {/* AV Controls & Audio Settings Panel */}
              <div className="p-2 bg-black/50 flex flex-col gap-1.5">
                <div className="flex items-center justify-around">
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
                  <button
                    onClick={() => setIsAudioSettingsOpen(!isAudioSettingsOpen)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${
                      isAudioSettingsOpen ? "bg-indigo-600 text-white" : "bg-white/10 text-white"
                    }`}
                  >
                    🔊
                  </button>
                </div>

                {/* Collapsible Audio Sliders */}
                {isAudioSettingsOpen && (
                  <div className="pt-1.5 border-t border-white/10 space-y-1 text-[10px] text-slate-300">
                    <div>
                      <div className="flex justify-between">
                        <span>Friend Volume:</span>
                        <span>{Math.round(callVolume * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={callVolume}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setCallVolume(val);
                          if (remoteAudioRef.current) remoteAudioRef.current.volume = val;
                        }}
                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reopen Video Call Button if closed */}
      {isPartyActive && isPipClosed && (
        <button
          onClick={() => setIsPipClosed(false)}
          className="absolute bottom-4 left-4 z-40 px-3.5 py-2 rounded-full bg-indigo-600/90 border border-indigo-400 text-white text-xs font-bold shadow-2xl flex items-center gap-1.5 active:scale-95"
        >
          📹 Reopen Video Call
        </button>
      )}

      {/* 4. Slide-Out Real-Time Chat Drawer */}
      {isPartyActive && isChatOpen && (
        <aside className="absolute top-14 right-0 bottom-0 w-72 bg-[#0E101D]/95 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
          <div className="h-10 border-b border-white/10 px-3 flex items-center justify-between">
            <span className="font-bold text-xs text-white">Party Chat ({roomId})</span>
            <button onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-white text-sm">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {chatMessages.length === 0 ? (
              <div className="text-center text-slate-500 text-xs py-8">No messages yet. Say hi! 👋</div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className={`p-2.5 rounded-xl text-xs ${msg.sender === userName ? "bg-indigo-600/30 ml-4" : "bg-white/5 mr-4"}`}>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="font-semibold text-indigo-300">{msg.sender}</span>
                    <span>{msg.time}</span>
                  </div>
                  <p className="text-white break-words">{msg.text}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={sendChatMessage} className="p-3 border-t border-white/10 flex gap-2">
            <input
              type="text"
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <button type="submit" className="px-3.5 py-2 bg-indigo-600 rounded-xl text-xs font-bold">
              Send
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}

export default function DedicatedMobileApp() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#090A0F] text-white flex items-center justify-center text-sm font-bold">Loading JustUS Mobile...</div>}>
      <DedicatedMobileContent />
    </Suspense>
  );
}
