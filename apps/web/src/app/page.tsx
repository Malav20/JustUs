"use client";

import { useState } from "react";
import { 
  Tv, 
  Video, 
  Sparkles, 
  ShieldCheck, 
  ArrowRight, 
  Play, 
  Share2, 
  Copy, 
  Check, 
  ExternalLink,
  Laptop
} from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const [service, setService] = useState<"netflix" | "prime" | "generic">("netflix");
  const [videoUrl, setVideoUrl] = useState("");
  const [createdRoom, setCreatedRoom] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          videoUrl: videoUrl || (service === "netflix" ? "https://www.netflix.com/watch/80057281" : "https://www.primevideo.com"),
          title: `${service.toUpperCase()} Party`,
          hostId: "user_" + Math.random().toString(36).substring(2, 8),
        }),
      });

      const data = await res.json();
      if (data.room?.id) {
        setCreatedRoom(data.room.id);
      }
    } catch (err) {
      console.error(err);
      // Fallback room code if offline
      setCreatedRoom("room_" + Math.random().toString(36).substring(2, 10));
    } finally {
      setLoading(false);
    }
  };

  const copyInvite = () => {
    if (!createdRoom) return;
    const url = `${window.location.origin}/join/${createdRoom}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Glow background effects */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/20 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] bg-red-600/10 blur-[140px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 bg-[#090A0F]/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-200 bg-clip-text text-transparent">
              JustUs
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/sandbox"
              className="text-xs sm:text-sm font-medium px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors border border-white/10 flex items-center gap-2"
            >
              <Laptop className="w-4 h-4 text-indigo-400" />
              Interactive Test Sandbox
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-6 pt-16 pb-24">
        <div className="text-center space-y-5 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold tracking-wide uppercase shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Next-Gen Watch Party & 1-on-1 WebRTC
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Watch Netflix & Prime together with <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Live Face-to-Face Video</span>.
          </h1>

          <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Zero-latency synchronized playback (<span className="text-indigo-300 font-mono">drift &lt; 500ms</span>), floating WebRTC picture-in-picture video call, and unified controls for Netflix and Amazon Prime Video.
          </p>
        </div>

        {/* Room Creator Card */}
        <div className="mt-12 max-w-xl mx-auto bg-[#12141F] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative">
          <form onSubmit={handleCreateRoom} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                1. Select Streaming Platform
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setService("netflix")}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all ${
                    service === "netflix"
                      ? "bg-[#E50914]/15 border-[#E50914] text-white shadow-lg shadow-[#E50914]/20"
                      : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  <span className="font-black text-sm tracking-tight text-[#E50914]">NETFLIX</span>
                </button>

                <button
                  type="button"
                  onClick={() => setService("prime")}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all ${
                    service === "prime"
                      ? "bg-[#00A8E1]/15 border-[#00A8E1] text-white shadow-lg shadow-[#00A8E1]/20"
                      : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  <span className="font-black text-sm tracking-tight text-[#00A8E1]">PRIME VIDEO</span>
                </button>

                <button
                  type="button"
                  onClick={() => setService("generic")}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all ${
                    service === "generic"
                      ? "bg-indigo-500/15 border-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                      : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  <span className="font-semibold text-sm tracking-tight">Generic HTML5</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                2. Video URL or Title (Optional)
              </label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder={
                  service === "netflix"
                    ? "https://www.netflix.com/watch/80057281"
                    : service === "prime"
                    ? "https://www.primevideo.com/detail/..."
                    : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                }
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              {loading ? (
                "Creating Watch Party..."
              ) : (
                <>
                  <span>Create Watch Party Room</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Created Room Share Box */}
          {createdRoom && (
            <div className="mt-6 pt-6 border-t border-white/10 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold mb-1.5">
                  <span>Room Created Successfully!</span>
                  <span className="font-mono bg-indigo-500/20 px-2 py-0.5 rounded text-[11px]">{createdRoom}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/join/${createdRoom}`}
                    className="w-full bg-black/50 border border-white/10 text-slate-200 px-3 py-2 rounded-lg text-xs font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={copyInvite}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs">
                <Link
                  href={`/join/${createdRoom}`}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium text-center transition-colors flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  Enter Party Room
                </Link>
                <Link
                  href="/sandbox"
                  className="flex-1 py-2.5 px-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-200 font-medium text-center transition-colors flex items-center justify-center gap-1.5"
                >
                  <Laptop className="w-3.5 h-3.5" />
                  Test in Sandbox
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Feature Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#12141F]/60 border border-white/5 hover:border-white/10 transition-all">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <Video className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">LiveKit 1-on-1 SFU WebRTC</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Crystal-clear video and audio overlay rendered inside an isolated Shadow DOM. Draggable, resizable, and auto-adapts bandwidth.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#12141F]/60 border border-white/5 hover:border-white/10 transition-all">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <Tv className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Supabase Drift Sync</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Bi-directional WebSocket broadcast keeps video playback synchronized across peers within 500ms using latency compensation.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#12141F]/60 border border-white/5 hover:border-white/10 transition-all">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Manifest V3 Extension</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Custom React Fiber & HTML5 player adapters for Netflix and Amazon Prime Video with background tab state management.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
