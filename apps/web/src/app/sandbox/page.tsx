"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant } from "livekit-client";
import { supabase } from "@/lib/supabase";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff, 
  Users, 
  Wifi, 
  Radio, 
  Send,
  MessageSquare,
  Sparkles
} from "lucide-react";

export default function SandboxPage() {
  const [roomId, setRoomId] = useState("sandbox-room");
  const [userName, setUserName] = useState("User-" + Math.floor(Math.random() * 1000));
  const [isConnected, setIsConnected] = useState(false);
  const [isLiveKitConnected, setIsLiveKitConnected] = useState(false);
  
  // AV Toggles
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  // Sync state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [driftMs, setDriftMs] = useState(0);
  const [syncStatus, setSyncStatus] = useState<string>("Standby");
  const [logs, setLogs] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: string; text: string; time: string }>>([]);
  const [chatInput, setChatInput] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  const livekitRoomRef = useRef<Room | null>(null);
  const channelRef = useRef<any>(null);
  const isSyncActionInProgress = useRef(false);

  const addLog = (msg: string) => {
    setLogs((prev) => [ `[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49) ]);
  };

  // Join Room & Initialize LiveKit + Supabase
  const joinParty = async () => {
    try {
      addLog(`Connecting to party room "${roomId}" as ${userName}...`);
      
      // 1. Setup Supabase Realtime Broadcast Channel
      const channel = supabase.channel(`party:${roomId}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on("broadcast", { event: "PLAY" }, ({ payload }) => {
          handleRemotePlay(payload);
        })
        .on("broadcast", { event: "PAUSE" }, ({ payload }) => {
          handleRemotePause(payload);
        })
        .on("broadcast", { event: "SEEK" }, ({ payload }) => {
          handleRemoteSeek(payload);
        })
        .on("broadcast", { event: "SYNC_HEARTBEAT" }, ({ payload }) => {
          handleRemoteHeartbeat(payload);
        })
        .on("broadcast", { event: "REQUEST_STATE" }, ({ payload }) => {
          if (videoRef.current && channelRef.current) {
            channelRef.current.send({
              type: "broadcast",
              event: "STATE_RESPONSE",
              payload: {
                time: videoRef.current.currentTime,
                isPlaying: !videoRef.current.paused,
                sentAt: Date.now(),
                sender: userName,
              },
            });
          }
        })
        .on("broadcast", { event: "STATE_RESPONSE" }, ({ payload }) => {
          if (videoRef.current) {
            addLog(`Received initial room state from ${payload.sender}: ${payload.time.toFixed(2)}s (playing: ${payload.isPlaying})`);
            isSyncActionInProgress.current = true;
            videoRef.current.currentTime = payload.time;
            if (payload.isPlaying) {
              videoRef.current.play().catch(() => {});
              setIsPlaying(true);
            } else {
              videoRef.current.pause();
              setIsPlaying(false);
            }
            setTimeout(() => {
              isSyncActionInProgress.current = false;
            }, 400);
          }
        })
        .on("broadcast", { event: "CHAT" }, ({ payload }) => {
          setChatMessages((prev) => [...prev, payload]);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setIsConnected(true);
            setSyncStatus("Connected (Realtime Active)");
            addLog("Supabase Realtime broadcast channel subscribed!");
            
            // Send state request on join
            channel.send({
              type: "broadcast",
              event: "REQUEST_STATE",
              payload: { sender: userName, sentAt: Date.now() },
            });
          }
        });

      channelRef.current = channel;

      // 2. Fetch LiveKit Token & Connect WebRTC
      addLog("Requesting LiveKit WebRTC token...");
      const tokenRes = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: roomId,
          identity: userName,
          name: userName,
          isHost: true,
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.token) {
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });

        // Set up track subscriptions
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant: RemoteParticipant) => {
          addLog(`WebRTC track received from ${participant.identity}: ${track.kind}`);
          if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
            track.attach(remoteVideoRef.current);
          }
          if (track.kind === Track.Kind.Audio) {
            const audioEl = track.attach();
            document.body.appendChild(audioEl);
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach();
        });

        await room.connect(tokenData.wsUrl, tokenData.token);
        livekitRoomRef.current = room;
        setIsLiveKitConnected(true);
        addLog("LiveKit WebRTC SFU connected successfully!");

        // Publish local camera and mic
        try {
          await room.localParticipant.enableCameraAndMicrophone();
          const videoTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
          if (videoTrack && localVideoRef.current) {
            videoTrack.attach(localVideoRef.current);
          }
          addLog("Local video and audio published to WebRTC SFU");
        } catch (err: any) {
          addLog(`AV Permission Warning: ${err.message}`);
        }
      }
    } catch (err: any) {
      addLog(`Error connecting: ${err.message}`);
    }
  };

  const leaveParty = async () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (livekitRoomRef.current) {
      await livekitRoomRef.current.disconnect();
      livekitRoomRef.current = null;
    }
    setIsConnected(false);
    setIsLiveKitConnected(false);
    setSyncStatus("Disconnected");
    addLog("Disconnected from party room.");
  };

  // Video Event Handlers (Outbound Sync)
  const onLocalPlay = () => {
    if (isSyncActionInProgress.current || !channelRef.current) return;
    const time = videoRef.current?.currentTime || 0;
    addLog(`Local PLAY triggered at ${time.toFixed(2)}s -> Broadcasting`);
    channelRef.current.send({
      type: "broadcast",
      event: "PLAY",
      payload: { time, sentAt: Date.now(), sender: userName },
    });
  };

  const onLocalPause = () => {
    if (isSyncActionInProgress.current || !channelRef.current) return;
    const time = videoRef.current?.currentTime || 0;
    addLog(`Local PAUSE triggered at ${time.toFixed(2)}s -> Broadcasting`);
    channelRef.current.send({
      type: "broadcast",
      event: "PAUSE",
      payload: { time, sentAt: Date.now(), sender: userName },
    });
  };

  const onLocalSeeked = () => {
    if (isSyncActionInProgress.current || !channelRef.current) return;
    const time = videoRef.current?.currentTime || 0;
    addLog(`Local SEEK to ${time.toFixed(2)}s -> Broadcasting`);
    channelRef.current.send({
      type: "broadcast",
      event: "SEEK",
      payload: { time, sentAt: Date.now(), sender: userName },
    });
  };

  // Remote Sync Handlers (Inbound Sync with Lock Protection)
  const handleRemotePlay = ({ time, sentAt, sender }: any) => {
    addLog(`Remote PLAY received from ${sender} (target: ${time.toFixed(2)}s)`);
    if (!videoRef.current) return;
    isSyncActionInProgress.current = true;
    
    // Latency adjustment
    const latency = (Date.now() - (sentAt || Date.now())) / 1000;
    const adjustedTime = Math.max(0, time + (latency > 0 && latency < 2 ? latency : 0));
    
    if (Math.abs(videoRef.current.currentTime - adjustedTime) > 0.4) {
      videoRef.current.currentTime = adjustedTime;
    }
    videoRef.current.play().catch(() => {});
    setIsPlaying(true);
    
    setTimeout(() => {
      isSyncActionInProgress.current = false;
    }, 400);
  };

  const handleRemotePause = ({ time, sender }: any) => {
    addLog(`Remote PAUSE received from ${sender}`);
    if (!videoRef.current) return;
    isSyncActionInProgress.current = true;
    videoRef.current.pause();
    if (Math.abs(videoRef.current.currentTime - time) > 0.4) {
      videoRef.current.currentTime = time;
    }
    setIsPlaying(false);

    setTimeout(() => {
      isSyncActionInProgress.current = false;
    }, 400);
  };

  const handleRemoteSeek = ({ time, sender }: any) => {
    addLog(`Remote SEEK received from ${sender} to ${time.toFixed(2)}s`);
    if (!videoRef.current) return;
    isSyncActionInProgress.current = true;
    videoRef.current.currentTime = time;
    
    setTimeout(() => {
      isSyncActionInProgress.current = false;
    }, 400);
  };

  const handleRemoteHeartbeat = ({ time, isPlaying: remoteIsPlaying, sentAt, sender }: any) => {
    if (!videoRef.current || isSyncActionInProgress.current) return;
    
    const latency = (Date.now() - (sentAt || Date.now())) / 1000;
    const expectedTime = remoteIsPlaying ? time + latency : time;
    const drift = Math.abs(videoRef.current.currentTime - expectedTime);
    setDriftMs(Math.round(drift * 1000));

    // Auto drift correction threshold: 500ms
    if (drift > 0.5) {
      addLog(`Drift threshold exceeded (${Math.round(drift * 1000)}ms) - Resyncing to ${expectedTime.toFixed(2)}s`);
      isSyncActionInProgress.current = true;
      videoRef.current.currentTime = expectedTime;
      if (remoteIsPlaying && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
      setTimeout(() => {
        isSyncActionInProgress.current = false;
      }, 400);
    }
  };

  // Heartbeat sender loop
  useEffect(() => {
    if (!isConnected || !channelRef.current) return;

    const interval = setInterval(() => {
      if (videoRef.current && !isSyncActionInProgress.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "SYNC_HEARTBEAT",
          payload: {
            time: videoRef.current.currentTime,
            isPlaying: !videoRef.current.paused,
            sentAt: Date.now(),
            sender: userName,
          },
        });
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isConnected, userName]);

  // Chat message send
  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !channelRef.current) return;
    const msg = {
      sender: userName,
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    channelRef.current.send({
      type: "broadcast",
      event: "CHAT",
      payload: msg,
    });
    setChatMessages((prev) => [...prev, msg]);
    setChatInput("");
  };

  const toggleMic = async () => {
    if (!livekitRoomRef.current) return;
    const enabled = !micEnabled;
    await livekitRoomRef.current.localParticipant.setMicrophoneEnabled(enabled);
    setMicEnabled(enabled);
  };

  const toggleCamera = async () => {
    if (!livekitRoomRef.current) return;
    const enabled = !cameraEnabled;
    await livekitRoomRef.current.localParticipant.setCameraEnabled(enabled);
    setCameraEnabled(enabled);
  };

  return (
    <div className="min-h-screen bg-[#090A0F] text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header & Controls Bar */}
        <div className="bg-[#12141F] border border-white/10 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white">JustUs Test Sandbox</h1>
              <p className="text-xs text-slate-400">
                Live Supabase Realtime (<span className="text-emerald-400 font-mono">{syncStatus}</span>) & LiveKit WebRTC
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              disabled={isConnected}
              className="bg-black/50 border border-white/10 px-3 py-2 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500 w-32"
            />
            <input
              type="text"
              placeholder="Your Name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              disabled={isConnected}
              className="bg-black/50 border border-white/10 px-3 py-2 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 w-32"
            />

            {!isConnected ? (
              <button
                onClick={joinParty}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/25 transition-all"
              >
                Join Room
              </button>
            ) : (
              <button
                onClick={leaveParty}
                className="px-5 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 font-medium text-xs transition-all"
              >
                Leave Room
              </button>
            )}
          </div>
        </div>

        {/* Main Grid: Video Player + WebRTC Call Feeds + Sync Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left 2 Cols: Synchronized Video Player */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[#12141F] border border-white/10 rounded-2xl p-4 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-300">Synchronized Video Canvas</span>
                  <span className="px-2 py-0.5 rounded bg-white/10 text-[11px] font-mono text-indigo-300">
                    Drift: {driftMs}ms
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-600"}`} />
                  <span className="text-slate-400">{isConnected ? "In Sync" : "Local Mode"}</span>
                </div>
              </div>

              {/* Video Element */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                  controls
                  onPlay={onLocalPlay}
                  onPause={onLocalPause}
                  onSeeked={onLocalSeeked}
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setCurrentTime(videoRef.current.currentTime);
                      setDuration(videoRef.current.duration || 0);
                    }
                  }}
                  className="w-full h-full object-contain"
                />

                {/* Floating 1-on-1 Video Overlays (Simulating Extension Shadow DOM UI) */}
                <div className="absolute top-4 right-4 flex flex-col gap-3 pointer-events-auto z-20">
                  {/* Remote Peer Stream */}
                  <div className="w-40 h-28 bg-slate-900/90 border border-white/20 rounded-xl overflow-hidden shadow-2xl relative">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1 left-2 text-[10px] bg-black/60 px-1.5 py-0.5 rounded text-white font-medium">
                      Remote Peer
                    </div>
                  </div>

                  {/* Local Stream (PIP) */}
                  <div className="w-32 h-24 bg-slate-950/90 border border-white/20 rounded-xl overflow-hidden shadow-2xl relative">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <div className="absolute bottom-1 left-2 text-[10px] bg-black/60 px-1.5 py-0.5 rounded text-indigo-300 font-medium">
                      You
                    </div>
                  </div>
                </div>
              </div>

              {/* WebRTC Call Controls Toolbar */}
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMic}
                    disabled={!isLiveKitConnected}
                    className={`p-2.5 rounded-xl border transition-all ${
                      micEnabled
                        ? "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                        : "bg-red-500/20 border-red-500/40 text-red-400"
                    }`}
                  >
                    {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={toggleCamera}
                    disabled={!isLiveKitConnected}
                    className={`p-2.5 rounded-xl border transition-all ${
                      cameraEnabled
                        ? "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                        : "bg-red-500/20 border-red-500/40 text-red-400"
                    }`}
                  >
                    {cameraEnabled ? <VideoIcon className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                  </button>
                </div>

                <div className="text-xs text-slate-400 font-mono">
                  {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                </div>
              </div>
            </div>

            {/* Realtime Event Stream Logs */}
            <div className="bg-[#12141F] border border-white/10 rounded-2xl p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-400 mb-2 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-indigo-400" />
                Realtime Event Logs
              </h3>
              <div className="bg-black/40 border border-white/5 rounded-xl p-3 h-36 overflow-y-auto font-mono text-[11px] space-y-1 text-slate-300">
                {logs.length === 0 ? (
                  <span className="text-slate-600">No events yet. Connect and play/pause to test sync.</span>
                ) : (
                  logs.map((log, idx) => <div key={idx}>{log}</div>)
                )}
              </div>
            </div>
          </div>

          {/* Right Col: Party Chat & Presence */}
          <div className="bg-[#12141F] border border-white/10 rounded-2xl p-4 flex flex-col h-[600px]">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span>Party Chat</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded">
                Room: {roomId}
              </span>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
              {chatMessages.length === 0 ? (
                <div className="text-center text-xs text-slate-500 mt-20">
                  No messages yet. Send a message to your party!
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${
                      msg.sender === userName ? "items-end" : "items-start"
                    }`}
                  >
                    <div className="text-[10px] text-slate-400 mb-0.5 flex items-center gap-1">
                      <span className="font-semibold text-slate-300">{msg.sender}</span>
                      <span>{msg.time}</span>
                    </div>
                    <div
                      className={`px-3 py-2 rounded-xl text-xs max-w-[85%] ${
                        msg.sender === userName
                          ? "bg-indigo-600 text-white rounded-br-none"
                          : "bg-white/10 text-slate-200 rounded-bl-none"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={sendChatMessage} className="pt-3 border-t border-white/10 flex gap-2">
              <input
                type="text"
                placeholder="Say something..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={!isConnected}
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!isConnected || !chatInput.trim()}
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
