"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Play,
  LogOut,
  ShieldCheck,
  Sparkles,
  Lock,
  ChevronRight,
  ExternalLink,
  Info,
} from "lucide-react";

interface ServiceItem {
  id: "netflix" | "prime" | "youtube";
  name: string;
  category: string;
  description: string;
  loginUrl: string;
  browseUrl: string;
  brandColor: string;
  badgeBorder: string;
  tag: string;
}

const STREAMING_SERVICES: ServiceItem[] = [
  {
    id: "netflix",
    name: "Netflix",
    category: "Movies & Series",
    description: "Originals, blockbuster movies, TV shows & documentaries",
    loginUrl: "https://www.netflix.com/login",
    browseUrl: "https://www.netflix.com/browse",
    brandColor: "#E50914",
    badgeBorder: "border-[#E50914]/40",
    tag: "4K HDR",
  },
  {
    id: "prime",
    name: "Amazon Prime Video",
    category: "Amazon Originals",
    description: "Prime Video movies, exclusive series, sports & rentals",
    loginUrl: "https://www.primevideo.com/",
    browseUrl: "https://www.primevideo.com/",
    brandColor: "#00A8E1",
    badgeBorder: "border-[#00A8E1]/40",
    tag: "Prime",
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "Free Streaming",
    description: "Trailers, music, podcasts, creator streams & clips",
    loginUrl: "https://accounts.google.com/ServiceLogin?service=youtube",
    browseUrl: "https://www.youtube.com",
    brandColor: "#FF0000",
    badgeBorder: "border-red-500/40",
    tag: "Free",
  },
];

