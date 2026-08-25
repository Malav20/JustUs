"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PageProps {
  params: {
    roomId: string;
  };
}

export default function JoinPage({ params }: PageProps) {
  const roomId = params?.roomId || "";

  const [roomData, setRoomData] = useState<any>({
    id: roomId,
    service: "netflix",
    video_url: "https://www.netflix.com/watch/80057281",
    title: "Teleparty Watch Room",
  });
  const [userName, setUserName] = useState("Viewer");
  const [copied, setCopied] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    fetch(`/api/rooms?id=${roomId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.room) {
          setRoomData(data.room);
        }
      })
      .catch(() => {});
  }, [roomId]);

  const handleLaunch = () => {
    setRedirecting(true);
    const baseVideoUrl = roomData?.video_url || "https://www.netflix.com/watch/80057281";
    const finalUserName = userName.trim() || "Viewer_" + Math.floor(Math.random() * 1000);

    // Append client-side Hash fragment #tp=roomId&user=name
    // URL hashes are purely client-side, never sent to Netflix server/DRM, avoiding D7375 errors
    const cleanUrl = baseVideoUrl.split("#")[0];
    const targetUrl = `${cleanUrl}#tp=${encodeURIComponent(roomId)}&user=${encodeURIComponent(finalUserName)}`;

    window.location.href = targetUrl;
  };

  const copyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#090A0F] text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/15 blur-[160px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-[#12141F] border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 mx-auto mb-4">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Join JustUS Party
          </h1>
          <p className="text-xs text-slate-400">
            Room Code: <span className="font-mono text-indigo-400 font-bold">{roomId}</span>
          </p>
        </div>

        {/* Room Details */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Platform:</span>
            <span className={`font-bold uppercase ${
              roomData?.service === "netflix" ? "text-[#E50914]" : roomData?.service === "prime" ? "text-[#00A8E1]" : "text-indigo-400"
            }`}>
              {roomData?.service || "Netflix"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Title / Target:</span>
            <span className="font-medium text-slate-200 truncate max-w-[200px]">
              {roomData?.title || "Streaming Party"}
            </span>
          </div>
        </div>

        {/* User Name Input */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Your Display Name
          </label>
          <input
            type="text"
            placeholder="e.g. Alex"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
          />
        </div>

        {/* Action Button */}
        <div className="space-y-3">
          <button
            onClick={handleLaunch}
            disabled={redirecting}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>{redirecting ? "Opening Video & Joining..." : "Launch Stream & Join Party"}</span>
          </button>

          <Link
            href={`/sandbox?room=${roomId}`}
            className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-medium text-xs border border-white/10 flex items-center justify-center gap-2 transition-colors"
          >
            <span>Open in Local Test Sandbox</span>
            <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
          </Link>
        </div>

        <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <button
            onClick={copyLink}
            className="hover:text-indigo-300 flex items-center gap-1.5 transition-colors"
          >
            {copied ? (
              <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            )}
            <span>{copied ? "Link Copied!" : "Copy Party Link"}</span>
          </button>
          <Link href="/" className="hover:text-white transition-colors">
            Create New Party
          </Link>
        </div>
      </div>
    </div>
  );
}
