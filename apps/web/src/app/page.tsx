"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-[#090A0F] text-slate-100 overflow-hidden font-sans selection:bg-indigo-500 selection:text-white">
      {/* Background glow effects */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-r from-red-600/20 via-indigo-600/25 to-purple-600/20 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute top-[45%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/10 blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[10%] left-[-10%] w-[500px] h-[500px] bg-red-600/10 blur-[160px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 bg-[#090A0F]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-red-600 to-indigo-600 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-indigo-500/25">
              JU
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
              JustUS
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href="#platforms"
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-600/25 transition-all"
            >
              Get JustUS
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-6 pt-16 pb-24 relative z-10">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-red-500/10 to-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold tracking-wide uppercase shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Watch Party + 1-on-1 WebRTC Video Calling
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-[1.1]">
            Watch Netflix & Prime together with{" "}
            <span className="bg-gradient-to-r from-red-500 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Live Face-to-Face Video
            </span>.
          </h1>

          <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            JustUS syncs video playback with millisecond accuracy while keeping you and your friend connected with crystal-clear 1-on-1 video call, draggable camera overlay, and real-time chat.
          </p>
        </div>

        {/* Platforms Download Grid */}
        <section id="platforms" className="mt-16 scroll-mt-24">
          <div className="text-center mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Choose Your Platform</h2>
            <p className="text-xs text-slate-400 mt-1">Available across Desktop, Android, and iOS / iPadOS</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Card 1: Desktop Browser Extension */}
            <div className="bg-[#12141F]/80 backdrop-blur-md border border-white/10 hover:border-indigo-500/40 rounded-2xl p-6 flex flex-col justify-between shadow-xl transition-all hover:scale-[1.02]">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-2xl">
                  💻
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">Desktop & Laptop</h3>
                    <span className="text-[10px] uppercase font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">Extension</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Chrome, Edge, Brave, and Opera extension. Injects directly into Netflix and Amazon Prime Video.
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 space-y-2">
                <a
                  href="/justus-extension.zip"
                  download
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl text-center block shadow-md shadow-indigo-600/20 transition-colors"
                >
                  Download Extension (.zip)
                </a>
                <p className="text-[10px] text-slate-500 text-center">Load unpacked in chrome://extensions</p>
              </div>
            </div>

            {/* Card 2: Android Native App */}
            <div className="bg-[#12141F]/80 backdrop-blur-md border border-white/10 hover:border-emerald-500/40 rounded-2xl p-6 flex flex-col justify-between shadow-xl transition-all hover:scale-[1.02]">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl">
                  📱
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">Android Mobile</h3>
                    <span className="text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">App (APK)</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Dedicated Android app with embedded desktop streaming browser, floating video bubble, and sync.
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 space-y-2">
                <a
                  href="/justus-android-project.zip"
                  download
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl text-center block shadow-md shadow-emerald-600/20 transition-colors"
                >
                  Download Android App Project
                </a>
                <p className="text-[10px] text-slate-500 text-center">Ready to run in Android Studio</p>
              </div>
            </div>

            {/* Card 3: iOS & iPadOS App */}
            <div className="bg-[#12141F]/80 backdrop-blur-md border border-white/10 hover:border-purple-500/40 rounded-2xl p-6 flex flex-col justify-between shadow-xl transition-all hover:scale-[1.02]">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-2xl">
                  🍎
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">iPad & iPhone</h3>
                    <span className="text-[10px] uppercase font-bold bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">iOS / iPadOS</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Dedicated iPadOS & iOS app with WKWebView desktop player and floating minimizable video call.
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 space-y-2">
                <a
                  href="/justus-ios-project.zip"
                  download
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl text-center block shadow-md shadow-purple-600/20 transition-colors"
                >
                  Download iOS App Project
                </a>
                <p className="text-[10px] text-slate-500 text-center">Sideload with Sideloadly / AltStore</p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works (3 Easy Steps) */}
        <section className="mt-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-white">How It Works</h2>
            <p className="text-xs text-slate-400 mt-1">Start watching together in under 60 seconds</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-[#12141F]/40 border border-white/5 p-6 rounded-2xl text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-400 font-black flex items-center justify-center mx-auto text-sm">
                1
              </div>
              <h3 className="font-bold text-sm text-white">Install JustUS</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Add the extension to your desktop browser, or install the dedicated app on your phone or tablet.
              </p>
            </div>

            <div className="bg-[#12141F]/40 border border-white/5 p-6 rounded-2xl text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 font-black flex items-center justify-center mx-auto text-sm">
                2
              </div>
              <h3 className="font-bold text-sm text-white">Open Any Video</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Navigate to your favorite movie or episode on Netflix, Amazon Prime Video, or YouTube.
              </p>
            </div>

            <div className="bg-[#12141F]/40 border border-white/5 p-6 rounded-2xl text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 font-black flex items-center justify-center mx-auto text-sm">
                3
              </div>
              <h3 className="font-bold text-sm text-white">Start & React Together</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Click Start Party, share your invite link, and enjoy live 1-on-1 video calling while watching.
              </p>
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#12141F]/60 border border-white/5 space-y-3">
            <div className="text-2xl">📹</div>
            <h3 className="font-bold text-sm text-white">LiveKit 1-on-1 Video Call</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Ultra-low latency SFU WebRTC video calling. Floating, draggable, and minimizable into a small bubble.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#12141F]/60 border border-white/5 space-y-3">
            <div className="text-2xl">⚡</div>
            <h3 className="font-bold text-sm text-white">Sub-Second Playback Sync</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Bi-directional WebSocket sync powered by Supabase Realtime keeps play, pause, and seek within 500ms.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#12141F]/60 border border-white/5 space-y-3">
            <div className="text-2xl">🔊</div>
            <h3 className="font-bold text-sm text-white">Audio & Call Volume Controls</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Separate friend call volume slider and mic sensitivity controls so movie audio stays perfectly balanced.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-500">
        <p>JustUS — Synchronized Watch Party with 1-on-1 Video Calling</p>
      </footer>
    </div>
  );
}
