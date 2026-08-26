/** Screen wake lock helper shared by SyncEngine. */
export async function setScreenWakeLock(
  enable: boolean,
  sentinelRef: { current: WakeLockSentinel | null }
): Promise<void> {
  try {
    if ("wakeLock" in navigator && typeof navigator.wakeLock?.request === "function") {
      if (enable) {
        if (!sentinelRef.current || sentinelRef.current.released) {
          sentinelRef.current = await navigator.wakeLock.request("screen");
          sentinelRef.current.addEventListener("release", () => {
            sentinelRef.current = null;
          });
        }
      } else if (sentinelRef.current && !sentinelRef.current.released) {
        await sentinelRef.current.release();
        sentinelRef.current = null;
      }
    }
  } catch {
    // Wake lock may be denied when tab is hidden.
  }
}
