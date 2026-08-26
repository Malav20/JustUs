"use client";

import { useEffect, useRef } from "react";

// Track sentinel instance globally in browser context
let wakeLockSentinel: any = null;
let isWakeLockRequested = false;

/**
 * Universal Screen Wake Lock controller:
 * 1. Standard HTML5 Screen Wake Lock API (navigator.wakeLock)
 * 2. iOS WKWebView native bridge (window.webkit.messageHandlers.wakeLock)
 * 3. Android WebView native bridge (window.AndroidWakeLock)
 */
export async function setAppWakeLock(enable: boolean): Promise<void> {
  if (typeof window === "undefined") return;

  isWakeLockRequested = enable;

  // 1. Android Native Bridge
  try {
    const androidBridge = (window as any).AndroidWakeLock;
    if (androidBridge && typeof androidBridge.setKeepScreenOn === "function") {
      androidBridge.setKeepScreenOn(enable);
    }
  } catch (err) {
    console.debug("[JustUS WakeLock] Android bridge error:", err);
  }

  // 2. iOS WKWebView Native Bridge
  try {
    const webkit = (window as any).webkit;
    if (webkit?.messageHandlers?.wakeLock?.postMessage) {
      webkit.messageHandlers.wakeLock.postMessage({ keepAwake: enable });
    }
  } catch (err) {
    console.debug("[JustUS WakeLock] iOS WebKit bridge error:", err);
  }

  // 3. Web Screen Wake Lock API
  try {
    if ("wakeLock" in navigator && typeof (navigator as any).wakeLock?.request === "function") {
      if (enable) {
        if (!wakeLockSentinel || wakeLockSentinel.released) {
          wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
          wakeLockSentinel.addEventListener("release", () => {
            wakeLockSentinel = null;
          });
          console.debug("[JustUS WakeLock] Screen wake lock acquired.");
        }
      } else {
        if (wakeLockSentinel && !wakeLockSentinel.released) {
          await wakeLockSentinel.release();
          wakeLockSentinel = null;
          console.debug("[JustUS WakeLock] Screen wake lock released.");
        }
      }
    }
  } catch (err) {
    console.debug("[JustUS WakeLock] HTML5 wake lock request error:", err);
  }
}

// Auto re-acquire wake lock when tab/app becomes visible if playback is still active
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && isWakeLockRequested) {
      await setAppWakeLock(true);
    }
  });
}

/**
 * React hook to bind screen wake lock to video playback state
 */
export function useWakeLock(isPlaying: boolean) {
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    setAppWakeLock(isPlaying);

    return () => {
      // If unmounting, release wake lock
      setAppWakeLock(false);
    };
  }, [isPlaying]);
}
