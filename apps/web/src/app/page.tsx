"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { MobileWatchParty } from "@/components/MobileWatchParty";

function LandingPageContent() {
  const [isMobileOrApp, setIsMobileOrApp] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.() || !!(window as any).Capacitor;
      const isTouch = navigator.maxTouchPoints > 0 || /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
      setIsMobileOrApp(isCapacitor || isTouch);
    }
  }, []);

  if (isMobileOrApp) {
    return <MobileWatchParty />;
  }

  return (
    <div className="relative min-h-screen bg-[#090A12] text-slate-100 overflow-hidden font-sans selection:bg-rose-500 selection:text-white">
      {/* Warm Ambient Romantic Glows */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[850px] h-[500px] bg-gradient-to-r from-rose-600/25 via-purple-600/25 to-amber-500/15 blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[550px] h-[550px] bg-rose-600/15 blur-[170px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[10%] left-[-10%] w-[550px] h-[550px] bg-purple-600/15 blur-[170px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 bg-[#090A12]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center text-sm text-white shadow-lg shadow-rose-500/25">
              ❤️
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-rose-100 to-purple-200 bg-clip-text text-transparent">
                JustUS
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] uppercase font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full">
                🍓 Strawberry & 🦁 Lion
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/downloads"
              className="text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all flex items-center gap-1"
            >
              <span>✨</span>
              <span>Our Apps</span>
            </Link>
            <Link
              href="/mobile"
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white shadow-md shadow-rose-600/25 transition-all flex items-center gap-1.5"
            >
              <span>🍿</span>
              <span>Start Movie Date</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-6 pt-16 pb-24 relative z-10 space-y-16">
        <div className="text-center space-y-6 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-rose-500/15 via-purple-500/15 to-amber-500/15 border border-rose-500/30 text-rose-200 text-xs font-bold tracking-wide shadow-inner">
            <span>🍓</span>
            <span>Strawberry & Lion's Private Cinema</span>
            <span>🦁</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-[1.1]">
            Where Princess & Her Mango{" "}
            <span className="bg-gradient-to-r from-rose-400 via-purple-300 to-amber-300 bg-clip-text text-transparent">
              Watch Movies Together
            </span>.
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl mx-auto font-normal">
            When my Cheetah wants a Netflix marathon and Sweetums just wants to see her laugh. Real-time video sync, live face-to-face video call, and zero distance.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/mobile"
              className="px-6 py-3 bg-gradient-to-r from-rose-600 via-rose-500 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2"
            >
              <span>🍿</span>
              <span>Start Our Movie Date</span>
            </Link>
            <Link
              href="/downloads"
              className="px-5 py-3 bg-white/5 hover:bg-white/10 text-slate-200 font-semibold text-sm rounded-xl border border-white/10 transition-all flex items-center gap-2"
            >
              <span>💻</span>
              <span>Get Chrome Extension & Apps</span>
            </Link>
          </div>
        </div>

        {/* Romantic Features */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          <div className="p-6 rounded-2xl bg-[#121422]/70 border border-rose-500/20 shadow-xl space-y-3 relative overflow-hidden backdrop-blur-md">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-xl">
              🍓
            </div>
            <h3 className="font-bold text-base text-white">See My Princess Live</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Floating, draggable video call so Lion never misses a single laugh, gasp, or sleepy yawn from Strawberry.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#121422]/70 border border-purple-500/20 shadow-xl space-y-3 relative overflow-hidden backdrop-blur-md">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-xl">
              🥭
            </div>
            <h3 className="font-bold text-base text-white">Sync for Snack Breaks</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              When Cheetah pauses for chai or Mango grabs snacks, both screens pause in exact frame-by-frame sync.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#121422]/70 border border-amber-500/20 shadow-xl space-y-3 relative overflow-hidden backdrop-blur-md">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-xl">
              👑
            </div>
            <h3 className="font-bold text-base text-white">Our Private World</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Private chat, cute heart reactions, and 6-digit party codes created strictly for just the two of us.
            </p>
          </div>
        </section>

        {/* Romantic Movie Date Rules */}
        <section className="p-6 rounded-2xl bg-[#121422]/50 border border-white/5 space-y-4 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h2 className="text-sm font-bold text-rose-300 uppercase tracking-wider flex items-center gap-2">
              <span>📜</span>
              <span>Our Official Movie Date Rules</span>
            </h2>
            <span className="text-[10px] text-slate-500">Established by Strawberry & Lion</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300">
            <div className="space-y-1">
              <span className="font-bold text-rose-200">Rule #1 🍓</span>
              <p className="text-slate-400">No watching ahead without Strawberry's royal permission.</p>
            </div>
            <div className="space-y-1">
              <span className="font-bold text-purple-200">Rule #2 🦁</span>
              <p className="text-slate-400">Lion must pause instantly when Cheetah asks for snack time.</p>
            </div>
            <div className="space-y-1">
              <span className="font-bold text-amber-200">Rule #3 👑</span>
              <p className="text-slate-400">Face-to-face video calling is mandatory for cute reactions.</p>
            </div>
          </div>
        </section>
      </main>

      {/* Romantic Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-400 space-y-1">
        <p className="font-semibold text-rose-300/90">
          Crafted with all my ❤️ for my Strawberry, Cheetah & Princess from her Lion, Mango & Sweetums
        </p>
        <p className="text-[11px] text-slate-500">Forever Our Favorite Midnight Movie Dates</p>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0B12] text-white flex items-center justify-center text-sm font-bold">Loading Strawberry & Lion's Cinema...</div>}>
      <LandingPageContent />
    </Suspense>
  );
}
