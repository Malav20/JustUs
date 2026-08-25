"use client";

import Link from "next/link";
import { useState } from "react";

export default function DownloadsPage() {
  const [copied, setCopied] = useState(false);

  const copyExtensionsUrl = () => {
    navigator.clipboard.writeText("chrome://extensions");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-screen bg-[#090A12] text-slate-100 overflow-hidden font-sans selection:bg-rose-500 selection:text-white">
      {/* Warm Ambient Romantic Glows */}
      <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[850px] h-[500px] bg-gradient-to-r from-rose-600/20 via-purple-600/25 to-amber-500/15 blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-rose-600/15 blur-[170px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 bg-[#090A12]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center text-sm text-white shadow-lg shadow-rose-500/25 group-hover:scale-105 transition-transform">
              ❤️
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-rose-100 to-purple-200 bg-clip-text text-transparent">
                JustUS
              </span>
              <span className="ml-2 text-[10px] uppercase font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                🍓 & 🦁 Downloads
              </span>
            </div>
          </Link>

          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all flex items-center gap-1"
            >
              <span>←</span>
              <span>Back Home</span>
            </Link>
            <Link
              href="/mobile"
              className="text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white shadow-md shadow-rose-600/25 transition-all flex items-center gap-1.5"
            >
              <span>🍿</span>
              <span>Movie Hub</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 pt-12 pb-24 relative z-10 space-y-10">
        {/* Title */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-bold tracking-wide">
            <span>✨</span>
            <span>Made Exclusively for Strawberry & Her Lion</span>
            <span>✨</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Our App Downloads
          </h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Choose your device below so we can jump into our next movie date together in seconds.
          </p>
        </div>

        {/* Sleek Modular Cards */}
        <div className="space-y-5">
          {/* Item 1: For Rutwa (Desktop Extension) */}
          <div className="p-6 rounded-2xl bg-[#121422]/90 border border-rose-500/25 hover:border-rose-500/45 shadow-xl transition-all relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-2xl shrink-0">
                  🍓
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">Rutwa's Laptop (Chrome Extension)</h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30">
                      👑 Princess
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Injects our private watch party & floating face-to-face video call directly into Netflix & Prime Video.
                  </p>
                </div>
              </div>

              <a
                href="/justus-extension.zip"
                download
                className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-xs rounded-xl text-center shadow-lg shadow-rose-600/30 transition-all shrink-0 flex items-center justify-center gap-1.5"
              >
                <span>⚡</span>
                <span>Download Extension (.zip)</span>
              </a>
            </div>

            {/* Sleek Step-by-Step Guide */}
            <div className="mt-5 pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-[11px] text-slate-300 space-y-1">
                <span className="font-bold text-rose-300 text-[10px] uppercase block">Step 1 • Unzip</span>
                <p className="text-slate-400">Extract the downloaded <code className="text-rose-200 bg-white/10 px-1 py-0.5 rounded text-[10px]">justus-extension.zip</code></p>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-[11px] text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-300 text-[10px] uppercase">Step 2 • Extensions</span>
                  <button
                    onClick={copyExtensionsUrl}
                    className="text-[9px] text-rose-300 hover:text-rose-200 underline"
                  >
                    {copied ? "Copied!" : "Copy URL"}
                  </button>
                </div>
                <p className="text-slate-400">Open <code className="text-rose-200 bg-white/10 px-1 py-0.5 rounded text-[10px]">chrome://extensions</code></p>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-[11px] text-slate-300 space-y-1">
                <span className="font-bold text-rose-300 text-[10px] uppercase block">Step 3 • Load</span>
                <p className="text-slate-400">Toggle <strong>Developer mode</strong> & click <strong>Load unpacked</strong></p>
              </div>
            </div>
          </div>

          {/* Item 2: For Malav (iPad & iPhone) */}
          <div className="p-6 rounded-2xl bg-[#121422]/90 border border-purple-500/25 hover:border-purple-500/45 shadow-xl transition-all relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-2xl shrink-0">
                  🦁
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">Malav's iPad & iPhone App</h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full border border-purple-500/30">
                      🥭 Sweetums
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Dedicated iPadOS & iOS application with embedded desktop video player & floating PIP camera.
                  </p>
                </div>
              </div>

              <a
                href="/justus-ios-project.zip"
                download
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold text-xs rounded-xl text-center shadow-lg shadow-purple-600/30 transition-all shrink-0 flex items-center justify-center gap-1.5"
              >
                <span>🍎</span>
                <span>Download iOS Project (.zip)</span>
              </a>
            </div>

            <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400 bg-black/20 rounded-xl px-4 py-2.5">
              <span>Ready for Xcode or sideloading via Sideloadly / AltStore onto iPad & iPhone</span>
              <span className="text-purple-300 font-bold text-[10px] uppercase">iOS 15+</span>
            </div>
          </div>

          {/* Item 3: Android Mobile (Coming Soon) */}
          <div className="p-6 rounded-2xl bg-[#121422]/60 border border-white/5 shadow-md relative overflow-hidden backdrop-blur-md opacity-80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl shrink-0">
                  📱
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-200">Android Mobile App</h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      🚀 Coming Soon
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Dedicated Android APK with floating video bubble & background sync is currently in the oven.
                  </p>
                </div>
              </div>

              <div className="px-4 py-2 bg-white/5 text-slate-400 font-semibold text-xs rounded-xl text-center border border-white/10 shrink-0 cursor-not-allowed">
                Baking Soon ☕
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Romantic Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-400 space-y-1">
        <p className="font-semibold text-rose-300/90">Crafted with all my ❤️ for Strawberry from Lion</p>
        <p className="text-[11px] text-slate-500">Forever Our Private Cinema</p>
      </footer>
    </div>
  );
}