export function MobileWatchParty() {
  const [notification, setNotification] = useState<string | null>(null);
  const [pendingService, setPendingService] = useState<ServiceItem | null>(null);
  const [isConnectingModalOpen, setIsConnectingModalOpen] = useState(false);
  const [userName, setUserName] = useState<string>("iPad_User");
  const searchParams = useSearchParams();

  // Connection State for Each Service (Persisted in localStorage)
  const [connectedServices, setConnectedServices] = useState<Record<string, boolean>>({
    netflix: false,
    prime: false,
    youtube: false,
  });

  // Load saved state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("justus_connected_services");
      if (saved) {
        setConnectedServices(JSON.parse(saved));
      }

      // A ?user= param (e.g. from a /join invite link) takes priority and is persisted.
      const userParam = searchParams?.get("user")?.trim();
      const savedName = localStorage.getItem("justus_username");
      if (userParam) {
        setUserName(userParam);
        localStorage.setItem("justus_username", userParam);
      } else if (savedName) {
        setUserName(savedName);
      } else {
        const defaultName = "User_" + Math.floor(Math.random() * 1000);
        setUserName(defaultName);
        localStorage.setItem("justus_username", defaultName);
      }

      // Check if returning from a pending login
      const pending = localStorage.getItem("justus_pending_service");
      if (pending) {
        localStorage.removeItem("justus_pending_service");
        const matchedService = STREAMING_SERVICES.find((s) => s.id === pending);
        if (matchedService) {
          updateConnectionState(pending, true);
          showToast(`✓ Welcome back! ${matchedService.name} is now marked as connected.`);
        }
      }
    } catch (e) {
      console.warn("Could not load state:", e);
    }
  }, [searchParams]);

  const handleNameChange = (val: string) => {
    setUserName(val);
    try {
      localStorage.setItem("justus_username", val);
    } catch (e) {}
  };

  // Show temporary toast notification
  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Save connection states to localStorage
  const updateConnectionState = (serviceId: string, isConnected: boolean) => {
    setConnectedServices((prev) => {
      const updated = { ...prev, [serviceId]: isConnected };
      try {
        localStorage.setItem("justus_connected_services", JSON.stringify(updated));
      } catch (e) {
        console.warn("Could not save connection state:", e);
      }
      return updated;
    });
  };

  // Helper to load service URL inside iOS WKWebView without triggering Universal Link handoff
  const loadServiceInApp = (targetUrl: string) => {
    if (typeof window !== "undefined") {
      const webkit = (window as any).webkit;
      if (webkit?.messageHandlers?.streamAuth?.postMessage) {
        try {
          webkit.messageHandlers.streamAuth.postMessage({ url: targetUrl });
          return;
        } catch (e) {
          console.warn("streamAuth message handler error:", e);
        }
      }
      // Top-level direct navigation in WKWebView / browser
      window.location.href = targetUrl;
    }
  };

  // Connect flow: Launches service login inside the app
  const handleConnectNow = (service: ServiceItem) => {
    setPendingService(service);
    try {
      localStorage.setItem("justus_pending_service", service.id);
    } catch (e) {}

    const isNative = typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();

    if (isNative) {
      showToast(`Opening ${service.name} login inside JustUS...`);
      loadServiceInApp(service.loginUrl);
    } else {
      setIsConnectingModalOpen(true);
    }
  };

  // Confirm connection manually
  const handleConfirmLogin = (service: ServiceItem) => {
    updateConnectionState(service.id, true);
    setIsConnectingModalOpen(false);
    showToast(`✓ ${service.name} is now connected!`);
  };

  // Browse & Watch flow: Opens streaming catalog / player inside app
  const handleBrowseAndWatch = (service: ServiceItem) => {
    showToast(`Loading ${service.name} catalog...`);
    loadServiceInApp(service.browseUrl);
  };

  // Disconnect service
  const handleDisconnect = (serviceId: string, serviceName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    updateConnectionState(serviceId, false);
    showToast(`${serviceName} has been disconnected`);
  };

  // Count connected services
  const connectedCount = Object.values(connectedServices).filter(Boolean).length;

  return (
    <div className="relative min-h-screen bg-[#090A0F] text-slate-100 flex flex-col font-sans overflow-x-hidden select-none">
      {/* Toast Notification Banner */}
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#161928]/95 backdrop-blur-md border border-white/20 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top duration-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{notification}</span>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TABULAR STREAMING SERVICES CONNECTION HUB                     */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-between max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* Top Header Bar */}
        <header className="pt-2 pb-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center space-x-3">
            <img
              src="/logo.png"
              alt="JustUS"
              className="w-11 h-11 rounded-2xl object-cover shadow-lg shadow-indigo-500/25 border border-white/15 shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-lg text-white tracking-tight">JustUS</h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Mobile & Tablet
                </span>
              </div>
              <p className="text-xs text-slate-400">Synchronized Streaming & Watch Party</p>
            </div>
          </div>

          {/* User profile & connected count */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#12141F] border border-white/10 px-3 py-1.5 rounded-2xl shadow-inner">
              <span className="text-xs">👤</span>
              <input
                type="text"
                value={userName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="bg-transparent text-xs text-white font-bold w-20 outline-none truncate"
                placeholder="Your Name"
              />
            </div>
          </div>
        </header>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* STREAMING SERVICES TABLE                                      */}
        {/* ───────────────────────────────────────────────────────────── */}
        <main className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-white tracking-tight">Streaming Services</h2>
              <span className="text-[11px] text-slate-400 font-medium">
                {connectedCount} of {STREAMING_SERVICES.length} Connected
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Connect your account once. Tap <strong>Browse & Watch</strong> to start movies with the Party Overlay.
            </p>
          </div>

          {/* TABULAR SERVICES LIST */}
          <div className="bg-[#12141F]/90 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden shadow-2xl divide-y divide-white/5">
            {/* Table Header (Hidden on extra small screens) */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-white/[0.02] text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <div className="col-span-6">Service</div>
              <div className="col-span-3 text-center">Status</div>
              <div className="col-span-3 text-right">Action</div>
            </div>

            {/* Table Rows */}
            {STREAMING_SERVICES.map((service) => {
              const isConnected = !!connectedServices[service.id];

              return (
                <div
                  key={service.id}
                  className="p-4 sm:px-6 sm:py-4 transition-colors hover:bg-white/[0.03] flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:gap-4 sm:items-center"
                >
                  {/* Column 1: Service Info & Brand */}
                  <div className="sm:col-span-6 flex items-center space-x-3.5">
                    {/* Brand Logo Box */}
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-md shrink-0 border ${
                        service.id === "netflix"
                          ? "bg-gradient-to-br from-[#E50914] to-[#800000] border-[#E50914]/50 shadow-red-600/20"
                          : service.id === "prime"
                          ? "bg-gradient-to-br from-[#00A8E1] to-[#005B82] border-[#00A8E1]/50 shadow-cyan-600/20"
                          : "bg-gradient-to-br from-red-600 to-red-800 border-red-500/50 shadow-red-600/20"
                      }`}
                    >
                      {service.id === "netflix" ? (
                        <span className="text-base font-black tracking-tighter">NET</span>
                      ) : service.id === "prime" ? (
                        <span className="text-xs font-black tracking-tighter">PRIME</span>
                      ) : (
                        <Play className="w-5 h-5 fill-current" />
                      )}
                    </div>

                    {/* Service Text Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-white truncate">{service.name}</h3>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                          {service.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{service.description}</p>
                    </div>
                  </div>

                  {/* Column 2: Status Badge */}
                  <div className="sm:col-span-3 flex sm:justify-center items-center">
                    {isConnected ? (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold shadow-sm">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Connected</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-400 text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />
                        <span>Not Connected</span>
                      </div>
                    )}
                  </div>

                  {/* Column 3: Right-Side Action Button */}
                  <div className="sm:col-span-3 flex items-center justify-end gap-2 pt-2 sm:pt-0">
                    {isConnected ? (
                      <div className="flex items-center gap-1.5 w-full sm:w-auto">
                        {/* Browse & Watch Button */}
                        <button
                          onClick={() => handleBrowseAndWatch(service)}
                          className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-900/30 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Browse & Watch</span>
                        </button>

                        {/* Disconnect Button */}
                        <button
                          onClick={(e) => handleDisconnect(service.id, service.name, e)}
                          title="Disconnect Account"
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-red-400 border border-white/5 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      /* Connect Now Button */
                      <button
                        onClick={() => handleConnectNow(service)}
                        className={`w-full sm:w-auto px-4 py-2 rounded-xl font-bold text-xs text-white shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all ${
                          service.id === "netflix"
                            ? "bg-gradient-to-r from-[#E50914] to-[#B80710] hover:brightness-110 shadow-red-900/30"
                            : service.id === "prime"
                            ? "bg-gradient-to-r from-[#00A8E1] to-[#0086B3] hover:brightness-110 shadow-cyan-900/30"
                            : "bg-gradient-to-r from-red-600 to-red-700 hover:brightness-110 shadow-red-900/30"
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        <span>Connect Now</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Helper Feature Info Card */}
          <div className="bg-gradient-to-br from-indigo-950/30 via-[#12141F] to-[#12141F] border border-indigo-500/20 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-xl">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white">How Watch Party Works</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                1. Tap <strong>Browse & Watch</strong> on any connected service.
                <br />
                2. Tap the floating <strong>🎉 Watch Party</strong> overlay trigger anytime to Host or Join.
                <br />
                3. Friends on Desktop Chrome Extension or iPad will sync playback instantly with live event logs!
              </p>
            </div>
          </div>
        </main>

        {/* Footer Info */}
        <footer className="pt-4 pb-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>JustUS Cross-Platform Sync Engine</span>
          </div>
          <span>v2.0 • Android / iOS</span>
        </footer>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* IN-APP CONNECTION CONFIRMATION MODAL (Web Fallback)           */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isConnectingModalOpen && pendingService && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12141F] border border-white/15 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-md ${
                  pendingService.id === "netflix"
                    ? "bg-[#E50914]"
                    : pendingService.id === "prime"
                    ? "bg-[#00A8E1]"
                    : "bg-red-600"
                }`}
              >
                {pendingService.id === "netflix" ? "NET" : pendingService.id === "prime" ? "PRIME" : "▶"}
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Connecting {pendingService.name}</h3>
                <p className="text-[11px] text-slate-400">Account Authentication</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 space-y-2 text-xs text-slate-300">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Log in to your <strong>{pendingService.name}</strong> account in the browser, then tap <strong>Confirm Connected</strong> below.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleConfirmLogin(pendingService)}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Confirm Connected ✓</span>
              </button>

              <button
                onClick={() => window.open(pendingService.loginUrl, "_blank")}
                className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs rounded-xl border border-white/10 flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Login Page</span>
              </button>

              <button
                onClick={() => setIsConnectingModalOpen(false)}
                className="w-full py-2 text-slate-500 hover:text-slate-400 text-xs font-medium text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
