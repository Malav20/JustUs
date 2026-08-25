"use client";

import { useEffect, useRef, useState } from "react";
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

export function MobileWatchParty() {
  const searchParams = useSearchParams();
  const roomParam = searchParams?.get("room") || "";
  const userParam = searchParams?.get("user") || "";

  // App Navigation States
  const [currentView, setCurrentView] = useState<"home" | "browser">("home");
  const [selectedService, setSelectedService] = useState<"netflix" | "prime" | "youtube" | "generic">("netflix");
  const [targetUrl, setTargetUrl] = useState("https://www.netflix.com");
  const [browserUrl, setBrowserUrl] = useState("https://www.netflix.com");

  // Party Session States
  const [roomId, setRoomId] = useState(roomParam || "ju_" + Math.random().toString(36).substring(2, 8));
  const [userName, setUserName] = useState(userParam || "User_" + Math.floor(Math.random() * 1000));
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [isPartyActive, setIsPartyActive] = useState(false);
  const [isHost, setIsHost] = useState(true);
  const [participantCount, setParticipantCount] = useState(1);
  const [copied, setCopied] = useState(false);

  // Video Call HUD States
  const [isPipMinimized, setIsPipMinimized] = useState(false);
  const [isPipClosed, setIsPipClosed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [callVolume, setCallVolume] = useState(0.8);

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
  const supabaseRef = useRef(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  const channelRef = useRef<any>(null);

  // Handle auto-join from URL parameter
  useEffect(() => {
    if (roomParam) {
      setRoomId(roomParam);
      setIsHost(false);
      setCurrentView("browser");
      startPartySession(roomParam, userName, false);
    }
  }, [roomParam]);

  // Open Streaming Service
  const openStreamingService = (service: "netflix" | "prime" | "youtube" | "generic", url: string) => {
    setSelectedService(service);
    setTargetUrl(url);
    setBrowserUrl(url);
    setCurrentView("browser");
  };

  // Start / Join Party Session
  const startPartySession = async (targetRoom: string, user: string, host = true) => {
    setIsPartyActive(true);
    setRoomId(targetRoom);
    setUserName(user);
    setIsHost(host);
    setCurrentView("browser");

    // 1. Create Room in DB if host
    if (host) {
      fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customId: targetRoom,
          service: selectedService,
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
      className="relative w-screen h-screen bg-[#090A0F] overflow-hidden select-none flex flex-col font-sans text-slate-100"
      onMouseMove={handleTouchMove}
      onMouseUp={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ───────────────────────────────────────────────────────────── */}
      {/* SCREEN A: HOME / STREAMING SERVICES PORTAL                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      {currentView === "home" ? (
        <div className="flex-1 flex flex-col justify-between p-6 overflow-y-auto max-w-lg mx-auto w-full">
          {/* Top Bar */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-indigo-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-indigo-500/30">
                JU
              </div>
              <div>
                <h1 className="font-black text-lg text-white leading-tight">JustUS</h1>
                <p className="text-[10px] text-slate-400">Mobile Watch Party</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <span className="text-xs">👤</span>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="bg-transparent text-xs text-white font-medium focus:outline-none w-20 truncate"
                placeholder="Name"
              />
            </div>
          </div>

          {/* Service Cards Grid */}
          <div className="my-auto space-y-4 py-6">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold text-white">Choose Where to Watch</h2>
              <p className="text-xs text-slate-400">Select a streaming service to start browsing & watching</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Netflix */}
              <button
                onClick={() => openStreamingService("netflix", "https://www.netflix.com")}
                className="p-5 rounded-2xl bg-gradient-to-br from-[#E50914]/20 to-[#12141F] border border-[#E50914]/40 hover:border-[#E50914] flex items-center justify-between text-left shadow-xl active:scale-[0.98] transition-all"
              >
                <div>
                  <span className="text-2xl font-black tracking-tight text-[#E50914] block">NETFLIX</span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Log in & stream movies</span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-[#E50914] flex items-center justify-center text-white font-bold text-sm shadow-md">
                  ▶
                </div>
              </button>

              {/* Prime Video */}
              <button
                onClick={() => openStreamingService("prime", "https://www.primevideo.com")}
                className="p-5 rounded-2xl bg-gradient-to-br from-[#00A8E1]/20 to-[#12141F] border border-[#00A8E1]/40 hover:border-[#00A8E1] flex items-center justify-between text-left shadow-xl active:scale-[0.98] transition-all"
              >
                <div>
                  <span className="text-2xl font-black tracking-tight text-[#00A8E1] block">PRIME</span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Amazon Prime Video</span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-[#00A8E1] flex items-center justify-center text-white font-bold text-sm shadow-md">
                  ▶
                </div>
              </button>

              {/* YouTube */}
              <button
                onClick={() => openStreamingService("youtube", "https://www.youtube.com")}
                className="p-5 rounded-2xl bg-gradient-to-br from-red-600/20 to-[#12141F] border border-red-600/40 hover:border-red-600 flex items-center justify-between text-left shadow-xl active:scale-[0.98] transition-all"
              >
                <div>
                  <span className="text-2xl font-black tracking-tight text-red-500 block">YOUTUBE</span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Watch videos together</span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                  ▶
                </div>
              </button>

              {/* Custom Video / Sandbox */}
              <button
                onClick={() => openStreamingService("generic", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")}
                className="p-5 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-[#12141F] border border-indigo-600/40 hover:border-indigo-500 flex items-center justify-between text-left shadow-xl active:scale-[0.98] transition-all"
              >
                <div>
                  <span className="text-2xl font-black tracking-tight text-indigo-400 block">DEMO STREAM</span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Test interactive video</span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                  🍿
                </div>
              </button>
            </div>

            {/* Quick Join Code Input */}
            <div className="pt-2">
              <div className="bg-[#12141F] border border-white/10 rounded-2xl p-3.5 flex items-center gap-2">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  placeholder="Have a Room Code? (e.g. ju_abc123)"
                  className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none px-2"
                />
                <button
                  onClick={() => {
                    if (joinCodeInput.trim()) {
                      startPartySession(joinCodeInput.trim(), userName, false);
                    }
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-red-600 to-indigo-600 text-white font-bold text-xs rounded-xl shadow-md active:scale-95"
                >
                  Join Party
                </button>
              </div>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-500 pb-2">
            JustUS Native App • Synchronized Playback & 1-on-1 Video
          </div>
        </div>
      ) : (
        /* ───────────────────────────────────────────────────────────── */
        /* SCREEN B: IN-APP STREAMING BROWSER & WATCH PARTY VIEW         */
        /* ───────────────────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col w-full h-full relative">
          {/* In-App Browser Top Navigation Bar */}
          <header className="h-12 bg-[#11131E] border-b border-white/10 flex items-center justify-between px-3 z-40 shrink-0 gap-2">
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setCurrentView("home")}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs flex items-center gap-1"
              >
                <span>◀</span>
                <span className="hidden sm:inline">Services</span>
              </button>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                selectedService === "netflix" ? "bg-[#E50914] text-white" : selectedService === "prime" ? "bg-[#00A8E1] text-white" : "bg-red-600 text-white"
              }`}>
                {selectedService}
              </span>
            </div>

            {/* URL bar */}
            <div className="flex-1 max-w-sm flex items-center bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-[11px]">
              <input
                type="text"
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") setTargetUrl(browserUrl); }}
                className="flex-1 bg-transparent text-slate-300 focus:outline-none truncate"
                placeholder="Video URL..."
              />
              <button onClick={() => setTargetUrl(browserUrl)} className="text-slate-400 text-xs px-1">➔</button>
            </div>

            {/* Party Actions */}
            <div className="flex items-center space-x-1.5">
              {!isPartyActive ? (
                <button
                  onClick={() => startPartySession(roomId, userName, true)}
                  className="px-3 py-1 bg-gradient-to-r from-red-600 to-indigo-600 text-white font-bold text-xs rounded-lg shadow-md active:scale-95 animate-pulse"
                >
                  🎉 Start Party
                </button>
              ) : (
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={copyInvite}
                    className="px-2.5 py-1 bg-white/10 border border-white/10 text-[11px] font-semibold text-slate-200 rounded-lg"
                  >
                    {copied ? "✓ Copied" : "🔗 Share"}
                  </button>
                  <button
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    className={`p-1.5 rounded-lg border text-xs ${
                      isChatOpen ? "bg-indigo-600 border-indigo-500" : "bg-white/5 border-white/10 text-slate-300"
                    }`}
                  >
                    💬
                  </button>
                  <button
                    onClick={leavePartySession}
                    className="px-2 py-1 bg-red-600/20 border border-red-500/30 text-red-300 text-[11px] font-bold rounded-lg"
                  >
                    Leave
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Main Embedded Streaming Frame */}
          <main className="flex-1 relative w-full h-full bg-black overflow-hidden">
            <iframe
              src={targetUrl}
              allow="autoplay; encrypted-media; fullscreen; camera; microphone"
              className="w-full h-full border-0 bg-black"
            />

            {/* Standby Floating CTA when party not active */}
            {!isPartyActive && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#12141F]/90 backdrop-blur-md border border-white/15 px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 z-30 pointer-events-auto">
                <span className="text-xs text-slate-300">Play any video, then tap</span>
                <button
                  onClick={() => startPartySession(roomId, userName, true)}
                  className="px-3 py-1 bg-gradient-to-r from-red-600 to-indigo-600 text-white font-bold text-xs rounded-full shadow-lg"
                >
                  Start Watch Party 🍿
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* FLOATING DRAGGABLE 1-ON-1 VIDEO CALL HUD                     */}
      {/* ───────────────────────────────────────────────────────────── */}
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

              {/* AV Controls */}
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

                {isAudioSettingsOpen && (
                  <div className="pt-1.5 border-t border-white/10 space-y-1 text-[10px] text-slate-300">
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
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Restore Video Call Button if Closed */}
      {isPartyActive && isPipClosed && (
        <button
          onClick={() => setIsPipClosed(false)}
          className="absolute bottom-4 left-4 z-40 px-3.5 py-2 rounded-full bg-indigo-600/90 border border-indigo-400 text-white text-xs font-bold shadow-2xl flex items-center gap-1.5 active:scale-95"
        >
          📹 Reopen Video Call
        </button>
      )}

      {/* Slide-Out Chat Drawer */}
      {isPartyActive && isChatOpen && (
        <aside className="absolute top-12 right-0 bottom-0 w-72 bg-[#0E101D]/95 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
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
